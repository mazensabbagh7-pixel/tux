import { describe, expect, test } from "bun:test";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { getToolsForModel } from "./tools";
describe("getToolsForModel", () => {
    test("only includes agent_report when enableAgentReport=true", async () => {
        const runtime = new LocalRuntime(process.cwd());
        const initStateManager = {
            waitForInit: () => Promise.resolve(),
        };
        const toolsWithoutReport = await getToolsForModel("noop:model", {
            cwd: process.cwd(),
            runtime,
            runtimeTempDir: "/tmp",
            enableAgentReport: false,
        }, "ws-1", initStateManager);
        expect(toolsWithoutReport.agent_report).toBeUndefined();
        const toolsWithReport = await getToolsForModel("noop:model", {
            cwd: process.cwd(),
            runtime,
            runtimeTempDir: "/tmp",
            enableAgentReport: true,
        }, "ws-1", initStateManager);
        expect(toolsWithReport.agent_report).toBeDefined();
    });
});
//# sourceMappingURL=tools.test.js.map