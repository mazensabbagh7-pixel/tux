import { Command } from "commander";
import assert from "@/common/utils/assert";
import { log, type LogLevel } from "@/node/services/log";
import { getParseOptions } from "./argv";
import { resolveBackend, type ResolveBackendOpts } from "./acp/backendResolver";

interface ACPCLIOptions extends ResolveBackendOpts {
  acpUnstable?: boolean;
  logLevel?: string;
}

const program = new Command();
program
  .name("mux acp")
  .description("Run the ACP stdio bridge")
  .option("--server-url <url>", "mux backend base URL (defaults to lockfile or embedded server)")
  .option("--auth-token <token>", "auth token for the mux backend")
  .option("--acp-unstable", "acknowledge ACP support is unstable")
  .option("--log-level <level>", "set log level: error, warn, info, debug")
  .parse(process.argv, getParseOptions());

const options = program.opts<ACPCLIOptions>();

function setLogLevel(level: string | undefined): void {
  if (!level) {
    return;
  }

  const normalized = level.trim().toLowerCase();
  if (
    normalized === "error" ||
    normalized === "warn" ||
    normalized === "info" ||
    normalized === "debug"
  ) {
    log.setLevel(normalized as LogLevel);
    return;
  }

  throw new Error(`Invalid log level "${level}". Expected: error, warn, info, debug`);
}

function waitForStdinClose(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.destroyed || process.stdin.readableEnded) {
      resolve();
      return;
    }

    const handleStdinDone = () => {
      process.stdin.off("end", handleStdinDone);
      process.stdin.off("close", handleStdinDone);
      resolve();
    };

    process.stdin.once("end", handleStdinDone);
    process.stdin.once("close", handleStdinDone);
    process.stdin.resume();
  });
}

async function main(): Promise<number> {
  setLogLevel(options.logLevel);

  if (!options.acpUnstable) {
    console.error("[mux acp] ACP is experimental. Pass --acp-unstable to acknowledge this mode.");
  }

  const backend = await resolveBackend({
    serverUrl: options.serverUrl,
    authToken: options.authToken,
  });
  assert(backend.baseUrl.length > 0, "Resolved backend must include baseUrl");
  assert(backend.wsUrl.length > 0, "Resolved backend must include wsUrl");

  // Use stderr so this placeholder command does not interfere with future ACP stdio output on stdout.
  console.error(`[mux acp] using ${backend.kind} backend at ${backend.baseUrl}`);

  let exitCode = 0;
  const stopOnSignal = (signalCode: number) => {
    exitCode = signalCode;
    if (!process.stdin.destroyed) {
      process.stdin.destroy();
    }
  };

  const onSigint = () => stopOnSignal(130);
  const onSigterm = () => stopOnSignal(143);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    // Task B will replace this with ACP protocol handling.
    await waitForStdinClose();
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);

    if (backend.kind === "embedded") {
      await backend.close();
    }
  }

  return exitCode;
}

main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mux acp] failed: ${message}`);
    if (error instanceof Error && log.isDebugMode() && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
