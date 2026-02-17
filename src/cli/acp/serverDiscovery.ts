import assert from "@/common/utils/assert";
import { getMuxHome } from "@/common/constants/paths";
import { Config } from "@/node/config";
import { createOrpcServer } from "@/node/orpc/server";
import { ServerLockfile } from "@/node/services/serverLockfile";
import { ServiceContainer } from "@/node/services/serviceContainer";

export interface ServerConnection {
  baseUrl: string;
  authToken: string | undefined;
  /** If we spawned an in-process server, call this to clean up resources. */
  dispose?: () => Promise<void>;
}

export interface DiscoverServerOptions {
  serverUrl?: string;
  authToken?: string;
}

function normalizeOptionalToken(token: string | undefined): string | undefined {
  const trimmed = token?.trim();
  return trimmed?.length ? trimmed : undefined;
}

export async function discoverOrSpawnServer(
  options: DiscoverServerOptions
): Promise<ServerConnection> {
  assert(options != null, "discoverOrSpawnServer options are required");

  // Priority 1: explicit CLI flag
  const explicitServerUrl = options.serverUrl?.trim();
  if (explicitServerUrl) {
    return {
      baseUrl: explicitServerUrl,
      authToken: normalizeOptionalToken(options.authToken ?? process.env.MUX_SERVER_AUTH_TOKEN),
    };
  }

  // Priority 2: environment variables
  const envServerUrl = process.env.MUX_SERVER_URL?.trim();
  if (envServerUrl) {
    return {
      baseUrl: envServerUrl,
      authToken: normalizeOptionalToken(options.authToken ?? process.env.MUX_SERVER_AUTH_TOKEN),
    };
  }

  // Priority 3: lockfile discovery
  try {
    const lockfile = new ServerLockfile(getMuxHome());
    const data = await lockfile.read();
    if (data) {
      assert(data.baseUrl.trim().length > 0, "Server lockfile baseUrl must not be empty");
      return {
        baseUrl: data.baseUrl,
        authToken: normalizeOptionalToken(options.authToken ?? data.token),
      };
    }
  } catch {
    // Ignore discovery errors and fallback to spawning.
  }

  // Priority 4: spawn in-process server
  return spawnInProcessServer();
}

async function spawnInProcessServer(): Promise<ServerConnection> {
  const config = new Config();
  const container = new ServiceContainer(config);
  await container.initialize();

  let server: Awaited<ReturnType<typeof createOrpcServer>>;
  try {
    server = await createOrpcServer({
      host: "127.0.0.1",
      port: 0,
      context: container.toORPCContext(),
    });
  } catch (error) {
    await container.dispose().catch(() => undefined);
    throw error;
  }

  assert(server.baseUrl.trim().length > 0, "In-process server returned an empty baseUrl");

  let disposed = false;

  return {
    baseUrl: server.baseUrl,
    authToken: undefined,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;

      const [serverCloseResult, containerDisposeResult] = await Promise.allSettled([
        server.close(),
        container.dispose(),
      ]);

      if (serverCloseResult.status === "rejected") {
        throw serverCloseResult.reason;
      }

      if (containerDisposeResult.status === "rejected") {
        throw containerDisposeResult.reason;
      }
    },
  };
}
