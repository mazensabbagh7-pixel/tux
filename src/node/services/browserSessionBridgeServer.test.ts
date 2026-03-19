import { EventEmitter } from "node:events";
import * as http from "node:http";
import * as net from "node:net";
import { describe, expect, mock, test, type Mock } from "bun:test";
import { WebSocket } from "ws";
import type { BrowserFramePayload, BrowserSession } from "@/common/types/browserSession";
import {
  BrowserFrameBridgeServer,
  type BrowserFrameBridgeServerOptions,
} from "./browserSessionBridgeServer";

const VALID_TOKEN = "valid-token";
const VALID_WORKSPACE_ID = "workspace-1";
const VALID_SESSION_ID = "mux-workspace-1";

interface UpgradeHarness {
  port: number;
  close: () => Promise<void>;
}

interface MockBrowserSessionService {
  getActiveSession: Mock<(workspaceId: string) => BrowserSession | null>;
  onFrameEvent: Mock<(workspaceId: string, handler: (frame: BrowserFramePayload) => void) => void>;
  offFrameEvent: Mock<(workspaceId: string, handler: (frame: BrowserFramePayload) => void) => void>;
}

class FakeBridgeWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public readonly send = mock((_: string) => {});
  public readonly close = mock((code?: number, reason?: string) => {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    this.emit("close", code ?? 1000, Buffer.from(reason ?? ""));
  });
  public readonly terminate = mock(() => {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }

    this.readyState = WebSocket.CLOSED;
    this.emit("close", 1006, Buffer.alloc(0));
  });
}

interface PrivateBrowserFrameBridgeServer {
  handleUpgradedConnection: (ws: WebSocket, request: http.IncomingMessage) => void;
}

function createLiveSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  const now = new Date().toISOString();
  return {
    id: VALID_SESSION_ID,
    workspaceId: VALID_WORKSPACE_ID,
    status: "live",
    currentUrl: "https://example.com",
    title: "Example",
    lastScreenshotBase64: "initial-frame",
    lastError: null,
    streamState: "live",
    lastFrameMetadata: {
      deviceWidth: 1280,
      deviceHeight: 720,
      pageScaleFactor: 1,
      offsetTop: 0,
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    },
    streamErrorMessage: null,
    endReason: null,
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createBridgeServer(overrides?: Partial<BrowserFrameBridgeServerOptions>) {
  const frameHandlers = new Map<string, Set<(frame: BrowserFramePayload) => void>>();
  const service: MockBrowserSessionService = {
    getActiveSession: mock((workspaceId: string) =>
      workspaceId === VALID_WORKSPACE_ID ? createLiveSession() : null
    ),
    onFrameEvent: mock((workspaceId: string, handler: (frame: BrowserFramePayload) => void) => {
      let handlers = frameHandlers.get(workspaceId);
      if (!handlers) {
        handlers = new Set();
        frameHandlers.set(workspaceId, handlers);
      }
      handlers.add(handler);
    }),
    offFrameEvent: mock((workspaceId: string, handler: (frame: BrowserFramePayload) => void) => {
      frameHandlers.get(workspaceId)?.delete(handler);
      if (frameHandlers.get(workspaceId)?.size === 0) {
        frameHandlers.delete(workspaceId);
      }
    }),
  };
  const tokenManager = {
    validate: mock((token: string) =>
      token === VALID_TOKEN
        ? { workspaceId: VALID_WORKSPACE_ID, sessionId: VALID_SESSION_ID }
        : null
    ),
  };
  const server = new BrowserFrameBridgeServer({
    browserSessionService: overrides?.browserSessionService ?? service,
    browserSessionTokenManager: overrides?.browserSessionTokenManager ?? tokenManager,
  });

  return {
    server,
    service,
    tokenManager,
    emitFrame(workspaceId: string, frame: BrowserFramePayload) {
      for (const handler of frameHandlers.get(workspaceId) ?? []) {
        handler(frame);
      }
    },
    getHandlerCount(workspaceId: string) {
      return frameHandlers.get(workspaceId)?.size ?? 0;
    },
  };
}

async function listenUpgradeServer(
  bridgeServer: BrowserFrameBridgeServer
): Promise<UpgradeHarness> {
  const sockets = new Set<net.Socket>();
  const server = http.createServer();

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });
  server.on("upgrade", (request, socket, head) => {
    bridgeServer.handleUpgrade(request, socket, head);
  });
  server.on("clientError", (_error, socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected upgrade test server to expose a numeric port");
  }

  return {
    port: address.port,
    close: async () => {
      server.close();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    },
  };
}

async function waitForWebSocketClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  if (ws.readyState === WebSocket.CLOSED) {
    return { code: 1005, reason: "" };
  }

  return await new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const onClose = (code: number, reason: Buffer) => {
      cleanup();
      resolve({ code, reason: reason.toString() });
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      ws.off("close", onClose);
      ws.off("error", onError);
    };

    ws.once("close", onClose);
    ws.once("error", onError);
  });
}

