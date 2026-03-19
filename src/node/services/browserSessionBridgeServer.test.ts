import { EventEmitter } from "node:events";
import * as http from "node:http";
import type * as net from "node:net";
import { describe, expect, mock, test, type Mock } from "bun:test";
import { WebSocket } from "ws";
import type {
  BrowserFramePayload,
  BrowserSession,
  BrowserSessionEvent,
} from "@/common/types/browserSession";
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
  onSessionEvent: Mock<
    (workspaceId: string, handler: (event: BrowserSessionEvent) => void) => void
  >;
  offSessionEvent: Mock<
    (workspaceId: string, handler: (event: BrowserSessionEvent) => void) => void
  >;
}

class FakeBridgeWebSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public readonly send = mock((_: string) => {
    /* noop */
  });
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

function isTimerCallback(handler: TimerHandler): handler is (...args: unknown[]) => void {
  return typeof handler === "function";
}

function requireHeartbeatCallback(callback: (() => void) | null): () => void {
  if (callback === null) {
    throw new Error("Expected BrowserFrameBridgeServer to register a heartbeat interval");
  }

  return callback;
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
  const sessionEventHandlers = new Map<string, Set<(event: BrowserSessionEvent) => void>>();
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
    onSessionEvent: mock((workspaceId: string, handler: (event: BrowserSessionEvent) => void) => {
      let handlers = sessionEventHandlers.get(workspaceId);
      if (!handlers) {
        handlers = new Set();
        sessionEventHandlers.set(workspaceId, handlers);
      }
      handlers.add(handler);
    }),
    offSessionEvent: mock((workspaceId: string, handler: (event: BrowserSessionEvent) => void) => {
      sessionEventHandlers.get(workspaceId)?.delete(handler);
      if (sessionEventHandlers.get(workspaceId)?.size === 0) {
        sessionEventHandlers.delete(workspaceId);
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
    emitSessionEvent(workspaceId: string, event: BrowserSessionEvent) {
      for (const handler of sessionEventHandlers.get(workspaceId) ?? []) {
        handler(event);
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

async function waitForWebSocketMessage(ws: WebSocket): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const onMessage = (data: string | Buffer | Buffer[] | ArrayBuffer) => {
      cleanup();
      if (typeof data === "string") {
        resolve(data);
        return;
      }
      if (Buffer.isBuffer(data)) {
        resolve(data.toString());
        return;
      }
      if (Array.isArray(data)) {
        resolve(Buffer.concat(data).toString());
        return;
      }
      resolve(Buffer.from(data).toString());
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      ws.off("message", onMessage);
      ws.off("error", onError);
    };

    ws.once("message", onMessage);
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
      expect(await waitForWebSocketClose(ws)).toEqual({
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
      expect(await waitForWebSocketClose(ws)).toEqual({
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
        onFrameEvent: mock(() => {
          /* noop */
        }),
        offFrameEvent: mock(() => {
          /* noop */
        }),
        onSessionEvent: mock(() => {
          /* noop */
        }),
        offSessionEvent: mock(() => {
          /* noop */
        }),
      },
    });
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      expect(await waitForWebSocketClose(ws)).toEqual({
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
        onFrameEvent: mock(() => {
          /* noop */
        }),
        offFrameEvent: mock(() => {
          /* noop */
        }),
        onSessionEvent: mock(() => {
          /* noop */
        }),
        offSessionEvent: mock(() => {
          /* noop */
        }),
      },
    });
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      expect(await waitForWebSocketClose(ws)).toEqual({
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
      if (!isTimerCallback(handler)) {
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

      const fireHeartbeat = requireHeartbeatCallback(heartbeatCallback);
      expect(typeof fireHeartbeat).toBe("function");

      fireHeartbeat();

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
      expect(await bridgeServer.server.stop()).toBeUndefined();
    } finally {
      ws.close();
    }
  });

  test("accepts new upgrades after stop completes", async () => {
    const bridgeServer = createBridgeServer();
    const upgradeHarness = await listenUpgradeServer(bridgeServer.server);
    const expectedInitialFrame = JSON.stringify({
      type: "frame",
      base64Data: "initial-frame",
      metadata: createLiveSession().lastFrameMetadata,
    });

    let firstWs: WebSocket | null = null;
    let secondWs: WebSocket | null = null;
    try {
      firstWs = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      expect(await waitForWebSocketMessage(firstWs)).toBe(expectedInitialFrame);

      const firstClosePromise = waitForWebSocketClose(firstWs);
      await bridgeServer.server.stop();
      const firstCloseEvent = await firstClosePromise;
      expect(firstCloseEvent.reason).toBe("Server stopping");
      expect([1000, 1001]).toContain(firstCloseEvent.code);

      secondWs = new WebSocket(`ws://127.0.0.1:${upgradeHarness.port}/?token=${VALID_TOKEN}`);
      expect(await waitForWebSocketMessage(secondWs)).toBe(expectedInitialFrame);
    } finally {
      secondWs?.close();
      await upgradeHarness.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes stale session connections before forwarding new session frames", async () => {
    let currentSession = createLiveSession();
    const bridgeServer = createBridgeServer();
    bridgeServer.service.getActiveSession.mockImplementation(() => currentSession);
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

      currentSession = createLiveSession({ id: "replacement-session" });
      bridgeServer.emitFrame(VALID_WORKSPACE_ID, {
        base64Data: "replacement-frame",
        metadata: null,
      });

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.close).toHaveBeenCalledWith(4003, "Session mismatch");
      expect(bridgeServer.getHandlerCount(VALID_WORKSPACE_ID)).toBe(0);
    } finally {
      ws.close();
      await bridgeServer.server.stop();
    }
  });

  test("closes connections when the browser session ends without more frames", async () => {
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

      bridgeServer.emitSessionEvent(VALID_WORKSPACE_ID, {
        type: "session-ended",
        workspaceId: VALID_WORKSPACE_ID,
      });

      expect(ws.close).toHaveBeenCalledWith(4002, "No active browser session");
      expect(bridgeServer.getHandlerCount(VALID_WORKSPACE_ID)).toBe(0);
      expect(bridgeServer.service.offSessionEvent).toHaveBeenCalledTimes(1);
    } finally {
      ws.close();
      await bridgeServer.server.stop();
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
