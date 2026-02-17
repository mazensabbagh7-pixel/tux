import { describe, expect, it, mock } from "bun:test";
import { createStartCoderOnUnarchiveHook, createStopCoderOnArchiveHook, } from "./coderLifecycleHooks";
import { Ok } from "@/common/types/result";
function createSshCoderMetadata(overrides) {
    return {
        id: "ws",
        name: "ws",
        projectName: "proj",
        projectPath: "/tmp/proj",
        runtimeConfig: {
            type: "ssh",
            host: "coder://",
            srcBaseDir: "~/mux",
            coder: {
                workspaceName: "mux-ws",
            },
        },
        ...overrides,
    };
}
describe("createStopCoderOnArchiveHook", () => {
    it("does nothing when stop-on-archive is disabled", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "running" }));
        const stopWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            stopWorkspace,
        };
        const hook = createStopCoderOnArchiveHook({
            coderService,
            shouldStopOnArchive: () => false,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata(),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(0);
        expect(stopWorkspace).toHaveBeenCalledTimes(0);
    });
    it("does nothing when connected to an existing Coder workspace", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "running" }));
        const stopWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            stopWorkspace,
        };
        const hook = createStopCoderOnArchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata({
                runtimeConfig: {
                    type: "ssh",
                    host: "coder://",
                    srcBaseDir: "~/mux",
                    coder: { workspaceName: "mux-ws", existingWorkspace: true },
                },
            }),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(0);
        expect(stopWorkspace).toHaveBeenCalledTimes(0);
    });
    it("stops a running dedicated Coder workspace", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "running" }));
        const stopWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            stopWorkspace,
        };
        const hook = createStopCoderOnArchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
            timeoutMs: 1234,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata({
                runtimeConfig: {
                    type: "ssh",
                    host: "coder://",
                    srcBaseDir: "~/mux",
                    coder: { workspaceName: "mux-ws" },
                },
            }),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(1);
        expect(getWorkspaceStatus).toHaveBeenCalledWith("mux-ws", expect.any(Object));
        const statusOptions = getWorkspaceStatus.mock.calls[0]?.[1];
        expect(typeof statusOptions.timeoutMs).toBe("number");
        expect(statusOptions.timeoutMs).toBeGreaterThan(0);
        expect(stopWorkspace).toHaveBeenCalledTimes(1);
        expect(stopWorkspace).toHaveBeenCalledWith("mux-ws", { timeoutMs: 1234 });
    });
});
describe("createStartCoderOnUnarchiveHook", () => {
    it("does nothing when stop-on-archive is disabled", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "stopped" }));
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => false,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata(),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(0);
        expect(startWorkspace).toHaveBeenCalledTimes(0);
    });
    it("does nothing when connected to an existing Coder workspace", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "stopped" }));
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata({
                runtimeConfig: {
                    type: "ssh",
                    host: "coder://",
                    srcBaseDir: "~/mux",
                    coder: { workspaceName: "mux-ws", existingWorkspace: true },
                },
            }),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(0);
        expect(startWorkspace).toHaveBeenCalledTimes(0);
    });
    it("starts a stopped dedicated Coder workspace", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "stopped" }));
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
            timeoutMs: 1234,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata({
                runtimeConfig: {
                    type: "ssh",
                    host: "coder://",
                    srcBaseDir: "~/mux",
                    coder: { workspaceName: "mux-ws" },
                },
            }),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(1);
        expect(getWorkspaceStatus).toHaveBeenCalledWith("mux-ws", expect.any(Object));
        const statusOptions = getWorkspaceStatus.mock.calls[0]?.[1];
        expect(typeof statusOptions.timeoutMs).toBe("number");
        expect(statusOptions.timeoutMs).toBeGreaterThan(0);
        expect(startWorkspace).toHaveBeenCalledTimes(1);
        expect(startWorkspace).toHaveBeenCalledWith("mux-ws", { timeoutMs: 1234 });
    });
    it("waits for stopping workspace to become stopped before starting", async () => {
        let pollCount = 0;
        const getWorkspaceStatus = mock(() => {
            pollCount++;
            if (pollCount === 1) {
                return Promise.resolve({ kind: "ok", status: "stopping" });
            }
            return Promise.resolve({ kind: "ok", status: "stopped" });
        });
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
            timeoutMs: 1234,
            stoppingPollIntervalMs: 0,
            stoppingWaitTimeoutMs: 1000,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata(),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(2);
        expect(startWorkspace).toHaveBeenCalledTimes(1);
        expect(startWorkspace).toHaveBeenCalledWith("mux-ws", { timeoutMs: 1234 });
    });
    it("does nothing when workspace is already running or starting", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "ok", status: "running" }));
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata(),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(1);
        expect(startWorkspace).toHaveBeenCalledTimes(0);
    });
    it("treats not_found status as success", async () => {
        const getWorkspaceStatus = mock(() => Promise.resolve({ kind: "not_found" }));
        const startWorkspace = mock(() => Promise.resolve(Ok(undefined)));
        const coderService = {
            getWorkspaceStatus,
            startWorkspace,
        };
        const hook = createStartCoderOnUnarchiveHook({
            coderService,
            shouldStopOnArchive: () => true,
        });
        const result = await hook({
            workspaceId: "ws",
            workspaceMetadata: createSshCoderMetadata(),
        });
        expect(result.success).toBe(true);
        expect(getWorkspaceStatus).toHaveBeenCalledTimes(1);
        expect(startWorkspace).toHaveBeenCalledTimes(0);
    });
});
//# sourceMappingURL=coderLifecycleHooks.test.js.map