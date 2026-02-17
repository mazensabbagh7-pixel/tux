import type * as AcpSdkTypes from "@agentclientprotocol/sdk";

export type AcpSdk = typeof AcpSdkTypes;

/**
 * Dynamically loads the ESM-only ACP SDK at runtime.
 *
 * We intentionally use Function("return import(...)") so TypeScript does not
 * rewrite dynamic import() into require() under the CommonJS main build.
 */
export async function loadAcpSdk(): Promise<AcpSdk> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return (await new Function("return import('@agentclientprotocol/sdk')")()) as AcpSdk;
}
