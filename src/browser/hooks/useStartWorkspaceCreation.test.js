import { describe, expect, test } from "bun:test";
import { getFirstProjectPath, persistWorkspaceCreationPrefill, } from "./useStartWorkspaceCreation";
import { getInputKey, getModelKey, getPendingScopeId, getProjectScopeId, getTrunkBranchKey, } from "@/common/constants/storage";
describe("persistWorkspaceCreationPrefill", () => {
    const projectPath = "/tmp/project";
    function createPersistSpy() {
        const calls = [];
        const persist = ((...args) => {
            calls.push(args);
        });
        return { persist, calls };
    }
    test("writes provided values and normalizes whitespace", () => {
        const detail = {
            projectPath,
            startMessage: "Ship it",
            model: "provider/model",
            trunkBranch: " main ",
            runtime: " ssh dev ", // runtime is NOT persisted - it's a one-time override
        };
        const { persist, calls } = createPersistSpy();
        persistWorkspaceCreationPrefill(projectPath, detail, persist);
        const callMap = new Map();
        for (const [key, value] of calls) {
            callMap.set(key, value);
        }
        expect(callMap.get(getInputKey(getPendingScopeId(projectPath)))).toBe("Ship it");
        expect(callMap.get(getModelKey(getProjectScopeId(projectPath)))).toBe("provider/model");
        expect(callMap.get(getTrunkBranchKey(projectPath))).toBe("main");
        // runtime is intentionally not persisted - default can only be changed via icon selector
        expect(calls.length).toBe(3);
    });
    test("clears persisted values when empty strings are provided", () => {
        const detail = {
            projectPath,
            trunkBranch: "   ",
        };
        const { persist, calls } = createPersistSpy();
        persistWorkspaceCreationPrefill(projectPath, detail, persist);
        const callMap = new Map();
        for (const [key, value] of calls) {
            callMap.set(key, value);
        }
        expect(callMap.get(getTrunkBranchKey(projectPath))).toBeUndefined();
    });
    test("no-op when detail is undefined", () => {
        const { persist, calls } = createPersistSpy();
        persistWorkspaceCreationPrefill(projectPath, undefined, persist);
        expect(calls).toHaveLength(0);
    });
});
describe("getFirstProjectPath", () => {
    test("returns first project path or null", () => {
        const emptyProjects = new Map();
        expect(getFirstProjectPath(emptyProjects)).toBeNull();
        const projects = new Map();
        projects.set("/tmp/a", { path: "/tmp/a", workspaces: [] });
        projects.set("/tmp/b", { path: "/tmp/b", workspaces: [] });
        expect(getFirstProjectPath(projects)).toBe("/tmp/a");
    });
});
//# sourceMappingURL=useStartWorkspaceCreation.test.js.map