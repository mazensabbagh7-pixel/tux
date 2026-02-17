import { randomBytes } from "crypto";
import type { BrowserWindow } from "electron";
import assert from "@/common/utils/assert";
import { Config } from "@/node/config";
import { createOrpcServer } from "@/node/orpc/server";
import { ServiceContainer } from "@/node/services/serviceContainer";

export interface EmbeddedServerHandle {
  baseUrl: string;
  wsUrl: string;
  token: string;
  close: () => Promise<void>;
}

// Minimal BrowserWindow stub for services that expect one.
const mockWindow: BrowserWindow = {
  isDestroyed: () => false,
  setTitle: () => undefined,
  webContents: {
    send: () => undefined,
    openDevTools: () => undefined,
  },
} as unknown as BrowserWindow;

export async function startEmbeddedServer(): Promise<EmbeddedServerHandle> {
  const config = new Config();
  const services = new ServiceContainer(config);

  let closed = false;
  let server: Awaited<ReturnType<typeof createOrpcServer>> | null = null;

  try {
    await services.initialize();
    services.windowService.setMainWindow(mockWindow);

    const token = randomBytes(32).toString("hex");
    assert(token.length > 0, "Embedded server auth token must not be empty");

    server = await createOrpcServer({
      context: services.toORPCContext(),
      host: "127.0.0.1",
      port: 0,
      authToken: token,
      serveStatic: false,
    });

    const startedServer = server;
    assert(startedServer.baseUrl.length > 0, "Embedded server must expose a baseUrl");
    assert(startedServer.wsUrl.length > 0, "Embedded server must expose a wsUrl");

    return {
      baseUrl: startedServer.baseUrl,
      wsUrl: startedServer.wsUrl,
      token,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;

        services.terminalService.closeAllSessions();
        await services.dispose();
        await services.shutdown();
        await startedServer.close();
      },
    };
  } catch (error) {
    if (server) {
      await server.close().catch(() => undefined);
    }
    await services.dispose().catch(() => undefined);
    await services.shutdown().catch(() => undefined);
    throw error;
  }
}
