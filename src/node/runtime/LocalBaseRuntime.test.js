import { describe, expect, it } from "bun:test";
import * as os from "os";
import * as path from "path";
import { LocalBaseRuntime } from "./LocalBaseRuntime";
class TestLocalRuntime extends LocalBaseRuntime {
    getWorkspacePath(_projectPath, _workspaceName) {
        return "/tmp/workspace";
    }
    createWorkspace(_params) {
        return Promise.resolve({ success: true, workspacePath: "/tmp/workspace" });
    }
    initWorkspace(_params) {
        return Promise.resolve({ success: true });
    }
    renameWorkspace(_projectPath, _oldName, _newName) {
        return Promise.resolve({ success: true, oldPath: "/tmp/workspace", newPath: "/tmp/workspace" });
    }
    deleteWorkspace(_projectPath, _workspaceName, _force) {
        return Promise.resolve({ success: true, deletedPath: "/tmp/workspace" });
    }
    forkWorkspace(_params) {
        return Promise.resolve({
            success: true,
            workspacePath: "/tmp/workspace",
            sourceBranch: "main",
        });
    }
}
describe("LocalBaseRuntime.resolvePath", () => {
    it("should expand tilde to home directory", async () => {
        const runtime = new TestLocalRuntime();
        const resolved = await runtime.resolvePath("~");
        expect(resolved).toBe(os.homedir());
    });
    it("should expand tilde with path", async () => {
        const runtime = new TestLocalRuntime();
        const resolved = await runtime.resolvePath("~/..");
        const expected = path.dirname(os.homedir());
        expect(resolved).toBe(expected);
    });
    it("should resolve absolute paths", async () => {
        const runtime = new TestLocalRuntime();
        const resolved = await runtime.resolvePath("/tmp");
        expect(resolved).toBe("/tmp");
    });
    it("should resolve non-existent paths without checking existence", async () => {
        const runtime = new TestLocalRuntime();
        const resolved = await runtime.resolvePath("/this/path/does/not/exist/12345");
        // Should resolve to absolute path without checking if it exists
        expect(resolved).toBe("/this/path/does/not/exist/12345");
    });
    it("should resolve relative paths from cwd", async () => {
        const runtime = new TestLocalRuntime();
        const resolved = await runtime.resolvePath(".");
        // Should resolve to absolute path
        expect(path.isAbsolute(resolved)).toBe(true);
    });
});
//# sourceMappingURL=LocalBaseRuntime.test.js.map