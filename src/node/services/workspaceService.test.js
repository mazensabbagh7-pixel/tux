import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { WorkspaceService } from "./workspaceService";
import { WorkspaceLifecycleHooks } from "./workspaceLifecycleHooks";
import { EventEmitter } from "events";
import * as fsPromises from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Err, Ok } from "@/common/types/result";
import { createTestHistoryService } from "./testHistoryService";
import { MUX_HELP_CHAT_WORKSPACE_ID } from "@/common/constants/muxChat";
import * as runtimeFactory from "@/node/runtime/runtimeFactory";
// Helper to access private renamingWorkspaces set
function addToRenamingWorkspaces(service, workspaceId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    service.renamingWorkspaces.add(workspaceId);
}
// Helper to access private archivingWorkspaces set
function addToArchivingWorkspaces(service, workspaceId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    service.archivingWorkspaces.add(workspaceId);
}
async function withTempMuxRoot(fn) {
    const originalMuxRoot = process.env.MUX_ROOT;
    const tempRoot = await fsPromises.mkdtemp(path.join(tmpdir(), "mux-plan-"));
    process.env.MUX_ROOT = tempRoot;
    try {
        return await fn(tempRoot);
    }
    finally {
        if (originalMuxRoot === undefined) {
            delete process.env.MUX_ROOT;
        }
        else {
            process.env.MUX_ROOT = originalMuxRoot;
        }
        await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
}
async function writePlanFile(root, projectName, workspaceName) {
    const planDir = path.join(root, "plans", projectName);
    await fsPromises.mkdir(planDir, { recursive: true });
    const planFile = path.join(planDir, `${workspaceName}.md`);
    await fsPromises.writeFile(planFile, "# Plan\n");
    return planFile;
}
// NOTE: This test file uses bun:test mocks (not Jest).
const mockInitStateManager = {
    on: mock(() => undefined),
    getInitState: mock(() => undefined),
    waitForInit: mock(() => Promise.resolve()),
    clearInMemoryState: mock(() => undefined),
};
const mockExtensionMetadataService = {};
const mockBackgroundProcessManager = {
    cleanup: mock(() => Promise.resolve()),
};
describe("WorkspaceService rename lock", () => {
    let workspaceService;
    let mockAIService;
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        // Create minimal mocks for the services
        mockAIService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve({ success: false, error: "not found" })),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        const mockConfig = {
            srcDir: "/tmp/test",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
        };
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock(() => undefined),
        };
        const mockExtensionMetadataService = {};
        const mockBackgroundProcessManager = {
            cleanup: mock(() => Promise.resolve()),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("sendMessage returns error when workspace is being renamed", async () => {
        const workspaceId = "test-workspace";
        addToRenamingWorkspaces(workspaceService, workspaceId);
        const result = await workspaceService.sendMessage(workspaceId, "test message", {
            model: "test-model",
            agentId: "exec",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const error = result.error;
            // Error is SendMessageError which has a discriminated union
            expect(typeof error === "object" && error.type === "unknown").toBe(true);
            if (typeof error === "object" && error.type === "unknown") {
                expect(error.raw).toContain("being renamed");
            }
        }
    });
    test("resumeStream returns error when workspace is being renamed", async () => {
        const workspaceId = "test-workspace";
        addToRenamingWorkspaces(workspaceService, workspaceId);
        const result = await workspaceService.resumeStream(workspaceId, {
            model: "test-model",
            agentId: "exec",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            const error = result.error;
            // Error is SendMessageError which has a discriminated union
            expect(typeof error === "object" && error.type === "unknown").toBe(true);
            if (typeof error === "object" && error.type === "unknown") {
                expect(error.raw).toContain("being renamed");
            }
        }
    });
    test("rename returns error when workspace is streaming", async () => {
        const workspaceId = "test-workspace";
        // Mock isStreaming to return true
        mockAIService.isStreaming.mockReturnValue(true);
        const result = await workspaceService.rename(workspaceId, "new-name");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("stream is active");
        }
    });
});
describe("WorkspaceService executeBash archive guards", () => {
    let workspaceService;
    let waitForInitMock;
    let getWorkspaceMetadataMock;
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        waitForInitMock = mock(() => Promise.resolve());
        getWorkspaceMetadataMock = mock(() => Promise.resolve({ success: false, error: "not found" }));
        const aiService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: getWorkspaceMetadataMock,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        const mockConfig = {
            srcDir: "/tmp/test",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
            getProjectSecrets: mock(() => []),
        };
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock(() => undefined),
            waitForInit: waitForInitMock,
        };
        const mockExtensionMetadataService = {};
        const mockBackgroundProcessManager = {
            cleanup: mock(() => Promise.resolve()),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("archived workspace => executeBash returns error mentioning archived", async () => {
        const workspaceId = "ws-archived";
        const archivedMetadata = {
            id: workspaceId,
            name: "ws",
            projectName: "proj",
            projectPath: "/tmp/proj",
            runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
            archivedAt: "2026-01-01T00:00:00.000Z",
        };
        getWorkspaceMetadataMock.mockReturnValue(Promise.resolve(Ok(archivedMetadata)));
        const result = await workspaceService.executeBash(workspaceId, "echo hello");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("archived");
        }
        // This must happen before init/runtime operations.
        expect(waitForInitMock).toHaveBeenCalledTimes(0);
    });
    test("archiving workspace => executeBash returns error mentioning being archived", async () => {
        const workspaceId = "ws-archiving";
        addToArchivingWorkspaces(workspaceService, workspaceId);
        const result = await workspaceService.executeBash(workspaceId, "echo hello");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain("being archived");
        }
        expect(waitForInitMock).toHaveBeenCalledTimes(0);
        expect(getWorkspaceMetadataMock).toHaveBeenCalledTimes(0);
    });
});
describe("WorkspaceService post-compaction metadata refresh", () => {
    let workspaceService;
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        const aiService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve({ success: false, error: "not found" })),
            on(_eventName, _listener) {
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
        };
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        const mockConfig = {
            srcDir: "/tmp/test",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
        };
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock(() => undefined),
        };
        const mockExtensionMetadataService = {};
        const mockBackgroundProcessManager = {
            cleanup: mock(() => Promise.resolve()),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("returns expanded plan path for local runtimes", async () => {
        await withTempMuxRoot(async (muxRoot) => {
            const workspaceId = "ws-plan-path";
            const workspaceName = "plan-workspace";
            const projectName = "cmux";
            const planFile = await writePlanFile(muxRoot, projectName, workspaceName);
            const fakeMetadata = {
                id: workspaceId,
                name: workspaceName,
                projectName,
                projectPath: "/tmp/proj",
                namedWorkspacePath: "/tmp/proj/plan-workspace",
                runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
            };
            const svc = workspaceService;
            svc.getInfo = mock(() => Promise.resolve(fakeMetadata));
            const result = await workspaceService.getPostCompactionState(workspaceId);
            expect(result.planPath).toBe(planFile);
            expect(result.planPath?.startsWith("~")).toBe(false);
        });
    });
    test("debounces multiple refresh requests into a single metadata emit", async () => {
        const workspaceId = "ws-post-compaction";
        const emitMetadata = mock(() => undefined);
        const svc = workspaceService;
        svc.sessions.set(workspaceId, { emitMetadata });
        const fakeMetadata = {
            id: workspaceId,
            name: "ws",
            projectName: "proj",
            projectPath: "/tmp/proj",
            namedWorkspacePath: "/tmp/proj/ws",
            runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
        };
        const getInfoMock = mock(() => Promise.resolve(fakeMetadata));
        const postCompactionState = {
            planPath: "~/.mux/plans/cmux/plan.md",
            trackedFilePaths: ["/tmp/proj/file.ts"],
            excludedItems: [],
        };
        const getPostCompactionStateMock = mock(() => Promise.resolve(postCompactionState));
        svc.getInfo = getInfoMock;
        svc.getPostCompactionState = getPostCompactionStateMock;
        svc.schedulePostCompactionMetadataRefresh(workspaceId);
        svc.schedulePostCompactionMetadataRefresh(workspaceId);
        svc.schedulePostCompactionMetadataRefresh(workspaceId);
        // Debounce is short, but use a safe buffer.
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(getInfoMock).toHaveBeenCalledTimes(1);
        expect(getPostCompactionStateMock).toHaveBeenCalledTimes(1);
        expect(emitMetadata).toHaveBeenCalledTimes(1);
        const enriched = emitMetadata.mock.calls[0][0];
        expect(enriched.postCompaction?.planPath).toBe(postCompactionState.planPath);
    });
});
describe("WorkspaceService maybePersistAISettingsFromOptions", () => {
    let workspaceService;
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        const aiService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve({ success: false, error: "nope" })),
            on(_eventName, _listener) {
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
        };
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        const mockConfig = {
            srcDir: "/tmp/test",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
        };
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock(() => undefined),
        };
        const mockExtensionMetadataService = {};
        const mockBackgroundProcessManager = {
            cleanup: mock(() => Promise.resolve()),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("persists agent AI settings for custom agent", async () => {
        const persistSpy = mock(() => Promise.resolve({ success: true, data: true }));
        const svc = workspaceService;
        svc.persistWorkspaceAISettingsForAgent = persistSpy;
        await svc.maybePersistAISettingsFromOptions("ws", {
            agentId: "reviewer",
            model: "openai:gpt-4o-mini",
            thinkingLevel: "off",
        }, "send");
        expect(persistSpy).toHaveBeenCalledTimes(1);
    });
    test("persists agent AI settings when agentId matches", async () => {
        const persistSpy = mock(() => Promise.resolve({ success: true, data: true }));
        const svc = workspaceService;
        svc.persistWorkspaceAISettingsForAgent = persistSpy;
        await svc.maybePersistAISettingsFromOptions("ws", {
            agentId: "exec",
            model: "openai:gpt-4o-mini",
            thinkingLevel: "off",
        }, "send");
        expect(persistSpy).toHaveBeenCalledTimes(1);
    });
});
describe("WorkspaceService remove timing rollup", () => {
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("waits for stream-abort before rolling up session timing", async () => {
        const workspaceId = "child-ws";
        const parentWorkspaceId = "parent-ws";
        const tempRoot = await fsPromises.mkdtemp(path.join(tmpdir(), "mux-remove-"));
        try {
            const sessionRoot = path.join(tempRoot, "sessions");
            await fsPromises.mkdir(path.join(sessionRoot, workspaceId), { recursive: true });
            let abortEmitted = false;
            let rollUpSawAbort = false;
            class FakeAIService extends EventEmitter {
                constructor() {
                    super(...arguments);
                    this.isStreaming = mock(() => true);
                    this.stopStream = mock(() => {
                        setTimeout(() => {
                            abortEmitted = true;
                            this.emit("stream-abort", {
                                type: "stream-abort",
                                workspaceId,
                                messageId: "msg",
                                abortReason: "system",
                                metadata: { duration: 123 },
                                abandonPartial: true,
                            });
                        }, 0);
                        return Promise.resolve({ success: true, data: undefined });
                    });
                    this.getWorkspaceMetadata = mock(() => Promise.resolve({
                        success: true,
                        data: {
                            id: workspaceId,
                            name: "child",
                            projectPath: "/tmp/proj",
                            runtimeConfig: { type: "local" },
                            parentWorkspaceId,
                        },
                    }));
                }
            }
            const aiService = new FakeAIService();
            const mockConfig = {
                srcDir: "/tmp/src",
                getSessionDir: mock((id) => path.join(sessionRoot, id)),
                removeWorkspace: mock(() => Promise.resolve()),
                findWorkspace: mock(() => null),
            };
            const timingService = {
                waitForIdle: mock(() => Promise.resolve()),
                rollUpTimingIntoParent: mock(() => {
                    rollUpSawAbort = abortEmitted;
                    return Promise.resolve({ didRollUp: true });
                }),
            };
            const workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager, undefined, // sessionUsageService
            undefined, // policyService
            undefined, // telemetryService
            undefined, // experimentsService
            timingService);
            const removeResult = await workspaceService.remove(workspaceId, true);
            expect(removeResult.success).toBe(true);
            expect(mockInitStateManager.clearInMemoryState).toHaveBeenCalledWith(workspaceId);
            expect(rollUpSawAbort).toBe(true);
        }
        finally {
            await fsPromises.rm(tempRoot, { recursive: true, force: true });
        }
    });
});
describe("WorkspaceService archive lifecycle hooks", () => {
    const workspaceId = "ws-archive";
    const projectPath = "/tmp/project";
    const workspacePath = "/tmp/project/ws-archive";
    let workspaceService;
    let mockAIService;
    let configState;
    let editConfigSpy;
    let historyService;
    let cleanupHistory;
    const workspaceMetadata = {
        id: workspaceId,
        name: "ws-archive",
        projectName: "proj",
        projectPath,
        runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
    };
    beforeEach(async () => {
        configState = {
            projects: new Map([
                [
                    projectPath,
                    {
                        workspaces: [
                            {
                                path: workspacePath,
                                id: workspaceId,
                            },
                        ],
                    },
                ],
            ]),
        };
        editConfigSpy = mock((fn) => {
            configState = fn(configState);
            return Promise.resolve();
        });
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        const mockConfig = {
            srcDir: "/tmp/src",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock((id) => {
                if (id !== workspaceId) {
                    return null;
                }
                return { projectPath, workspacePath };
            }),
            editConfig: editConfigSpy,
            getAllWorkspaceMetadata: mock(() => Promise.resolve([])),
        };
        mockAIService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve(Ok(workspaceMetadata))),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("returns Err and does not persist archivedAt when beforeArchive hook fails", async () => {
        const hooks = new WorkspaceLifecycleHooks();
        hooks.registerBeforeArchive(() => Promise.resolve(Err("hook failed")));
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe("hook failed");
        }
        expect(editConfigSpy).toHaveBeenCalledTimes(0);
        const entry = configState.projects.get(projectPath)?.workspaces[0];
        expect(entry?.archivedAt).toBeUndefined();
    });
    test("does not interrupt an active stream when beforeArchive hook fails", async () => {
        const hooks = new WorkspaceLifecycleHooks();
        hooks.registerBeforeArchive(() => Promise.resolve(Err("hook failed")));
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        mockAIService.isStreaming.mockReturnValue(true);
        const interruptStreamSpy = mock(() => Promise.resolve(Ok(undefined)));
        workspaceService.interruptStream =
            interruptStreamSpy;
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(false);
        expect(interruptStreamSpy).toHaveBeenCalledTimes(0);
    });
    test("persists archivedAt when beforeArchive hooks succeed", async () => {
        const hooks = new WorkspaceLifecycleHooks();
        hooks.registerBeforeArchive(() => Promise.resolve(Ok(undefined)));
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(true);
        expect(editConfigSpy).toHaveBeenCalledTimes(1);
        const entry = configState.projects.get(projectPath)?.workspaces[0];
        expect(entry?.archivedAt).toBeTruthy();
        expect(entry?.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
describe("WorkspaceService archive init cancellation", () => {
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("emits metadata when it cancels init but beforeArchive hook fails", async () => {
        const workspaceId = "ws-archive-init-cancel";
        const projectPath = "/tmp/project";
        const workspacePath = "/tmp/project/ws-archive-init-cancel";
        const initStates = new Map([
            [
                workspaceId,
                {
                    status: "running",
                    hookPath: projectPath,
                    startTime: 0,
                    lines: [],
                    exitCode: null,
                    endTime: null,
                },
            ],
        ]);
        const clearInMemoryStateMock = mock((id) => {
            initStates.delete(id);
        });
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock((id) => initStates.get(id)),
            clearInMemoryState: clearInMemoryStateMock,
        };
        let configState = {
            projects: new Map([
                [
                    projectPath,
                    {
                        workspaces: [
                            {
                                path: workspacePath,
                                id: workspaceId,
                            },
                        ],
                    },
                ],
            ]),
        };
        const editConfigSpy = mock((fn) => {
            configState = fn(configState);
            return Promise.resolve();
        });
        const frontendMetadata = {
            id: workspaceId,
            name: "ws-archive-init-cancel",
            projectName: "proj",
            projectPath,
            runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
            namedWorkspacePath: workspacePath,
        };
        const workspaceMetadata = {
            id: workspaceId,
            name: "ws-archive-init-cancel",
            projectName: "proj",
            projectPath,
            runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
        };
        const mockConfig = {
            srcDir: "/tmp/src",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock((id) => {
                if (id !== workspaceId) {
                    return null;
                }
                return { projectPath, workspacePath };
            }),
            editConfig: editConfigSpy,
            getAllWorkspaceMetadata: mock(() => Promise.resolve([frontendMetadata])),
        };
        const mockAIService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve(Ok(workspaceMetadata))),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, {}, { cleanup: mock(() => Promise.resolve()) });
        // Seed abort controller so archive() can cancel init.
        const abortController = new AbortController();
        const initAbortControllers = workspaceService.initAbortControllers;
        initAbortControllers.set(workspaceId, abortController);
        const metadataEvents = [];
        workspaceService.on("metadata", (event) => {
            if (!event || typeof event !== "object") {
                return;
            }
            const parsed = event;
            if (parsed.workspaceId === workspaceId) {
                metadataEvents.push(parsed.metadata);
            }
        });
        const hooks = new WorkspaceLifecycleHooks();
        hooks.registerBeforeArchive(() => Promise.resolve(Err("hook failed")));
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe("hook failed");
        }
        // Ensure we didn't persist archivedAt on hook failure.
        expect(editConfigSpy).toHaveBeenCalledTimes(0);
        const entry = configState.projects.get(projectPath)?.workspaces[0];
        expect(entry?.archivedAt).toBeUndefined();
        expect(abortController.signal.aborted).toBe(true);
        expect(clearInMemoryStateMock).toHaveBeenCalledWith(workspaceId);
        expect(metadataEvents.length).toBeGreaterThanOrEqual(1);
        expect(metadataEvents.at(-1)?.isInitializing).toBe(undefined);
    });
});
describe("WorkspaceService unarchive lifecycle hooks", () => {
    const workspaceId = "ws-unarchive";
    const projectPath = "/tmp/project";
    const workspacePath = "/tmp/project/ws-unarchive";
    let workspaceService;
    let configState;
    let editConfigSpy;
    let historyService;
    let cleanupHistory;
    const workspaceMetadata = {
        id: workspaceId,
        name: "ws-unarchive",
        projectName: "proj",
        projectPath,
        runtimeConfig: { type: "local", srcBaseDir: "/tmp" },
        archivedAt: "2020-01-01T00:00:00.000Z",
        namedWorkspacePath: workspacePath,
    };
    beforeEach(async () => {
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
        configState = {
            projects: new Map([
                [
                    projectPath,
                    {
                        workspaces: [
                            {
                                path: workspacePath,
                                id: workspaceId,
                                archivedAt: "2020-01-01T00:00:00.000Z",
                            },
                        ],
                    },
                ],
            ]),
        };
        editConfigSpy = mock((fn) => {
            configState = fn(configState);
            return Promise.resolve();
        });
        const mockConfig = {
            srcDir: "/tmp/src",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock((id) => {
                if (id !== workspaceId) {
                    return null;
                }
                return { projectPath, workspacePath };
            }),
            editConfig: editConfigSpy,
            getAllWorkspaceMetadata: mock(() => Promise.resolve([workspaceMetadata])),
        };
        const aiService = {
            isStreaming: mock(() => false),
            getWorkspaceMetadata: mock(() => Promise.resolve(Ok(workspaceMetadata))),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("persists unarchivedAt and runs afterUnarchive hooks (best-effort)", async () => {
        const hooks = new WorkspaceLifecycleHooks();
        const afterHook = mock(() => {
            const entry = configState.projects.get(projectPath)?.workspaces[0];
            expect(entry?.unarchivedAt).toBeTruthy();
            return Promise.resolve(Err("hook failed"));
        });
        hooks.registerAfterUnarchive(afterHook);
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        const result = await workspaceService.unarchive(workspaceId);
        expect(result.success).toBe(true);
        expect(afterHook).toHaveBeenCalledTimes(1);
        const entry = configState.projects.get(projectPath)?.workspaces[0];
        expect(entry?.unarchivedAt).toBeTruthy();
        expect(entry?.unarchivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    test("does not run afterUnarchive hooks when workspace is not archived", async () => {
        const entry = configState.projects.get(projectPath)?.workspaces[0];
        if (!entry) {
            throw new Error("Missing workspace entry");
        }
        entry.archivedAt = undefined;
        const hooks = new WorkspaceLifecycleHooks();
        const afterHook = mock(() => Promise.resolve(Ok(undefined)));
        hooks.registerAfterUnarchive(afterHook);
        workspaceService.setWorkspaceLifecycleHooks(hooks);
        const result = await workspaceService.unarchive(workspaceId);
        expect(result.success).toBe(true);
        expect(afterHook).toHaveBeenCalledTimes(0);
    });
});
describe("WorkspaceService archiveMergedInProject", () => {
    const TARGET_PROJECT_PATH = "/tmp/project";
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    function createMetadata(id, options) {
        const projectPath = options?.projectPath ?? TARGET_PROJECT_PATH;
        return {
            id,
            name: id,
            projectName: "test-project",
            projectPath,
            runtimeConfig: { type: "local" },
            namedWorkspacePath: path.join(projectPath, id),
            archivedAt: options?.archivedAt,
            unarchivedAt: options?.unarchivedAt,
        };
    }
    function bashOk(output) {
        return {
            success: true,
            data: {
                success: true,
                output,
                exitCode: 0,
                wall_duration_ms: 0,
            },
        };
    }
    function bashToolFailure(error) {
        return {
            success: true,
            data: {
                success: false,
                error,
                exitCode: 1,
                wall_duration_ms: 0,
            },
        };
    }
    function executeBashFailure(error) {
        return { success: false, error };
    }
    function createServiceHarness(allMetadata, executeBashImpl, archiveImpl) {
        const mockConfig = {
            srcDir: "/tmp/test",
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
            getAllWorkspaceMetadata: mock(() => Promise.resolve(allMetadata)),
        };
        const aiService = {
            on(_eventName, _listener) {
                return this;
            },
            off(_eventName, _listener) {
                return this;
            },
        };
        const workspaceService = new WorkspaceService(mockConfig, historyService, aiService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
        const executeBashMock = mock(executeBashImpl);
        const archiveMock = mock(archiveImpl);
        const svc = workspaceService;
        svc.executeBash = executeBashMock;
        svc.archive = archiveMock;
        return { workspaceService, executeBashMock, archiveMock };
    }
    test("excludes MUX_HELP_CHAT_WORKSPACE_ID workspaces", async () => {
        const allMetadata = [
            createMetadata(MUX_HELP_CHAT_WORKSPACE_ID),
            createMetadata("ws-merged"),
        ];
        const ghResultsByWorkspaceId = {
            "ws-merged": bashOk('{"state":"MERGED"}'),
        };
        const { workspaceService, executeBashMock, archiveMock } = createServiceHarness(allMetadata, (workspaceId) => {
            const result = ghResultsByWorkspaceId[workspaceId];
            if (!result) {
                throw new Error(`Unexpected executeBash call for workspaceId: ${workspaceId}`);
            }
            return Promise.resolve(result);
        }, () => Promise.resolve({ success: true, data: undefined }));
        const result = await workspaceService.archiveMergedInProject(TARGET_PROJECT_PATH);
        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }
        expect(result.data.archivedWorkspaceIds).toEqual(["ws-merged"]);
        expect(result.data.skippedWorkspaceIds).toEqual([]);
        expect(result.data.errors).toEqual([]);
        expect(archiveMock).toHaveBeenCalledTimes(1);
        expect(archiveMock).toHaveBeenCalledWith("ws-merged");
        // Should only query GitHub for the eligible non-mux-chat workspace.
        expect(executeBashMock).toHaveBeenCalledTimes(1);
    });
    test("treats workspaces with later unarchivedAt as eligible", async () => {
        const allMetadata = [
            createMetadata("ws-merged-unarchived", {
                archivedAt: "2025-01-01T00:00:00.000Z",
                unarchivedAt: "2025-02-01T00:00:00.000Z",
            }),
            createMetadata("ws-still-archived", {
                archivedAt: "2025-03-01T00:00:00.000Z",
                unarchivedAt: "2025-02-01T00:00:00.000Z",
            }),
        ];
        const ghResultsByWorkspaceId = {
            "ws-merged-unarchived": bashOk('{"state":"MERGED"}'),
        };
        const { workspaceService, executeBashMock, archiveMock } = createServiceHarness(allMetadata, (workspaceId) => {
            const result = ghResultsByWorkspaceId[workspaceId];
            if (!result) {
                throw new Error(`Unexpected executeBash call for workspaceId: ${workspaceId}`);
            }
            return Promise.resolve(result);
        }, () => Promise.resolve({ success: true, data: undefined }));
        const result = await workspaceService.archiveMergedInProject(TARGET_PROJECT_PATH);
        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }
        expect(result.data.archivedWorkspaceIds).toEqual(["ws-merged-unarchived"]);
        expect(result.data.skippedWorkspaceIds).toEqual([]);
        expect(result.data.errors).toEqual([]);
        expect(archiveMock).toHaveBeenCalledTimes(1);
        expect(archiveMock).toHaveBeenCalledWith("ws-merged-unarchived");
        // Should only query GitHub for the workspace that is considered unarchived.
        expect(executeBashMock).toHaveBeenCalledTimes(1);
    });
    test("archives only MERGED workspaces", async () => {
        const allMetadata = [
            createMetadata("ws-open"),
            createMetadata("ws-merged"),
            createMetadata("ws-no-pr"),
            createMetadata("ws-other-project", { projectPath: "/tmp/other" }),
            createMetadata("ws-already-archived", { archivedAt: "2025-01-01T00:00:00.000Z" }),
        ];
        const ghResultsByWorkspaceId = {
            "ws-open": bashOk('{"state":"OPEN"}'),
            "ws-merged": bashOk('{"state":"MERGED"}'),
            "ws-no-pr": bashOk('{"no_pr":true}'),
        };
        const { workspaceService, executeBashMock, archiveMock } = createServiceHarness(allMetadata, (workspaceId, script, options) => {
            expect(script).toContain("gh pr view --json state");
            expect(options?.timeout_secs).toBe(15);
            const result = ghResultsByWorkspaceId[workspaceId];
            if (!result) {
                throw new Error(`Unexpected executeBash call for workspaceId: ${workspaceId}`);
            }
            return Promise.resolve(result);
        }, () => Promise.resolve({ success: true, data: undefined }));
        const result = await workspaceService.archiveMergedInProject(TARGET_PROJECT_PATH);
        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }
        expect(result.data.archivedWorkspaceIds).toEqual(["ws-merged"]);
        expect(result.data.skippedWorkspaceIds).toEqual(["ws-no-pr", "ws-open"]);
        expect(result.data.errors).toEqual([]);
        expect(archiveMock).toHaveBeenCalledTimes(1);
        expect(archiveMock).toHaveBeenCalledWith("ws-merged");
        expect(executeBashMock).toHaveBeenCalledTimes(3);
    });
    test("skips no_pr and non-merged states", async () => {
        const allMetadata = [
            createMetadata("ws-open"),
            createMetadata("ws-closed"),
            createMetadata("ws-no-pr"),
        ];
        const ghResultsByWorkspaceId = {
            "ws-open": bashOk('{"state":"OPEN"}'),
            "ws-closed": bashOk('{"state":"CLOSED"}'),
            "ws-no-pr": bashOk('{"no_pr":true}'),
        };
        const { workspaceService, archiveMock } = createServiceHarness(allMetadata, (workspaceId) => {
            const result = ghResultsByWorkspaceId[workspaceId];
            if (!result) {
                throw new Error(`Unexpected executeBash call for workspaceId: ${workspaceId}`);
            }
            return Promise.resolve(result);
        }, () => Promise.resolve({ success: true, data: undefined }));
        const result = await workspaceService.archiveMergedInProject(TARGET_PROJECT_PATH);
        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }
        expect(result.data.archivedWorkspaceIds).toEqual([]);
        expect(result.data.skippedWorkspaceIds).toEqual(["ws-closed", "ws-no-pr", "ws-open"]);
        expect(result.data.errors).toEqual([]);
        expect(archiveMock).toHaveBeenCalledTimes(0);
    });
    test("records errors for malformed JSON and executeBash failures", async () => {
        const allMetadata = [
            createMetadata("ws-bad-json"),
            createMetadata("ws-exec-failed"),
            createMetadata("ws-bash-failed"),
        ];
        const ghResultsByWorkspaceId = {
            "ws-bad-json": bashOk("not-json"),
            "ws-exec-failed": executeBashFailure("executeBash failed"),
            "ws-bash-failed": bashToolFailure("gh failed"),
        };
        const { workspaceService, archiveMock } = createServiceHarness(allMetadata, (workspaceId) => {
            const result = ghResultsByWorkspaceId[workspaceId];
            if (!result) {
                throw new Error(`Unexpected executeBash call for workspaceId: ${workspaceId}`);
            }
            return Promise.resolve(result);
        }, () => Promise.resolve({ success: true, data: undefined }));
        const result = await workspaceService.archiveMergedInProject(TARGET_PROJECT_PATH);
        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }
        expect(result.data.archivedWorkspaceIds).toEqual([]);
        expect(result.data.skippedWorkspaceIds).toEqual([]);
        expect(result.data.errors).toHaveLength(3);
        const badJsonError = result.data.errors.find((e) => e.workspaceId === "ws-bad-json");
        expect(badJsonError).toBeDefined();
        expect(badJsonError?.error).toContain("Failed to parse gh output");
        const execFailedError = result.data.errors.find((e) => e.workspaceId === "ws-exec-failed");
        expect(execFailedError).toBeDefined();
        expect(execFailedError?.error).toBe("executeBash failed");
        const bashFailedError = result.data.errors.find((e) => e.workspaceId === "ws-bash-failed");
        expect(bashFailedError).toBeDefined();
        expect(bashFailedError?.error).toBe("gh failed");
        expect(archiveMock).toHaveBeenCalledTimes(0);
    });
});
describe("WorkspaceService init cancellation", () => {
    let historyService;
    let cleanupHistory;
    beforeEach(async () => {
        ({ historyService, cleanup: cleanupHistory } = await createTestHistoryService());
    });
    afterEach(async () => {
        await cleanupHistory();
    });
    test("archive() aborts init and still archives when init is running", async () => {
        const workspaceId = "ws-init-running";
        const removeMock = mock(() => Promise.resolve({ success: true, data: undefined }));
        const editConfigMock = mock(() => Promise.resolve());
        const clearInMemoryStateMock = mock((_workspaceId) => undefined);
        const mockAIService = {
            isStreaming: mock(() => false),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        const mockConfig = {
            srcDir: "/tmp/test",
            findWorkspace: mock(() => ({ projectPath: "/tmp/proj", workspacePath: "/tmp/proj/ws" })),
            editConfig: editConfigMock,
            getAllWorkspaceMetadata: mock(() => Promise.resolve([])),
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
        };
        const mockInitStateManager = {
            // WorkspaceService subscribes to init-end events on construction.
            on: mock(() => undefined),
            getInitState: mock(() => ({
                status: "running",
                hookPath: "/tmp/proj",
                startTime: 0,
                lines: [],
                exitCode: null,
                endTime: null,
            })),
            clearInMemoryState: clearInMemoryStateMock,
        };
        const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
        // Make it obvious if archive() incorrectly chooses deletion.
        workspaceService.remove = removeMock;
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(true);
        expect(editConfigMock).toHaveBeenCalled();
        expect(removeMock).not.toHaveBeenCalled();
        expect(clearInMemoryStateMock).toHaveBeenCalledWith(workspaceId);
    });
    test("archive() uses normal archive flow when init is complete", async () => {
        const workspaceId = "ws-init-complete";
        const removeMock = mock(() => Promise.resolve({ success: true, data: undefined }));
        const editConfigMock = mock(() => Promise.resolve());
        const mockAIService = {
            isStreaming: mock(() => false),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        const mockConfig = {
            srcDir: "/tmp/test",
            findWorkspace: mock(() => ({ projectPath: "/tmp/proj", workspacePath: "/tmp/proj/ws" })),
            editConfig: editConfigMock,
            getAllWorkspaceMetadata: mock(() => Promise.resolve([])),
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
        };
        const mockInitStateManager = {
            // WorkspaceService subscribes to init-end events on construction.
            on: mock(() => undefined),
            getInitState: mock(() => ({
                status: "success",
                hookPath: "/tmp/proj",
                startTime: 0,
                lines: [],
                exitCode: 0,
                endTime: 1,
            })),
            clearInMemoryState: mock((_workspaceId) => undefined),
        };
        const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
        // Make it obvious if archive() incorrectly chooses deletion.
        workspaceService.remove = removeMock;
        const result = await workspaceService.archive(workspaceId);
        expect(result.success).toBe(true);
        expect(editConfigMock).toHaveBeenCalled();
        expect(removeMock).not.toHaveBeenCalled();
    });
    test("list() includes isInitializing when init state is running", async () => {
        const workspaceId = "ws-list-initializing";
        const mockAIService = {
            isStreaming: mock(() => false),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        const mockMetadata = {
            id: workspaceId,
            name: "ws",
            projectName: "proj",
            projectPath: "/tmp/proj",
            createdAt: "2026-01-01T00:00:00.000Z",
            namedWorkspacePath: "/tmp/proj/ws",
            runtimeConfig: { type: "local" },
        };
        const mockConfig = {
            srcDir: "/tmp/test",
            getAllWorkspaceMetadata: mock(() => Promise.resolve([mockMetadata])),
            getSessionDir: mock(() => "/tmp/test/sessions"),
            generateStableId: mock(() => "test-id"),
            findWorkspace: mock(() => null),
        };
        const mockInitStateManager = {
            // WorkspaceService subscribes to init-end events on construction.
            on: mock(() => undefined),
            getInitState: mock((id) => id === workspaceId
                ? {
                    status: "running",
                    hookPath: "/tmp/proj",
                    startTime: 0,
                    lines: [],
                    exitCode: null,
                    endTime: null,
                }
                : undefined),
        };
        const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
        const list = await workspaceService.list();
        expect(list).toHaveLength(1);
        expect(list[0]?.isInitializing).toBe(true);
    });
    test("create() clears init state + emits updated metadata when skipping background init", async () => {
        const workspaceId = "ws-skip-init";
        const projectPath = "/tmp/proj";
        const branchName = "ws_branch";
        const workspacePath = "/tmp/proj/ws_branch";
        const initStates = new Map();
        const clearInMemoryStateMock = mock((id) => {
            initStates.delete(id);
        });
        const mockInitStateManager = {
            on: mock(() => undefined),
            startInit: mock((id) => {
                initStates.set(id, {
                    status: "running",
                    hookPath: projectPath,
                    startTime: 0,
                    lines: [],
                    exitCode: null,
                    endTime: null,
                });
            }),
            getInitState: mock((id) => initStates.get(id)),
            clearInMemoryState: clearInMemoryStateMock,
        };
        const configState = { projects: new Map() };
        const mockMetadata = {
            id: workspaceId,
            name: branchName,
            title: "title",
            projectName: "proj",
            projectPath,
            createdAt: "2026-01-01T00:00:00.000Z",
            namedWorkspacePath: workspacePath,
            runtimeConfig: { type: "local" },
        };
        const mockConfig = {
            rootDir: "/tmp/mux-root",
            srcDir: "/tmp/src",
            generateStableId: mock(() => workspaceId),
            editConfig: mock((editFn) => {
                editFn(configState);
                return Promise.resolve();
            }),
            getAllWorkspaceMetadata: mock(() => Promise.resolve([mockMetadata])),
            getEffectiveSecrets: mock(() => []),
            getSessionDir: mock(() => "/tmp/test/sessions"),
            findWorkspace: mock(() => null),
        };
        const mockAIService = {
            isStreaming: mock(() => false),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            on: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            off: mock(() => { }),
        };
        const createWorkspaceMock = mock(() => Promise.resolve({ success: true, workspacePath }));
        const createRuntimeSpy = spyOn(runtimeFactory, "createRuntime").mockReturnValue({
            createWorkspace: createWorkspaceMock,
        });
        const sessionEmitter = new EventEmitter();
        const fakeSession = {
            onChatEvent: (listener) => {
                sessionEmitter.on("chat-event", listener);
                return () => sessionEmitter.off("chat-event", listener);
            },
            onMetadataEvent: (listener) => {
                sessionEmitter.on("metadata-event", listener);
                return () => sessionEmitter.off("metadata-event", listener);
            },
            emitMetadata: (metadata) => {
                sessionEmitter.emit("metadata-event", { workspaceId, metadata });
            },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            dispose: () => { },
        };
        try {
            const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
            const metadataEvents = [];
            workspaceService.on("metadata", (event) => {
                if (!event || typeof event !== "object") {
                    return;
                }
                const parsed = event;
                if (parsed.workspaceId === workspaceId) {
                    metadataEvents.push(parsed.metadata);
                }
            });
            workspaceService.registerSession(workspaceId, fakeSession);
            const removingWorkspaces = workspaceService.removingWorkspaces;
            removingWorkspaces.add(workspaceId);
            const result = await workspaceService.create(projectPath, branchName, undefined, "title", {
                type: "local",
            });
            expect(result.success).toBe(true);
            if (!result.success) {
                return;
            }
            expect(result.data.metadata.isInitializing).toBe(undefined);
            expect(clearInMemoryStateMock).toHaveBeenCalledWith(workspaceId);
            expect(metadataEvents).toHaveLength(2);
            expect(metadataEvents[0]?.isInitializing).toBe(true);
            expect(metadataEvents[1]?.isInitializing).toBe(undefined);
        }
        finally {
            createRuntimeSpy.mockRestore();
        }
    });
    test("remove() aborts init and clears state before teardown", async () => {
        const workspaceId = "ws-remove-aborts";
        const tempRoot = await fsPromises.mkdtemp(path.join(tmpdir(), "mux-ws-remove-"));
        try {
            const abortController = new AbortController();
            const clearInMemoryStateMock = mock((_workspaceId) => undefined);
            const mockInitStateManager = {
                on: mock(() => undefined),
                getInitState: mock(() => undefined),
                clearInMemoryState: clearInMemoryStateMock,
            };
            const mockAIService = {
                isStreaming: mock(() => false),
                stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
                getWorkspaceMetadata: mock(() => Promise.resolve({ success: false, error: "na" })),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                on: mock(() => { }),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                off: mock(() => { }),
            };
            const mockConfig = {
                srcDir: "/tmp/src",
                getSessionDir: mock((id) => path.join(tempRoot, id)),
                removeWorkspace: mock(() => Promise.resolve()),
                findWorkspace: mock(() => null),
            };
            const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
            // Inject an in-progress init AbortController.
            const initAbortControllers = workspaceService.initAbortControllers;
            initAbortControllers.set(workspaceId, abortController);
            const result = await workspaceService.remove(workspaceId, true);
            expect(result.success).toBe(true);
            expect(abortController.signal.aborted).toBe(true);
            expect(clearInMemoryStateMock).toHaveBeenCalledWith(workspaceId);
            expect(initAbortControllers.has(workspaceId)).toBe(false);
        }
        finally {
            await fsPromises.rm(tempRoot, { recursive: true, force: true });
        }
    });
    test("remove() does not clear init state when runtime deletion fails with force=false", async () => {
        const workspaceId = "ws-remove-runtime-delete-fails";
        const projectPath = "/tmp/proj";
        const abortController = new AbortController();
        const clearInMemoryStateMock = mock((_workspaceId) => undefined);
        const mockInitStateManager = {
            on: mock(() => undefined),
            getInitState: mock(() => undefined),
            clearInMemoryState: clearInMemoryStateMock,
        };
        const removeWorkspaceMock = mock(() => Promise.resolve());
        const deleteWorkspaceMock = mock(() => Promise.resolve({ success: false, error: "dirty" }));
        const createRuntimeSpy = spyOn(runtimeFactory, "createRuntime").mockReturnValue({
            deleteWorkspace: deleteWorkspaceMock,
        });
        const tempRoot = await fsPromises.mkdtemp(path.join(tmpdir(), "mux-ws-remove-fail-"));
        try {
            const mockAIService = {
                isStreaming: mock(() => false),
                stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
                getWorkspaceMetadata: mock(() => Promise.resolve(Ok({
                    id: workspaceId,
                    name: "ws",
                    projectPath,
                    projectName: "proj",
                    runtimeConfig: { type: "local" },
                }))),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                on: mock(() => { }),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                off: mock(() => { }),
            };
            const mockConfig = {
                srcDir: "/tmp/src",
                getSessionDir: mock((id) => path.join(tempRoot, id)),
                removeWorkspace: removeWorkspaceMock,
                findWorkspace: mock(() => null),
            };
            const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
            // Inject an in-progress init AbortController.
            const initAbortControllers = workspaceService.initAbortControllers;
            initAbortControllers.set(workspaceId, abortController);
            const result = await workspaceService.remove(workspaceId, false);
            expect(result.success).toBe(false);
            expect(abortController.signal.aborted).toBe(true);
            // If runtime deletion fails with force=false, removal returns early and the workspace remains.
            // Keep init state intact so init-end can refresh metadata and clear isInitializing.
            expect(clearInMemoryStateMock).not.toHaveBeenCalled();
            expect(removeWorkspaceMock).not.toHaveBeenCalled();
        }
        finally {
            createRuntimeSpy.mockRestore();
            await fsPromises.rm(tempRoot, { recursive: true, force: true });
        }
    });
    test("remove() calls runtime.deleteWorkspace when force=true", async () => {
        const workspaceId = "ws-remove-runtime-delete";
        const projectPath = "/tmp/proj";
        const deleteWorkspaceMock = mock(() => Promise.resolve({ success: true, deletedPath: "/tmp/deleted" }));
        const createRuntimeSpy = spyOn(runtimeFactory, "createRuntime").mockReturnValue({
            deleteWorkspace: deleteWorkspaceMock,
        });
        const tempRoot = await fsPromises.mkdtemp(path.join(tmpdir(), "mux-ws-remove-runtime-"));
        try {
            const mockAIService = {
                isStreaming: mock(() => false),
                stopStream: mock(() => Promise.resolve({ success: true, data: undefined })),
                getWorkspaceMetadata: mock(() => Promise.resolve(Ok({
                    id: workspaceId,
                    name: "ws",
                    projectPath,
                    projectName: "proj",
                    runtimeConfig: { type: "local" },
                }))),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                on: mock(() => { }),
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                off: mock(() => { }),
            };
            const mockConfig = {
                srcDir: "/tmp/src",
                getSessionDir: mock((id) => path.join(tempRoot, id)),
                removeWorkspace: mock(() => Promise.resolve()),
                findWorkspace: mock(() => ({ projectPath, workspacePath: "/tmp/proj/ws" })),
            };
            const workspaceService = new WorkspaceService(mockConfig, historyService, mockAIService, mockInitStateManager, mockExtensionMetadataService, mockBackgroundProcessManager);
            const result = await workspaceService.remove(workspaceId, true);
            expect(result.success).toBe(true);
            expect(deleteWorkspaceMock).toHaveBeenCalledWith(projectPath, "ws", true);
        }
        finally {
            createRuntimeSpy.mockRestore();
            await fsPromises.rm(tempRoot, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=workspaceService.test.js.map