import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { BrowserFramePayload, BrowserSessionEvent } from "@/common/types/browserSession";
import { assert } from "@/common/utils/assert";
import { log } from "@/node/services/log";
import type { BrowserSessionService } from "./browserSessionService";
import type { BrowserSessionTokenManager } from "./browserSessionTokenManager";

const INVALID_TOKEN_CLOSE_CODE = 4001;
const MISSING_SESSION_CLOSE_CODE = 4002;
const SESSION_MISMATCH_CLOSE_CODE = 4003;
const SERVER_STOPPING_CLOSE_CODE = 1001;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_BUFFERED_FRAME_BYTES = 1_048_576;
const REQUEST_BASE_URL = "http://localhost";

function createBridgeWebSocketServer(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
}

interface ActiveBrowserConnection {
  ws: WebSocket;
  workspaceId: string;
  frameHandler: (frame: BrowserFramePayload) => void;
  sessionEventHandler: (event: BrowserSessionEvent) => void;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  closed: boolean;
}

export interface BrowserFrameBridgeServerOptions {
  browserSessionService: Pick<
    BrowserSessionService,
    "getActiveSession" | "onFrameEvent" | "offFrameEvent" | "onSessionEvent" | "offSessionEvent"
  >;
  browserSessionTokenManager: Pick<BrowserSessionTokenManager, "validate">;
}

function closeWebSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(code, reason);
      return;
    }

    if (ws.readyState !== WebSocket.CLOSED) {
      ws.terminate();
    }
  } catch (error) {
    log.debug("BrowserFrameBridgeServer: WebSocket close failed", { code, reason, error });
  }
}

function rejectUpgrade(socket: Duplex): void {
  try {
    socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
  } catch (error) {
    log.debug("BrowserFrameBridgeServer: failed to write upgrade rejection response", { error });
  }

  try {
    socket.destroy();
  } catch (error) {
    log.debug("BrowserFrameBridgeServer: failed to destroy rejected upgrade socket", { error });
  }
}

async function waitForWebSocketClose(ws: WebSocket, timeoutMs = 250): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    timeout.unref?.();

    const onClose = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("close", onClose);
    };

    ws.once("close", onClose);
  });
}

export class BrowserFrameBridgeServer {
  private readonly browserSessionService: Pick<
    BrowserSessionService,
    "getActiveSession" | "onFrameEvent" | "offFrameEvent" | "onSessionEvent" | "offSessionEvent"
  >;
  private readonly browserSessionTokenManager: Pick<BrowserSessionTokenManager, "validate">;
  private wss = createBridgeWebSocketServer();
  private readonly activeConnections = new Set<ActiveBrowserConnection>();
  // API server restarts reuse the same bridge instance, so stop() must leave it ready to
  // accept fresh upgrades once the previous WebSocketServer has been drained and closed.
  private isStopping = false;
  private stopPromise: Promise<void> | null = null;

  constructor(options: BrowserFrameBridgeServerOptions) {
    assert(
      options.browserSessionService,
      "BrowserFrameBridgeServer requires a BrowserSessionService"
    );
    assert(
      options.browserSessionTokenManager,
      "BrowserFrameBridgeServer requires a BrowserSessionTokenManager"
    );

    this.browserSessionService = options.browserSessionService;
    this.browserSessionTokenManager = options.browserSessionTokenManager;
  }