describe("BrowserFrameBridgeServer", () => {
  test("relays the initial frame snapshot and subsequent frame events", async () => {
    const bridgeServer = createBridgeServer();
    const ws = new FakeBridgeWebSocket();
    const privateBridgeServer = bridgeServer.server as unknown as PrivateBrowserFrameBridgeServer;

    try {
      privateBridgeServer.handleUpgradedConnection(
        ws as unknown as WebSocket,
        {
          url: `/?token=${VALID_TOKEN}`,
        } as http.IncomingMessage
      );

      expect(ws.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify({
          type: "frame",
          base64Data: "initial-frame",
          metadata: createLiveSession().lastFrameMetadata,
        })
      );

      const nextFrame: BrowserFramePayload = {
        base64Data: "next-frame",
        metadata: {
          deviceWidth: 1440,
          deviceHeight: 900,
          pageScaleFactor: 2,
          offsetTop: 24,
          scrollOffsetX: 10,
          scrollOffsetY: 20,
        },
      };
      bridgeServer.emitFrame(VALID_WORKSPACE_ID, nextFrame);

      expect(ws.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify({
          type: "frame",
          ...nextFrame,
        })
      );
    } finally {
      ws.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes with 4001 when the token is missing", async () => {
    const bridgeServer = createBridgeServer();
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/`);
      await expect(waitForWebSocketClose(ws)).resolves.toEqual({
        code: 4001,
        reason: "Invalid or expired token",
      });
    } finally {
      await upgradeHarness.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes with 4001 when the token is invalid", async () => {
    const bridgeServer = createBridgeServer({
      browserSessionTokenManager: {
        validate: mock(() => null),
      },
    });
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=bad-token`);
      await expect(waitForWebSocketClose(ws)).resolves.toEqual({
        code: 4001,
        reason: "Invalid or expired token",
      });
    } finally {
      await upgradeHarness.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes with 4002 when there is no active browser session", async () => {
    const bridgeServer = createBridgeServer({
      browserSessionService: {
        getActiveSession: mock(() => null),
        onFrameEvent: mock(() => {}),
        offFrameEvent: mock(() => {}),
      },
    });
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      await expect(waitForWebSocketClose(ws)).resolves.toEqual({
        code: 4002,
        reason: "No active browser session",
      });
    } finally {
      await upgradeHarness.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes with 4003 when the session id does not match the token", async () => {
    const bridgeServer = createBridgeServer({
      browserSessionService: {
        getActiveSession: mock(() => createLiveSession({ id: "different-session" })),
        onFrameEvent: mock(() => {}),
        offFrameEvent: mock(() => {}),
      },
    });
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      await expect(waitForWebSocketClose(ws)).resolves.toEqual({
        code: 4003,
        reason: "Session mismatch",
      });
    } finally {
      await upgradeHarness.close();
      await bridgeServer.server.stop();
    }
  });

  test("sends heartbeat messages on idle connections", async () => {
    const bridgeServer = createBridgeServer();
    const ws = new FakeBridgeWebSocket();
    const privateBridgeServer = bridgeServer.server as unknown as PrivateBrowserFrameBridgeServer;
    const originalSetInterval = globalThis.setInterval;
    let heartbeatCallback: (() => void) | null = null;

    globalThis.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      expect(delay).toBe(30_000);
      if (typeof handler !== "function") {
        throw new TypeError("Expected BrowserFrameBridgeServer to schedule a function heartbeat");
      }
      heartbeatCallback = () => {
        handler(...args);
      };
      return originalSetInterval(() => undefined, 60_000);
    }) as unknown as typeof globalThis.setInterval;

    try {
      privateBridgeServer.handleUpgradedConnection(
        ws as unknown as WebSocket,
        {
          url: `/?token=${VALID_TOKEN}`,
        } as http.IncomingMessage
      );

      expect(ws.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify({
          type: "frame",
          base64Data: "initial-frame",
          metadata: createLiveSession().lastFrameMetadata,
        })
      );

      const fireHeartbeat: (() => void) | null = heartbeatCallback;
      expect(fireHeartbeat).not.toBeNull();
      if (!fireHeartbeat) {
        throw new Error("Expected BrowserFrameBridgeServer to register a heartbeat interval");
      }

      (fireHeartbeat as () => void)();

      expect(ws.send).toHaveBeenNthCalledWith(2, JSON.stringify({ type: "heartbeat" }));
    } finally {
      globalThis.setInterval = originalSetInterval;
      ws.close();
      await bridgeServer.server.stop();
    }
  });

  test("stop closes active clients with 1001 and is idempotent", async () => {
    const bridgeServer = createBridgeServer();
    const ws = new FakeBridgeWebSocket();
    const privateBridgeServer = bridgeServer.server as unknown as PrivateBrowserFrameBridgeServer;

    try {
      privateBridgeServer.handleUpgradedConnection(
        ws as unknown as WebSocket,
        {
          url: `/?token=${VALID_TOKEN}`,
        } as http.IncomingMessage
      );

      await bridgeServer.server.stop();

      expect(ws.close).toHaveBeenCalledWith(1001, "Server stopping");
      await expect(bridgeServer.server.stop()).resolves.toBeUndefined();
    } finally {
      ws.close();
    }
  });

  test("stops relaying frame events after the client disconnects", async () => {
    const bridgeServer = createBridgeServer();
    const ws = new FakeBridgeWebSocket();
    const privateBridgeServer = bridgeServer.server as unknown as PrivateBrowserFrameBridgeServer;

    try {
      privateBridgeServer.handleUpgradedConnection(
        ws as unknown as WebSocket,
        {
          url: `/?token=${VALID_TOKEN}`,
        } as http.IncomingMessage
      );
      expect(bridgeServer.getHandlerCount(VALID_WORKSPACE_ID)).toBe(1);

      ws.close();
      expect(bridgeServer.getHandlerCount(VALID_WORKSPACE_ID)).toBe(0);

      bridgeServer.emitFrame(VALID_WORKSPACE_ID, {
        base64Data: "after-close",
        metadata: null,
      });
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(bridgeServer.service.offFrameEvent).toHaveBeenCalledTimes(1);
    } finally {
      ws.close();
      await bridgeServer.server.stop();
    }
  });
});
