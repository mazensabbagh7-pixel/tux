import { createRouterClient } from "@orpc/server";
import { router } from "@/node/orpc/router";
export function createOrpcTestClient(context) {
    return createRouterClient(router(), { context });
}
//# sourceMappingURL=orpcTestClient.js.map