  public handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (this.isStopping) {
      log.debug("BrowserFrameBridgeServer: rejecting upgrade while stopping", { url: request.url });
      rejectUpgrade(socket);
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.handleUpgradedConnection(ws, request);
    });
  }

  public async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.isStopping = true;
    const wss = this.wss;
    const stopPromise = (async () => {
      const activeConnections = Array.from(this.activeConnections);
      const trackedWebSockets = new Set(activeConnections.map((connection) => connection.ws));
      const activeConnectionClosePromises = activeConnections.map((connection) =>
        waitForWebSocketClose(connection.ws)
      );

      for (const connection of activeConnections) {
        this.cleanupConnection(connection, {
          closeCode: SERVER_STOPPING_CLOSE_CODE,
          closeReason: "Server stopping",
        });
      }
      await Promise.allSettled(activeConnectionClosePromises);

      const orphanClientClosePromises: Array<Promise<void>> = [];
      for (const ws of wss.clients) {
        if (trackedWebSockets.has(ws)) {
          continue;
        }

        orphanClientClosePromises.push(waitForWebSocketClose(ws));
        closeWebSocket(ws, SERVER_STOPPING_CLOSE_CODE, "Server stopping");
      }
      await Promise.allSettled(orphanClientClosePromises);

      for (const ws of wss.clients) {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.terminate();
        }
      }

      this.activeConnections.clear();

      await new Promise<void>((resolve) => {
        wss.close((error) => {
          if (error) {
            log.debug("BrowserFrameBridgeServer: WebSocket server close returned an error", {
              error,
            });
          }
          resolve();
        });
      });
    })();
    this.stopPromise = stopPromise;

    try {
      await stopPromise;
    } finally {
      this.stopPromise = null;
      this.isStopping = false;
      if (this.wss === wss) {
        this.wss = createBridgeWebSocketServer();
      }
    }
  }

  private handleUpgradedConnection(ws: WebSocket, request: IncomingMessage): void {
    const token = new URL(request.url ?? "/", REQUEST_BASE_URL).searchParams.get("token");
    if (!token) {
      closeWebSocket(ws, INVALID_TOKEN_CLOSE_CODE, "Invalid or expired token");
      return;
    }

    const tokenInfo = this.browserSessionTokenManager.validate(token);
    if (!tokenInfo) {
      closeWebSocket(ws, INVALID_TOKEN_CLOSE_CODE, "Invalid or expired token");
      return;
    }

    assert(
      tokenInfo.workspaceId.trim().length > 0,
      "BrowserFrameBridgeServer requires validated tokens to include a workspaceId"
    );
    assert(
      tokenInfo.sessionId.trim().length > 0,
      "BrowserFrameBridgeServer requires validated tokens to include a sessionId"
    );

    const session = this.browserSessionService.getActiveSession(tokenInfo.workspaceId);
    if (!session) {
      closeWebSocket(ws, MISSING_SESSION_CLOSE_CODE, "No active browser session");
      return;
    }

    if (session.id !== tokenInfo.sessionId) {
      closeWebSocket(ws, SESSION_MISMATCH_CLOSE_CODE, "Session mismatch");
      return;
    }

    const connection: ActiveBrowserConnection = {
      ws,
      workspaceId: tokenInfo.workspaceId,
      frameHandler: (frame) => {
        const currentSession = this.browserSessionService.getActiveSession(tokenInfo.workspaceId);
        if (currentSession?.id !== tokenInfo.sessionId) {
          log.debug("BrowserFrameBridgeServer closing stale session connection", {
            workspaceId: tokenInfo.workspaceId,
            tokenSessionId: tokenInfo.sessionId,
            currentSessionId: currentSession?.id ?? "none",
          });
          this.cleanupConnection(connection, {
            closeCode: SESSION_MISMATCH_CLOSE_CODE,
            closeReason: "Session mismatch",
          });
          return;
        }

        if (ws.readyState !== WebSocket.OPEN) {
          return;
        }

        // Slow consumers can build up a large ws send queue; drop stale frames so the latest
        // screenshot can catch up instead of retaining every intermediate JPEG in memory.
        if (ws.bufferedAmount > MAX_BUFFERED_FRAME_BYTES) {
          log.debug("BrowserFrameBridgeServer skipping frame due to backpressure", {
            workspaceId: tokenInfo.workspaceId,
            bufferedAmount: ws.bufferedAmount,
          });
          return;
        }

        try {
          ws.send(JSON.stringify({ type: "frame", ...frame }));
        } catch (error) {
          log.error("BrowserFrameBridgeServer: failed to forward frame", {
            workspaceId: tokenInfo.workspaceId,
            sessionId: tokenInfo.sessionId,
            error,
          });
          this.cleanupConnection(connection, { closeReason: "frame send failed" });
        }
      },
      sessionEventHandler: (event) => {
        if (event.type !== "session-ended") {
          return;
        }

        log.debug("BrowserFrameBridgeServer closing connection for ended session", {
          workspaceId: tokenInfo.workspaceId,
          sessionId: tokenInfo.sessionId,
        });
        this.cleanupConnection(connection, {
          closeCode: MISSING_SESSION_CLOSE_CODE,
          closeReason: "No active browser session",
        });
      },
      heartbeatInterval: null,
      closed: false,
    };

    this.activeConnections.add(connection);
    this.attachConnectionListeners(connection);
    this.browserSessionService.onFrameEvent(tokenInfo.workspaceId, connection.frameHandler);
    this.browserSessionService.onSessionEvent(
      tokenInfo.workspaceId,
      connection.sessionEventHandler
    );

    try {
      ws.send(
        JSON.stringify({
          type: "frame",
          base64Data: session.lastScreenshotBase64,
          metadata: session.lastFrameMetadata,
        })
      );
    } catch (error) {
      log.error("BrowserFrameBridgeServer: failed to send initial frame snapshot", {
        workspaceId: tokenInfo.workspaceId,
        sessionId: tokenInfo.sessionId,
        error,
      });
      this.cleanupConnection(connection, { closeReason: "initial snapshot send failed" });
      return;
    }

    connection.heartbeatInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        ws.send(JSON.stringify({ type: "heartbeat" }));
      } catch (error) {
        log.error("BrowserFrameBridgeServer: failed to send heartbeat", {
          workspaceId: tokenInfo.workspaceId,
          sessionId: tokenInfo.sessionId,
          error,
        });
        this.cleanupConnection(connection, { closeReason: "heartbeat send failed" });
      }
    }, HEARTBEAT_INTERVAL_MS);
    connection.heartbeatInterval.unref?.();
  }

  private attachConnectionListeners(connection: ActiveBrowserConnection): void {
    connection.ws.on("close", () => {
      this.cleanupConnection(connection, { closeReason: "websocket closed" });
    });

    connection.ws.on("error", (error) => {
      log.error("BrowserFrameBridgeServer: WebSocket bridge failed", {
        workspaceId: connection.workspaceId,
        error,
      });
      this.cleanupConnection(connection, { closeReason: "websocket error" });
    });
  }

  private cleanupConnection(
    connection: ActiveBrowserConnection,
    options: { closeCode?: number; closeReason?: string } = {}
  ): void {
    if (connection.closed) {
      return;
    }

    connection.closed = true;
    this.browserSessionService.offFrameEvent(connection.workspaceId, connection.frameHandler);
    this.browserSessionService.offSessionEvent(
      connection.workspaceId,
      connection.sessionEventHandler
    );
    if (connection.heartbeatInterval !== null) {
      clearInterval(connection.heartbeatInterval);
      connection.heartbeatInterval = null;
    }
    this.activeConnections.delete(connection);

    if (options.closeCode != null) {
      closeWebSocket(connection.ws, options.closeCode, options.closeReason ?? "closing");
      return;
    }

    try {
      if (
        connection.ws.readyState === WebSocket.OPEN ||
        connection.ws.readyState === WebSocket.CONNECTING
      ) {
        connection.ws.close();
        return;
      }

      if (connection.ws.readyState !== WebSocket.CLOSED) {
        connection.ws.terminate();
      }
    } catch (error) {
      log.debug("BrowserFrameBridgeServer: WebSocket cleanup failed", {
        error,
        reason: options.closeReason,
      });
    }
  }
}
