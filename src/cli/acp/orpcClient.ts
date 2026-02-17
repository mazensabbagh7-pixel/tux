import { createClient } from "@/common/orpc/client";
import assert from "@/common/utils/assert";
import type { AppRouter } from "@/node/orpc/router";
import type { RouterClient } from "@orpc/server";
import { RPCLink as WebSocketRPCLink } from "@orpc/client/websocket";
import { WebSocket } from "ws";

export interface OrpcWsClientHandle {
  client: RouterClient<AppRouter>;
  close: () => void;
}

function addAuthTokenToWsUrl(wsUrl: string, token: string): string {
  const parsedUrl = new URL(wsUrl);
  assert(parsedUrl.protocol === "ws:" || parsedUrl.protocol === "wss:", "wsUrl must use ws(s)");

  const trimmedToken = token.trim();
  if (trimmedToken.length > 0) {
    parsedUrl.searchParams.set("token", trimmedToken);
  }

  return parsedUrl.toString();
}

function closeWebSocketSafely(socket: WebSocket): void {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
    return;
  }

  socket.close();
}

export function createOrpcWsClient(wsUrl: string, token: string): OrpcWsClientHandle {
  assert(wsUrl.trim().length > 0, "wsUrl is required");

  const socket = new WebSocket(addAuthTokenToWsUrl(wsUrl, token));
  const link = new WebSocketRPCLink({
    // @orpc/client/websocket expects browser WebSocket typing; ws is runtime-compatible in Node.
    websocket: socket as unknown as globalThis.WebSocket,
  });

  return {
    client: createClient(link),
    close: () => closeWebSocketSafely(socket),
  };
}
