import { useEffect, useRef, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
import { getBrowserBackendBaseUrl } from "@/browser/utils/backendBaseUrl";
import type { BrowserFrameMetadata, BrowserFramePayload } from "@/common/types/browserSession";
import assert from "@/common/utils/assert";
import { getErrorMessage } from "@/common/utils/errors";

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const FRAME_STALE_AFTER_MS = 10_000;

interface UseBrowserFrameStreamResult {
  screenshotSrc: string | null;
  metadata: BrowserFrameMetadata | null;
  connected: boolean;
  frameStale: boolean;
}

type BrowserFrameBridgeMessage = ({ type: "frame" } & BrowserFramePayload) | { type: "heartbeat" };

function assertBrowserFrame(condition: unknown, message: string): asserts condition {
  assert(condition, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBrowserFrameMetadata(value: unknown): value is BrowserFrameMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isFinite(value.deviceWidth) &&
    Number.isFinite(value.deviceHeight) &&
    Number.isFinite(value.pageScaleFactor) &&
    Number.isFinite(value.offsetTop) &&
    Number.isFinite(value.scrollOffsetX) &&
    Number.isFinite(value.scrollOffsetY)
  );
}

function parseBrowserFrameBridgeMessage(data: unknown): BrowserFrameBridgeMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "heartbeat") {
      return { type: "heartbeat" };
    }

    if (parsed.type !== "frame") {
      return null;
    }

    if (parsed.base64Data !== null && typeof parsed.base64Data !== "string") {
      return null;
    }

    if (parsed.metadata !== null && !isBrowserFrameMetadata(parsed.metadata)) {
      return null;
    }

    return {
      type: "frame",
      base64Data: parsed.base64Data,
      metadata: parsed.metadata,
    };
  } catch {
    return null;
  }
}

function getBrowserFrameBridgeBaseUrl(): string {
  const backendUrl = getBrowserBackendBaseUrl();
  if (!backendUrl || backendUrl === "null" || backendUrl.startsWith("file:")) {
    return "http://localhost";
  }

  try {
    const origin = new URL(backendUrl).origin;
    if (origin && origin !== "null") {
      return backendUrl;
    }
  } catch {
    // Packaged Electron can surface opaque or otherwise non-URL backend base strings.
    // Fall back to localhost so the browser frame bridge still connects through the preload backend.
  }

  return "http://localhost";
}

function buildBrowserFrameBridgeUrl(
  bridgePath: string,
  token: string,
  localBridgeBaseUrl?: string
): string {
  assertBrowserFrame(bridgePath.length > 0, "Bootstrap response missing bridgePath");
  assertBrowserFrame(token.length > 0, "Bootstrap response missing token");

  const isDesktop = typeof window.api !== "undefined";
  const baseUrl =
    isDesktop && typeof localBridgeBaseUrl === "string" && localBridgeBaseUrl.length > 0
      ? localBridgeBaseUrl
      : getBrowserFrameBridgeBaseUrl();
  const fullUrl = baseUrl.endsWith("/")
    ? baseUrl + bridgePath.replace(/^\//, "")
    : baseUrl + bridgePath;
  const wsUrl = new URL(fullUrl);
  wsUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("token", token);
  return wsUrl.toString();
}

function buildScreenshotSrc(base64Data: string | null): string | null {
  if (typeof base64Data !== "string" || base64Data.length === 0) {
    return null;
  }

  return `data:image/jpeg;base64,${base64Data}`;
}

function closeWebSocketSafely(ws: WebSocket): void {
  try {
    if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      return;
    }
    ws.close();
  } catch {
    // Native WebSocket teardown can race with browser close handling; treat cleanup as idempotent.
  }
}

export function useBrowserFrameStream(
  workspaceId: string,
  sessionActive: boolean
): UseBrowserFrameStreamResult {
  assertBrowserFrame(workspaceId.trim().length > 0, "Browser frame stream requires a workspaceId");

  const { api } = useAPI();
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<BrowserFrameMetadata | null>(null);
  const [connected, setConnected] = useState(false);
  const [frameStale, setFrameStale] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleFrameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const generationRef = useRef(0);
  const isDisposedRef = useRef(false);
  const hasEverConnectedRef = useRef(false);
  const lastEventAtRef = useRef(0);

  const connectImplRef = useRef<() => void>(() => undefined);
  const disconnectImplRef = useRef<() => void>(() => undefined);
  const connectHandleRef = useRef<() => void>(() => connectImplRef.current());
  const scheduleReconnectRef = useRef<() => void>(() => undefined);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearStaleFrameTimer = () => {
    if (staleFrameTimerRef.current) {
      clearTimeout(staleFrameTimerRef.current);
      staleFrameTimerRef.current = null;
    }
  };

  const markFrameFresh = () => {
    const frameReceivedAt = Date.now();
    lastEventAtRef.current = frameReceivedAt;
    setFrameStale(false);
    clearStaleFrameTimer();
    staleFrameTimerRef.current = setTimeout(() => {
      if (lastEventAtRef.current !== frameReceivedAt || isDisposedRef.current) {
        return;
      }
      setFrameStale(true);
    }, FRAME_STALE_AFTER_MS);
  };

  const disconnectCurrentWebSocket = () => {
    const currentWebSocket = websocketRef.current;
    websocketRef.current = null;
    if (!currentWebSocket) {
      return;
    }

    closeWebSocketSafely(currentWebSocket);
  };

  scheduleReconnectRef.current = () => {
    if (isDisposedRef.current || !sessionActive) {
      return;
    }

    clearReconnectTimer();
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** attemptRef.current,
      RECONNECT_MAX_DELAY_MS
    );
    attemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (isDisposedRef.current || !sessionActive) {
        return;
      }
      connectHandleRef.current();
    }, delay);
  };

  disconnectImplRef.current = () => {
    isDisposedRef.current = true;
    generationRef.current += 1;
    clearReconnectTimer();
    clearStaleFrameTimer();
    attemptRef.current = 0;
    disconnectCurrentWebSocket();
    lastEventAtRef.current = 0;
    setConnected(false);
    setFrameStale(false);
    setScreenshotSrc(null);
    setMetadata(null);
  };

  connectImplRef.current = () => {
    if (!sessionActive) {
      disconnectImplRef.current();
      return;
    }

    void (async () => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      isDisposedRef.current = false;
      clearReconnectTimer();
      clearStaleFrameTimer();
      disconnectCurrentWebSocket();
      lastEventAtRef.current = 0;
      setConnected(false);
      setFrameStale(false);
      setScreenshotSrc(null);
      setMetadata(null);

      if (!api) {
        // The Browser tab can render before the API client finishes reconnecting, so retry
        // instead of wedging frame streaming in a permanent disconnected state.
        scheduleReconnectRef.current();
        return;
      }

      try {
        const result = await api.browserSession.getFrameStreamBootstrap({ workspaceId });
        if (generationRef.current !== generation || isDisposedRef.current) {
          return;
        }

        if (!result.available) {
          // Always retry on unavailability — transient startup races or backend
          // readiness delays should not strand frame streaming permanently.
          scheduleReconnectRef.current();
          return;
        }

        assertBrowserFrame(
          typeof WebSocket !== "undefined",
          "Browser frame streaming requires WebSocket support"
        );
        const wsUrl = buildBrowserFrameBridgeUrl(
          result.bridgePath,
          result.token,
          result.localBridgeBaseUrl
        );
        const websocket = new WebSocket(wsUrl);
        websocketRef.current = websocket;

        const handleOpen = () => {
          if (generationRef.current !== generation || isDisposedRef.current) {
            return;
          }
          hasEverConnectedRef.current = true;
          attemptRef.current = 0;
          setConnected(true);
        };

        const handleMessage = (event: MessageEvent<unknown>) => {
          if (generationRef.current !== generation || isDisposedRef.current) {
            return;
          }

          const message = parseBrowserFrameBridgeMessage(event.data);
          if (!message) {
            console.warn("[useBrowserFrameStream] Ignoring unexpected bridge message payload");
            return;
          }

          if (message.type === "heartbeat") {
            return;
          }

          markFrameFresh();
          setScreenshotSrc(buildScreenshotSrc(message.base64Data));
          setMetadata(message.metadata);
        };

        const handleError = () => {
          if (generationRef.current !== generation || isDisposedRef.current) {
            return;
          }

          console.warn("[useBrowserFrameStream] Browser frame bridge WebSocket error");
          closeWebSocketSafely(websocket);
        };

        const handleClose = () => {
          if (generationRef.current !== generation || isDisposedRef.current) {
            return;
          }

          if (websocketRef.current === websocket) {
            websocketRef.current = null;
          }
          clearStaleFrameTimer();
          lastEventAtRef.current = 0;
          setConnected(false);
          setFrameStale(false);
          setScreenshotSrc(null);
          setMetadata(null);
          scheduleReconnectRef.current();
        };

        websocket.addEventListener("open", handleOpen);
        websocket.addEventListener("message", handleMessage);
        websocket.addEventListener("error", handleError);
        websocket.addEventListener("close", handleClose);
      } catch (error) {
        if (generationRef.current !== generation || isDisposedRef.current) {
          return;
        }

        console.warn(
          "[useBrowserFrameStream] Failed to connect browser frame bridge:",
          getErrorMessage(error)
        );
        clearStaleFrameTimer();
        lastEventAtRef.current = 0;
        setConnected(false);
        setFrameStale(false);
        setScreenshotSrc(null);
        setMetadata(null);
        // Always retry — transient errors during initial connect should not
        // strand frame streaming permanently.
        scheduleReconnectRef.current();
      }
    })();
  };

  useEffect(() => {
    if (!sessionActive) {
      disconnectImplRef.current();
      return;
    }

    connectHandleRef.current();
    return () => {
      disconnectImplRef.current();
    };
  }, [api, sessionActive, workspaceId]);

  useEffect(() => {
    return () => {
      disconnectImplRef.current();
    };
  }, []);

  return {
    screenshotSrc,
    metadata,
    connected,
    frameStale,
  };
}
