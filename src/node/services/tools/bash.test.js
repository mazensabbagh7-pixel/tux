var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { describe, it, expect } from "bun:test";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { createBashTool } from "./bash";
import { BASH_MAX_TOTAL_BYTES } from "@/common/constants/toolLimits";
import * as path from "path";
import * as fs from "fs";
import { TestTempDir, createTestToolConfig, getTestDeps } from "./testHelpers";
import { createRuntime } from "@/node/runtime/runtimeFactory";
import { sshConnectionPool } from "@/node/runtime/sshConnectionPool";
// Type guard to narrow foreground success result (has note, no backgroundProcessId)
function isForegroundSuccess(result) {
    return result.success && !("backgroundProcessId" in result);
}
import { BackgroundProcessManager } from "@/node/services/backgroundProcessManager";
// Mock ToolCallOptions for testing
const mockToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
};
// Helper to create bash tool with test configuration
// Returns both tool and disposable temp directory
// Use with: using testEnv = createTestBashTool();
function createTestBashTool() {
    const tempDir = new TestTempDir("test-bash");
    const config = createTestToolConfig(process.cwd());
    config.runtimeTempDir = tempDir.path; // Override runtimeTempDir to use test's disposable temp dir
    const tool = createBashTool(config);
    return {
        tool,
        [Symbol.dispose]() {
            tempDir[Symbol.dispose]();
        },
    };
}
describe("bash tool", () => {
    it("should execute a simple command successfully", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_1, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo hello",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("hello");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    it("should emit bash-output events when emitChatEvent is provided", async () => {
        const tempDir = new TestTempDir("test-bash-live-output");
        const events = [];
        const config = createTestToolConfig(process.cwd());
        config.runtimeTempDir = tempDir.path;
        config.emitChatEvent = (event) => {
            if (event.type === "bash-output") {
                events.push(event);
            }
        };
        const tool = createBashTool(config);
        const args = {
            script: "echo out && echo err 1>&2",
            timeout_secs: 5,
            run_in_background: false,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.workspaceId === config.workspaceId)).toBe(true);
        expect(events.every((e) => e.toolCallId === mockToolCallOptions.toolCallId)).toBe(true);
        const stdoutText = events
            .filter((e) => !e.isError)
            .map((e) => e.text)
            .join("");
        const stderrText = events
            .filter((e) => e.isError)
            .map((e) => e.text)
            .join("");
        expect(stdoutText).toContain("out");
        expect(stderrText).toContain("err");
        tempDir[Symbol.dispose]();
    });
    it("should handle multi-line output", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_2, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo line1 && echo line2 && echo line3",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("line1\nline2\nline3");
            }
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    it("should warn when using cat to read a file", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_3, new TestTempDir("test-bash-cat-read"), false);
            const filePath = path.join(tempDir.path, "input.txt");
            fs.writeFileSync(filePath, "hello\nworld", "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: `cat ${filePath}`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello\nworld");
                expect(result.note).toContain("DO NOT use `cat`");
                expect(result.note).toContain("file_read");
            }
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    it("should not warn on cat heredoc", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_4, new TestTempDir("test-bash-cat-heredoc"), false);
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: "cat <<'EOF'\nhello\nEOF",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello");
                expect(result.note).toBeUndefined();
            }
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    it("should warn when using grep to dump a file", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_5, new TestTempDir("test-bash-grep-read"), false);
            const filePath = path.join(tempDir.path, "input.txt");
            fs.writeFileSync(filePath, "hello\nworld", "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: `grep '' ${filePath}`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello\nworld");
                expect(result.note).toContain("file_read");
                expect(result.note).toContain("`grep`");
            }
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    it("should not warn on grep search", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_6, new TestTempDir("test-bash-grep-search"), false);
            const filePath = path.join(tempDir.path, "input.txt");
            fs.writeFileSync(filePath, "hello\nworld", "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: `grep 'hello' ${filePath}`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello");
                expect(result.note).toBeUndefined();
            }
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
    it("should warn when using rg to dump a file", async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_7, new TestTempDir("test-bash-rg-read"), false);
            const filePath = path.join(tempDir.path, "input.txt");
            fs.writeFileSync(filePath, "hello\nworld", "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            // CI images don’t guarantee ripgrep is installed; shim `rg` so we can exercise the
            // bash-tool warning heuristics without depending on the real binary.
            const args = {
                script: `rg() { grep -E "$1" "$2"; }\nrg '' "${filePath}"`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello\nworld");
                expect(result.note).toContain("file_read");
                expect(result.note).toContain("`rg`");
            }
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    });
    it("should not warn on rg search", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_8, new TestTempDir("test-bash-rg-search"), false);
            const filePath = path.join(tempDir.path, "input.txt");
            fs.writeFileSync(filePath, "hello\nworld", "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            // CI images don’t guarantee ripgrep is installed; shim `rg` so we can exercise the
            // bash-tool warning heuristics without depending on the real binary.
            const args = {
                script: `rg() { grep -E "$1" "$2"; }\nrg 'hello' "${filePath}"`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("hello");
                expect(result.note).toBeUndefined();
            }
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    it("should warn on cat file reads even when output overflows", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_9, new TestTempDir("test-bash-cat-overflow"), false);
            const filePath = path.join(tempDir.path, "large.txt");
            fs.writeFileSync(filePath, Array.from({ length: 400 }, (_, i) => `line${i + 1}`).join("\n"), "utf-8");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: `cat ${filePath}`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toContain("DO NOT use `cat`");
                expect(result.note).toContain("[OUTPUT OVERFLOW");
                const match = /saved to (\/.*?\.txt)/.exec(result.note ?? "");
                expect(match).toBeDefined();
                if (match) {
                    const overflowPath = match[1];
                    expect(fs.existsSync(overflowPath)).toBe(true);
                    fs.unlinkSync(overflowPath);
                }
            }
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    });
    it("should report overflow when hard cap (300 lines) is exceeded", async () => {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_10, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                run_in_background: false,
                script: "for i in {1..400}; do echo line$i; done", // Exceeds 300 line hard cap
                timeout_secs: 5,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toContain("[OUTPUT OVERFLOW");
                expect(result.note).toContain("Line count exceeded");
                expect(result.note).toContain("300 lines");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            __disposeResources(env_10);
        }
    });
    it("should save overflow output to temp file with short ID", async () => {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_11, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                run_in_background: false,
                script: "for i in {1..400}; do echo line$i; done", // Exceeds 300 line hard cap
                timeout_secs: 5,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toContain("[OUTPUT OVERFLOW");
                // Should contain specific overflow reason (one of the three types)
                expect(result.note).toMatch(/Line count exceeded|Total output exceeded|exceeded per-line limit/);
                expect(result.note).toContain("Full output");
                expect(result.note).toContain("lines) saved to");
                expect(result.note).toContain("bash-");
                expect(result.note).toContain(".txt");
                expect(result.note).toContain("File will be automatically cleaned up when stream ends");
                expect(result.exitCode).toBe(0);
                // Extract file path from output message (handles both "lines saved to" and "lines) saved to")
                const match = /saved to (\/.+?\.txt)/.exec(result.note ?? "");
                expect(match).toBeDefined();
                if (match) {
                    const overflowPath = match[1];
                    // Verify file has short ID format (bash-<8 hex chars>.txt)
                    const filename = overflowPath.split("/").pop();
                    expect(filename).toMatch(/^bash-[0-9a-f]{8}\.txt$/);
                    // Verify file exists and read contents
                    expect(fs.existsSync(overflowPath)).toBe(true);
                    // Verify file contains collected lines (at least 300, may be slightly more)
                    const fileContent = fs.readFileSync(overflowPath, "utf-8");
                    const fileLines = fileContent.split("\n").filter((l) => l.length > 0);
                    expect(fileLines.length).toBeGreaterThanOrEqual(300);
                    expect(fileContent).toContain("line1");
                    expect(fileContent).toContain("line300");
                    // Clean up temp file
                    fs.unlinkSync(overflowPath);
                }
            }
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            __disposeResources(env_11);
        }
    });
    it("should report overflow quickly when hard cap is reached", async () => {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_12, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            const args = {
                // This will generate 500 lines quickly - should report overflow at 300
                run_in_background: false,
                script: "for i in {1..500}; do echo line$i; done",
                timeout_secs: 5,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                // Should complete quickly since we stop at 300 lines
                expect(duration).toBeLessThan(4000);
                expect(result.output).toBe("");
                expect(result.note).toContain("[OUTPUT OVERFLOW");
                expect(result.note).toContain("Line count exceeded");
                expect(result.note).toContain("300 lines");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
    });
    it("should truncate overflow output when overflow_policy is 'truncate'", async () => {
        const tempDir = new TestTempDir("test-bash-truncate");
        const config = createTestToolConfig(process.cwd());
        config.runtimeTempDir = tempDir.path;
        config.overflow_policy = "truncate";
        const tool = createBashTool(config);
        const args = {
            // Generate ~1.5MB of output (1700 lines * 900 bytes) to exceed 1MB byte limit
            script: 'perl -e \'for (1..1700) { print "A" x 900 . "\\n" }\'',
            timeout_secs: 5,
            run_in_background: false,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        // With truncate policy and overflow, should succeed with truncated field
        expect(result.success).toBe(true);
        if (result.success && "truncated" in result) {
            expect(result.truncated).toBeDefined();
            if (result.truncated) {
                expect(result.truncated.reason).toContain("exceed");
                // Should collect lines up to ~1MB (around 1150-1170 lines with 900 bytes each)
                expect(result.truncated.totalLines).toBeGreaterThan(1000);
                expect(result.truncated.totalLines).toBeLessThan(1300);
            }
        }
        // Should contain output that's around 1MB
        expect(result.output?.length).toBeGreaterThan(1000000);
        expect(result.output?.length).toBeLessThan(1100000);
        // Should NOT create temp file with truncate policy
        const files = fs.readdirSync(tempDir.path);
        const bashFiles = files.filter((f) => f.startsWith("bash-"));
        expect(bashFiles.length).toBe(0);
        tempDir[Symbol.dispose]();
    });
    it("should reject single overlong line before storing it (IPC mode)", async () => {
        const tempDir = new TestTempDir("test-bash-overlong-line");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
            overflow_policy: "truncate",
        });
        const args = {
            // Generate a single 2MB line (exceeds 1MB total limit)
            script: 'perl -e \'print "A" x 2000000 . "\\n"\'',
            timeout_secs: 5,
            run_in_background: false,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        // Should succeed but with truncation before storing the overlong line
        expect(result.success).toBe(true);
        if (result.success && "truncated" in result) {
            expect(result.truncated).toBeDefined();
            if (result.truncated) {
                expect(result.truncated.reason).toContain("would exceed file preservation limit");
                // Should have 0 lines collected since the first line was too long
                expect(result.truncated.totalLines).toBe(0);
            }
        }
        // CRITICAL: Output must NOT contain the 2MB line - should be empty or nearly empty
        expect(result.output?.length ?? 0).toBeLessThan(100);
        tempDir[Symbol.dispose]();
    });
    it("should reject overlong line at boundary (IPC mode)", async () => {
        const tempDir = new TestTempDir("test-bash-boundary");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
            overflow_policy: "truncate",
        });
        const args = {
            // First line: 500KB (within limit)
            // Second line: 600KB (would exceed 1MB when added)
            script: 'perl -e \'print "A" x 500000 . "\\n"; print "B" x 600000 . "\\n"\'',
            timeout_secs: 5,
            run_in_background: false,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (result.success && "truncated" in result) {
            expect(result.truncated).toBeDefined();
            if (result.truncated) {
                expect(result.truncated.reason).toContain("would exceed");
                // Should have collected exactly 1 line (the 500KB line)
                expect(result.truncated.totalLines).toBe(1);
            }
        }
        // Output should contain only the first line (~500KB), not the second line
        expect(result.output?.length).toBeGreaterThanOrEqual(500000);
        expect(result.output?.length).toBeLessThan(600000);
        // Verify content is only 'A's, not 'B's
        expect(result.output).toContain("AAAA");
        expect(result.output).not.toContain("BBBB");
        tempDir[Symbol.dispose]();
    });
    it("should use tmpfile policy by default when overflow_policy not specified", async () => {
        const tempDir = new TestTempDir("test-bash-default");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
            // overflow_policy not specified - should default to tmpfile
        });
        const args = {
            run_in_background: false,
            script: "for i in {1..400}; do echo line$i; done",
            timeout_secs: 5,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            // Should use tmpfile behavior
            expect(result.output).toBe("");
            expect(result.note).toContain("[OUTPUT OVERFLOW");
            expect(result.note).toContain("saved to");
            expect(result.note).not.toContain("[OUTPUT TRUNCATED");
            expect(result.exitCode).toBe(0);
            // Verify temp file was created in runtimeTempDir
            expect(fs.existsSync(tempDir.path)).toBe(true);
            const files = fs.readdirSync(tempDir.path);
            const bashFiles = files.filter((f) => f.startsWith("bash-"));
            expect(bashFiles.length).toBe(1);
        }
        tempDir[Symbol.dispose]();
    });
    it("should preserve up to 100KB in temp file even after 16KB display limit", async () => {
        const tempDir = new TestTempDir("test-bash-100kb");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate ~50KB of output (well over 16KB display limit, under 100KB file limit)
        // Each line is ~40 bytes: "line" + number (1-5 digits) + padding = ~40 bytes
        // 50KB / 40 bytes = ~1250 lines
        const args = {
            run_in_background: false,
            script: "for i in {1..1300}; do printf 'line%04d with some padding text here\\n' $i; done",
            timeout_secs: 5,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            // Should hit display limit and save to temp file
            expect(result.output).toBe("");
            expect(result.note).toContain("[OUTPUT OVERFLOW");
            expect(result.note).toContain("saved to");
            expect(result.exitCode).toBe(0);
            // Extract and verify temp file
            const match = /saved to (\/.*?\.txt)/.exec(result.note ?? "");
            expect(match).toBeDefined();
            if (match) {
                const overflowPath = match[1];
                expect(fs.existsSync(overflowPath)).toBe(true);
                // Verify file contains ALL lines collected (should be ~1300 lines, ~50KB)
                const fileContent = fs.readFileSync(overflowPath, "utf-8");
                const fileLines = fileContent.split("\n").filter((l) => l.length > 0);
                // Should have collected all 1300 lines (not stopped at display limit)
                expect(fileLines.length).toBeGreaterThanOrEqual(1250);
                expect(fileLines.length).toBeLessThanOrEqual(1350);
                // Verify file size is between 45KB and 55KB
                const fileStats = fs.statSync(overflowPath);
                expect(fileStats.size).toBeGreaterThan(45 * 1024);
                expect(fileStats.size).toBeLessThan(55 * 1024);
                // Clean up
                fs.unlinkSync(overflowPath);
            }
        }
        tempDir[Symbol.dispose]();
    });
    it("should stop collection at 100KB file limit", async () => {
        const tempDir = new TestTempDir("test-bash-100kb-limit");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate ~150KB of output (exceeds 100KB file limit)
        // Each line is ~100 bytes
        // 150KB / 100 bytes = ~1500 lines
        const args = {
            run_in_background: false,
            script: "for i in {1..1600}; do printf 'line%04d: '; printf 'x%.0s' {1..80}; echo; done",
            timeout_secs: 10,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            // Should hit file limit
            expect(result.output).toBe("");
            expect(result.note).toContain("file preservation limit");
            expect(result.exitCode).toBe(0);
            // Extract and verify temp file
            const match = /saved to (\/.*?\.txt)/.exec(result.note ?? "");
            expect(match).toBeDefined();
            if (match) {
                const overflowPath = match[1];
                expect(fs.existsSync(overflowPath)).toBe(true);
                // Verify file is capped around 100KB (not 150KB)
                const fileStats = fs.statSync(overflowPath);
                expect(fileStats.size).toBeLessThanOrEqual(105 * 1024); // Allow 5KB buffer
                expect(fileStats.size).toBeGreaterThan(95 * 1024);
                // Clean up
                fs.unlinkSync(overflowPath);
            }
        }
        tempDir[Symbol.dispose]();
    });
    it("should NOT kill process at display limit (16KB) - verify command completes naturally", async () => {
        const tempDir = new TestTempDir("test-bash-no-kill-display");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate output that exceeds display limit but not file limit
        // Also includes a delay at the END to verify process wasn't killed early
        const args = {
            script: "for i in {1..500}; do printf 'line%04d with padding text\\n' $i; done; echo 'COMPLETION_MARKER'",
            timeout_secs: 5,
            run_in_background: false,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            // Should hit display limit
            expect(result.note).toContain("display limit");
            expect(result.exitCode).toBe(0);
            // Extract and verify temp file contains the completion marker
            const match = /saved to (\/.*?\.txt)/.exec(result.note ?? "");
            expect(match).toBeDefined();
            if (match) {
                const overflowPath = match[1];
                const fileContent = fs.readFileSync(overflowPath, "utf-8");
                // CRITICAL: File must contain COMPLETION_MARKER, proving command ran to completion
                // If process was killed at display limit, this marker would be missing
                expect(fileContent).toContain("COMPLETION_MARKER");
                // Clean up
                fs.unlinkSync(overflowPath);
            }
        }
        tempDir[Symbol.dispose]();
    });
    it("should kill process immediately when single line exceeds per-line limit", async () => {
        const tempDir = new TestTempDir("test-bash-per-line-kill");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate a single line exceeding 1KB limit, then try to output more
        const args = {
            run_in_background: false,
            script: "printf 'x%.0s' {1..2000}; echo; echo 'SHOULD_NOT_APPEAR'",
            timeout_secs: 5,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            // Should hit per-line limit (file truncation, not display)
            expect(result.output).toBe("");
            expect(result.note).toContain("per-line limit");
            expect(result.exitCode).toBe(0);
            // Extract and verify temp file does NOT contain the second echo
            const match = /saved to (\/.*?\.txt)/.exec(result.note ?? "");
            expect(match).toBeDefined();
            if (match) {
                const overflowPath = match[1];
                const fileContent = fs.readFileSync(overflowPath, "utf-8");
                // CRITICAL: File must NOT contain SHOULD_NOT_APPEAR
                // This proves process was killed immediately at per-line limit
                expect(fileContent).not.toContain("SHOULD_NOT_APPEAR");
                // Clean up
                fs.unlinkSync(overflowPath);
            }
        }
        tempDir[Symbol.dispose]();
    });
    it("should handle output just under 16KB without truncation", async () => {
        const tempDir = new TestTempDir("test-bash-under-limit");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate ~15KB of output (just under 16KB display limit)
        // Each line is ~50 bytes, 15KB / 50 = 300 lines exactly (at the line limit)
        const args = {
            run_in_background: false,
            script: "for i in {1..299}; do printf 'line%04d with some padding text here now\\n' $i; done",
            timeout_secs: 5,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        // Should succeed without overflow (299 lines < 300 line limit)
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.output).toContain("line0001");
            expect(result.output).toContain("line0299");
            // Should NOT have created a temp file
            const files = fs.readdirSync(tempDir.path);
            expect(files.length).toBe(0);
        }
        tempDir[Symbol.dispose]();
    });
    it("should trigger display truncation at exactly 300 lines", async () => {
        const tempDir = new TestTempDir("test-bash-exact-limit");
        const tool = createBashTool({
            ...getTestDeps(),
            cwd: process.cwd(),
            runtime: new LocalRuntime(process.cwd()),
            runtimeTempDir: tempDir.path,
        });
        // Generate exactly 300 lines (hits line limit exactly)
        const args = {
            run_in_background: false,
            script: "for i in {1..300}; do printf 'line%04d\\n' $i; done",
            timeout_secs: 5,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        // Should trigger display truncation at exactly 300 lines
        expect(result.success).toBe(true);
        if (isForegroundSuccess(result)) {
            expect(result.output).toBe("");
            expect(result.note).toContain("[OUTPUT OVERFLOW");
            expect(result.note).toContain("300 lines");
            expect(result.note).toContain("display limit");
            expect(result.exitCode).toBe(0);
        }
        tempDir[Symbol.dispose]();
    });
    it("should interleave stdout and stderr", async () => {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_13, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo stdout1 && echo stderr1 >&2 && echo stdout2 && echo stderr2 >&2",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                // Output should contain all lines interleaved
                expect(result.output).toContain("stdout1");
                expect(result.output).toContain("stderr1");
                expect(result.output).toContain("stdout2");
                expect(result.output).toContain("stderr2");
            }
        }
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            __disposeResources(env_13);
        }
    });
    it("should handle command failure with exit code", async () => {
        const env_14 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_14, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "exit 42",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.exitCode).toBe(42);
                expect(result.error).toContain("exited with code 42");
            }
        }
        catch (e_14) {
            env_14.error = e_14;
            env_14.hasError = true;
        }
        finally {
            __disposeResources(env_14);
        }
    });
    it("should timeout long-running commands", async () => {
        const env_15 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_15, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "while true; do sleep 0.1; done",
                timeout_secs: 1,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("timeout");
                expect(result.exitCode).toBe(-1);
            }
        }
        catch (e_15) {
            env_15.error = e_15;
            env_15.hasError = true;
        }
        finally {
            __disposeResources(env_15);
        }
    });
    it("should handle empty output", async () => {
        const env_16 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_16, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "true",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_16) {
            env_16.error = e_16;
            env_16.hasError = true;
        }
        finally {
            __disposeResources(env_16);
        }
    });
    it("should complete instantly for grep-like commands (regression test)", async () => {
        const env_17 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_17, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            // This test catches the bug where readline interface close events
            // weren't firing, causing commands with minimal output to hang
            const args = {
                script: "echo 'test:first-child' | grep ':first-child'",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toContain("first-child");
                expect(result.exitCode).toBe(0);
                // Should complete in well under 1 second (give 2s buffer for slow machines)
                expect(duration).toBeLessThan(2000);
            }
        }
        catch (e_17) {
            env_17.error = e_17;
            env_17.hasError = true;
        }
        finally {
            __disposeResources(env_17);
        }
    });
    it("should not hang on commands that read from stdin (cat test)", async () => {
        const env_18 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_18, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            // cat without input should complete immediately
            // This used to hang because stdin.close() would wait for acknowledgment
            // Fixed by using stdin.abort() for immediate closure
            const args = {
                script: "echo test | cat",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            // Should complete almost instantly (not wait for timeout)
            expect(duration).toBeLessThan(4000);
            // cat with no input should succeed with empty output (stdin is closed)
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toContain("test");
                expect(duration).toBeLessThan(2000);
            }
        }
        catch (e_18) {
            env_18.error = e_18;
            env_18.hasError = true;
        }
        finally {
            __disposeResources(env_18);
        }
    });
    it("should present stdin as a non-pipe for search tools", async () => {
        const env_19 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_19, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: 'python3 -c "import os,stat;mode=os.fstat(0).st_mode;print(stat.S_IFMT(mode)==stat.S_IFIFO)"',
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output.trim()).toBe("False");
            }
        }
        catch (e_19) {
            env_19.error = e_19;
            env_19.hasError = true;
        }
        finally {
            __disposeResources(env_19);
        }
    });
    it("should not hang on git rebase --continue", async () => {
        const env_20 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_20, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            // Extremely minimal case - just enough to trigger rebase --continue
            const script = `
      T=$(mktemp -d) && cd "$T"
      git init && git config user.email "t@t" && git config user.name "T" && git config commit.gpgsign false
      echo a > f && git add f && git commit -m a
      git checkout -b b && echo b > f && git commit -am b
      git checkout main && echo c > f && git commit -am c
      git rebase b || true
      echo resolved > f && git add f
      git rebase --continue
    `;
            const result = (await tool.execute({ script, timeout_secs: 5 }, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(duration).toBeLessThan(4000);
            expect(result).toBeDefined();
        }
        catch (e_20) {
            env_20.error = e_20;
            env_20.hasError = true;
        }
        finally {
            __disposeResources(env_20);
        }
    });
    it("should work with just script and timeout", async () => {
        const env_21 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_21, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo test",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("test");
            }
        }
        catch (e_21) {
            env_21.error = e_21;
            env_21.hasError = true;
        }
        finally {
            __disposeResources(env_21);
        }
    });
    it("should allow commands that don't start with cd", async () => {
        const env_22 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_22, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo 'cd' && echo test",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toContain("cd");
                expect(result.output).toContain("test");
            }
        }
        catch (e_22) {
            env_22.error = e_22;
            env_22.hasError = true;
        }
        finally {
            __disposeResources(env_22);
        }
    });
    it("should complete quickly when background process is spawned", async () => {
        const env_23 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_23, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            const args = {
                // Background process that would block if we waited for it
                script: "while true; do sleep 1; done > /dev/null 2>&1 &",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(result.success).toBe(true);
            // Should complete in well under 1 second, not wait for infinite loop
            expect(duration).toBeLessThan(2000);
        }
        catch (e_23) {
            env_23.error = e_23;
            env_23.hasError = true;
        }
        finally {
            __disposeResources(env_23);
        }
    });
    it("should complete quickly with background process and PID echo", async () => {
        const env_24 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_24, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            const args = {
                // Spawn background process, echo its PID, then exit
                // Should not wait for the background process
                script: "while true; do sleep 1; done > /dev/null 2>&1 & echo $!",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(result.success).toBe(true);
            if (result.success) {
                // Should output the PID
                expect(result.output).toMatch(/^\d+$/);
            }
            // Should complete quickly
            expect(duration).toBeLessThan(2000);
        }
        catch (e_24) {
            env_24.error = e_24;
            env_24.hasError = true;
        }
        finally {
            __disposeResources(env_24);
        }
    });
    it("should timeout background processes that don't complete", async () => {
        const env_25 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_25, createTestBashTool(), false);
            const tool = testEnv.tool;
            const startTime = performance.now();
            const args = {
                // Background process with output redirected but still blocking
                script: "while true; do sleep 0.1; done & wait",
                timeout_secs: 1,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            const duration = performance.now() - startTime;
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("timeout");
                expect(duration).toBeLessThan(2000);
            }
        }
        catch (e_25) {
            env_25.error = e_25;
            env_25.hasError = true;
        }
        finally {
            __disposeResources(env_25);
        }
    });
    it("should report overflow when line exceeds max line bytes", async () => {
        const env_26 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_26, createTestBashTool(), false);
            const tool = testEnv.tool;
            const longLine = "x".repeat(2000);
            const args = {
                script: `echo '${longLine}'`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toMatch(/exceeded per-line limit|OUTPUT OVERFLOW/);
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_26) {
            env_26.error = e_26;
            env_26.hasError = true;
        }
        finally {
            __disposeResources(env_26);
        }
    });
    it("should report overflow when total bytes limit exceeded", async () => {
        const env_27 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_27, createTestBashTool(), false);
            const tool = testEnv.tool;
            const lineContent = "x".repeat(100);
            const numLines = Math.ceil(BASH_MAX_TOTAL_BYTES / 100) + 50;
            const args = {
                script: `for i in {1..${numLines}}; do echo '${lineContent}'; done`,
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toMatch(/Total output exceeded limit|OUTPUT OVERFLOW/);
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_27) {
            env_27.error = e_27;
            env_27.hasError = true;
        }
        finally {
            __disposeResources(env_27);
        }
    });
    it("should report overflow when byte limit is reached", async () => {
        const env_28 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_28, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                run_in_background: false,
                script: `for i in {1..1000}; do echo 'This is line number '$i' with some content'; done`,
                timeout_secs: 5,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (isForegroundSuccess(result)) {
                expect(result.output).toBe("");
                expect(result.note).toMatch(/Total output exceeded limit|OUTPUT OVERFLOW/);
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_28) {
            env_28.error = e_28;
            env_28.hasError = true;
        }
        finally {
            __disposeResources(env_28);
        }
    });
    it("should fail immediately when script is empty", async () => {
        const env_29 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_29, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("Script parameter is empty");
                expect(result.error).toContain("malformed tool call");
                expect(result.exitCode).toBe(-1);
                expect(result.wall_duration_ms).toBe(0);
            }
        }
        catch (e_29) {
            env_29.error = e_29;
            env_29.hasError = true;
        }
        finally {
            __disposeResources(env_29);
        }
    });
    describe("script sanitization", () => {
        const shouldRewriteNullRedirects = process.platform === "win32";
        it("should rewrite >nul to /dev/null (and not create a `nul` file)", async () => {
            const env_30 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_30, new TestTempDir("test-bash-nul-redirect"), false);
                const tool = createBashTool(createTestToolConfig(tempDir.path));
                const args = {
                    script: "echo hello >nul",
                    timeout_secs: 5,
                    run_in_background: false,
                    display_name: "test",
                };
                const result = (await tool.execute(args, mockToolCallOptions));
                expect(result.success).toBe(true);
                if (isForegroundSuccess(result)) {
                    if (shouldRewriteNullRedirects) {
                        expect(result.note).toContain("Rewrote `>nul`/`2>nul`");
                    }
                    else {
                        expect(result.note).toBeUndefined();
                    }
                }
                expect(fs.existsSync(path.join(tempDir.path, "nul"))).toBe(!shouldRewriteNullRedirects);
            }
            catch (e_30) {
                env_30.error = e_30;
                env_30.hasError = true;
            }
            finally {
                __disposeResources(env_30);
            }
        });
        it("should rewrite 2>nul to /dev/null (and not create a `nul` file)", async () => {
            const env_31 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_31, new TestTempDir("test-bash-nul-redirect-stderr"), false);
                const tool = createBashTool(createTestToolConfig(tempDir.path));
                const args = {
                    script: "ls does-not-exist 2>nul || true",
                    timeout_secs: 5,
                    run_in_background: false,
                    display_name: "test",
                };
                const result = (await tool.execute(args, mockToolCallOptions));
                expect(result.success).toBe(true);
                if (isForegroundSuccess(result)) {
                    if (shouldRewriteNullRedirects) {
                        expect(result.note).toContain("Rewrote `>nul`/`2>nul`");
                    }
                    else {
                        expect(result.note).toBeUndefined();
                    }
                }
                expect(fs.existsSync(path.join(tempDir.path, "nul"))).toBe(!shouldRewriteNullRedirects);
            }
            catch (e_31) {
                env_31.error = e_31;
                env_31.hasError = true;
            }
            finally {
                __disposeResources(env_31);
            }
        });
        it("should not rewrite an explicit path like >./nul", async () => {
            const env_32 = { stack: [], error: void 0, hasError: false };
            try {
                const tempDir = __addDisposableResource(env_32, new TestTempDir("test-bash-dot-nul"), false);
                const tool = createBashTool(createTestToolConfig(tempDir.path));
                const args = {
                    script: "echo hello >./nul",
                    timeout_secs: 5,
                    run_in_background: false,
                    display_name: "test",
                };
                const result = (await tool.execute(args, mockToolCallOptions));
                expect(result.success).toBe(true);
                if (isForegroundSuccess(result)) {
                    expect(result.note).toBeUndefined();
                }
                expect(fs.existsSync(path.join(tempDir.path, "nul"))).toBe(true);
            }
            catch (e_32) {
                env_32.error = e_32;
                env_32.hasError = true;
            }
            finally {
                __disposeResources(env_32);
            }
        });
    });
    it("should fail immediately when script is only whitespace", async () => {
        const env_33 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_33, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "   \n\t  ",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("Script parameter is empty");
                expect(result.exitCode).toBe(-1);
                expect(result.wall_duration_ms).toBe(0);
            }
        }
        catch (e_33) {
            env_33.error = e_33;
            env_33.hasError = true;
        }
        finally {
            __disposeResources(env_33);
        }
    });
    it("should allow sleep command at start of script", async () => {
        const env_34 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_34, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "sleep 0.1; echo done",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("done");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_34) {
            env_34.error = e_34;
            env_34.hasError = true;
        }
        finally {
            __disposeResources(env_34);
        }
    });
    it("should allow sleep in polling loops", async () => {
        const env_35 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_35, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "for i in 1 2 3; do echo $i; sleep 0.1; done",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toContain("1");
                expect(result.output).toContain("2");
                expect(result.output).toContain("3");
            }
        }
        catch (e_35) {
            env_35.error = e_35;
            env_35.hasError = true;
        }
        finally {
            __disposeResources(env_35);
        }
    });
    it("should use default timeout (3s) when timeout_secs is undefined", async () => {
        const env_36 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_36, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo hello",
                timeout_secs: undefined,
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("hello");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_36) {
            env_36.error = e_36;
            env_36.hasError = true;
        }
        finally {
            __disposeResources(env_36);
        }
    });
    it("should use default timeout (3s) when timeout_secs is omitted", async () => {
        const env_37 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_37, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo hello",
                // timeout_secs omitted entirely
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toBe("hello");
                expect(result.exitCode).toBe(0);
            }
        }
        catch (e_37) {
            env_37.error = e_37;
            env_37.hasError = true;
        }
        finally {
            __disposeResources(env_37);
        }
    });
    // Note: Zero and negative timeout_secs are rejected by Zod schema validation
    // before reaching the execute function, so these cases are handled at the schema level
});
describe("zombie process cleanup", () => {
    it("should not create zombie processes when spawning background tasks", async () => {
        const env_38 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_38, createTestBashTool(), false);
            const tool = testEnv.tool;
            // Spawn a background sleep process that would become a zombie if not cleaned up
            // Use a unique marker to identify our test process
            const marker = `zombie-test-${Date.now()}`;
            const args = {
                script: `echo "${marker}"; sleep 100 & echo $!`,
                timeout_secs: 1,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            // Tool should complete successfully
            expect(result.success).toBe(true);
            if (result.success) {
                const env_39 = { stack: [], error: void 0, hasError: false };
                try {
                    expect(result.output).toContain(marker);
                    const lines = result.output.split("\n");
                    const bgPid = lines[1]; // Second line should be the background PID
                    // Give a moment for cleanup to happen
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    // Verify the background process was killed (process group cleanup)
                    const checkEnv = __addDisposableResource(env_39, createTestBashTool(), false);
                    const checkResult = (await checkEnv.tool.execute({
                        script: `ps -p ${bgPid} > /dev/null 2>&1 && echo "ALIVE" || echo "DEAD"`,
                        timeout_secs: 1,
                    }, mockToolCallOptions));
                    expect(checkResult.success).toBe(true);
                    if (checkResult.success) {
                        expect(checkResult.output).toBe("DEAD");
                    }
                }
                catch (e_38) {
                    env_39.error = e_38;
                    env_39.hasError = true;
                }
                finally {
                    __disposeResources(env_39);
                }
            }
        }
        catch (e_39) {
            env_38.error = e_39;
            env_38.hasError = true;
        }
        finally {
            __disposeResources(env_38);
        }
    });
    it("should kill all processes when aborted via AbortController", async () => {
        const env_40 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_40, createTestBashTool(), false);
            const tool = testEnv.tool;
            // Create AbortController to simulate user interruption
            const abortController = new AbortController();
            // Use unique token to identify our test processes
            const token = (100 + Math.random() * 100).toFixed(4); // Unique duration for grep
            // Spawn a command that creates child processes (simulating cargo build)
            const args = {
                script: `
        # Simulate cargo spawning rustc processes
        for i in {1..5}; do
          (echo "child-\${i}"; exec sleep ${token}) &
          echo "SPAWNED:$!"
        done
        echo "ALL_SPAWNED"
        # Wait so we can abort while children are running
        exec sleep ${token}
      `,
                timeout_secs: 10,
                run_in_background: false,
                display_name: "test",
            };
            // Start the command
            const resultPromise = tool.execute(args, {
                ...mockToolCallOptions,
                abortSignal: abortController.signal,
            });
            // Wait for children to spawn
            await new Promise((resolve) => setTimeout(resolve, 500));
            // Abort the operation (simulating Ctrl+C)
            abortController.abort();
            // Wait for the result
            const result = await resultPromise;
            // Command should be aborted
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("aborted");
            }
            // Wait for all processes to be cleaned up (SIGKILL needs time to propagate in CI)
            // Retry with exponential backoff instead of fixed wait
            // Use ps + grep to avoid pgrep matching itself
            let remainingProcesses = -1;
            for (let attempt = 0; attempt < 5; attempt++) {
                const env_41 = { stack: [], error: void 0, hasError: false };
                try {
                    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
                    const checkEnv = __addDisposableResource(env_41, createTestBashTool(), false);
                    const checkResult = (await checkEnv.tool.execute({
                        script: `ps aux | grep "sleep ${token}" | grep -v grep | wc -l`,
                        timeout_secs: 1,
                    }, mockToolCallOptions));
                    expect(checkResult.success).toBe(true);
                    if (checkResult.success) {
                        remainingProcesses = parseInt(checkResult.output.trim());
                        if (remainingProcesses === 0) {
                            break;
                        }
                    }
                }
                catch (e_40) {
                    env_41.error = e_40;
                    env_41.hasError = true;
                }
                finally {
                    __disposeResources(env_41);
                }
            }
            expect(remainingProcesses).toBe(0);
        }
        catch (e_41) {
            env_40.error = e_41;
            env_40.hasError = true;
        }
        finally {
            __disposeResources(env_40);
        }
    });
    it("should abort quickly when command produces continuous output", async () => {
        const env_42 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_42, createTestBashTool(), false);
            const tool = testEnv.tool;
            // Create AbortController to simulate user interruption
            const abortController = new AbortController();
            // Command that produces slow, continuous output
            // The key is it keeps running, so the abort happens while reader.read() is waiting
            const args = {
                script: `
        # Produce continuous output slowly (prevents hitting truncation limits)
        for i in {1..1000}; do
          echo "Output line $i"
          sleep 0.1
        done
      `,
                timeout_secs: 120,
                run_in_background: false,
                display_name: "test",
            };
            // Start the command
            const resultPromise = tool.execute(args, {
                ...mockToolCallOptions,
                abortSignal: abortController.signal,
            });
            // Wait for output to start (give it time to produce a few lines)
            await new Promise((resolve) => setTimeout(resolve, 250));
            // Abort the operation while it's still producing output
            const abortTime = Date.now();
            abortController.abort();
            // Wait for the result with a timeout to detect hangs
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Test timeout - tool did not abort quickly")), 5000));
            const result = (await Promise.race([resultPromise, timeoutPromise]));
            const duration = Date.now() - abortTime;
            // Command should be aborted
            expect(result.success).toBe(false);
            if (!result.success) {
                // Error should mention abort or indicate the process was killed
                const errorText = result.error.toLowerCase();
                expect(errorText.includes("abort") ||
                    errorText.includes("killed") ||
                    errorText.includes("signal") ||
                    result.exitCode === -1).toBe(true);
            }
            // CRITICAL: Tool should return quickly after abort (< 2s)
            // This is the regression test - without checking abort signal in consumeStream(),
            // the tool hangs until the streams close (which can take a long time)
            expect(duration).toBeLessThan(2000);
        }
        catch (e_42) {
            env_42.error = e_42;
            env_42.hasError = true;
        }
        finally {
            __disposeResources(env_42);
        }
    });
});
describe("muxEnv environment variables", () => {
    it("should inject MUX_ environment variables when muxEnv is provided", async () => {
        const env_43 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_43, new TestTempDir("test-mux-env"), false);
            const config = createTestToolConfig(process.cwd());
            config.runtimeTempDir = tempDir.path;
            config.muxEnv = {
                MUX_PROJECT_PATH: "/test/project/path",
                MUX_RUNTIME: "worktree",
                MUX_WORKSPACE_NAME: "feature-branch",
            };
            const tool = createBashTool(config);
            const args = {
                script: 'echo "PROJECT:$MUX_PROJECT_PATH RUNTIME:$MUX_RUNTIME WORKSPACE:$MUX_WORKSPACE_NAME"',
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.output).toContain("PROJECT:/test/project/path");
                expect(result.output).toContain("RUNTIME:worktree");
                expect(result.output).toContain("WORKSPACE:feature-branch");
            }
        }
        catch (e_43) {
            env_43.error = e_43;
            env_43.hasError = true;
        }
        finally {
            __disposeResources(env_43);
        }
    });
    it("should allow secrets to override muxEnv", async () => {
        const env_44 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_44, new TestTempDir("test-mux-env-override"), false);
            const config = createTestToolConfig(process.cwd());
            config.runtimeTempDir = tempDir.path;
            config.muxEnv = {
                MUX_PROJECT_PATH: "/mux/path",
                CUSTOM_VAR: "from-mux",
            };
            config.secrets = {
                CUSTOM_VAR: "from-secrets",
            };
            const tool = createBashTool(config);
            const args = {
                script: 'echo "MUX:$MUX_PROJECT_PATH CUSTOM:$CUSTOM_VAR"',
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            if (result.success) {
                // MUX_PROJECT_PATH from muxEnv should be present
                expect(result.output).toContain("MUX:/mux/path");
                // Secrets should override muxEnv when there's a conflict
                expect(result.output).toContain("CUSTOM:from-secrets");
            }
        }
        catch (e_44) {
            env_44.error = e_44;
            env_44.hasError = true;
        }
        finally {
            __disposeResources(env_44);
        }
    });
});
describe("SSH runtime redundant cd detection", () => {
    // Helper to create bash tool with SSH runtime configuration
    // Note: These tests check redundant cd detection logic only - they don't actually execute via SSH
    function createTestBashToolWithSSH(cwd) {
        const tempDir = new TestTempDir("test-bash-ssh");
        const sshConfig = {
            type: "ssh",
            host: "test-host",
            srcBaseDir: "/remote/base",
        };
        const sshRuntime = createRuntime(sshConfig);
        // Pre-mark connection as healthy to skip actual SSH probe in tests
        sshConnectionPool.markHealthy(sshConfig);
        const tool = createBashTool({
            ...getTestDeps(),
            cwd,
            runtime: sshRuntime,
            runtimeTempDir: tempDir.path,
        });
        return {
            tool,
            [Symbol.dispose]() {
                tempDir[Symbol.dispose]();
            },
        };
    }
    it("should reject redundant cd when command cds to working directory", async () => {
        const env_45 = { stack: [], error: void 0, hasError: false };
        try {
            const remoteCwd = "/remote/workspace/project/branch";
            const testEnv = __addDisposableResource(env_45, createTestBashToolWithSSH(remoteCwd), false);
            const tool = testEnv.tool;
            const args = {
                script: "cd /remote/workspace/project/branch && echo test",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            // Should reject the redundant cd
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("Redundant cd to working directory");
                expect(result.error).toContain("no cd needed");
                expect(result.exitCode).toBe(-1);
            }
        }
        catch (e_45) {
            env_45.error = e_45;
            env_45.hasError = true;
        }
        finally {
            __disposeResources(env_45);
        }
    });
    it("should not treat cd to a different directory as redundant", () => {
        // Only testing normalization here - SSH execution would hang (no real host).
        const remoteCwd = "/remote/workspace/project/branch";
        const sshRuntime = createRuntime({
            type: "ssh",
            host: "test-host",
            srcBaseDir: "/remote/base",
        });
        const normalizedTarget = sshRuntime.normalizePath("/tmp", remoteCwd);
        const normalizedCwd = sshRuntime.normalizePath(".", remoteCwd);
        expect(normalizedTarget).not.toBe(normalizedCwd);
    });
});
describe("bash tool - tool_env", () => {
    it("should source .mux/tool_env before running script", async () => {
        const env_46 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_46, new TestTempDir("test-bash-tool-env"), false);
            const muxDir = `${tempDir.path}/.mux`;
            fs.mkdirSync(muxDir, { recursive: true });
            fs.writeFileSync(`${muxDir}/tool_env`, "export MUX_TEST_VAR=from_tool_env");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: "echo $MUX_TEST_VAR",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            expect(result.output).toBe("from_tool_env");
        }
        catch (e_46) {
            env_46.error = e_46;
            env_46.hasError = true;
        }
        finally {
            __disposeResources(env_46);
        }
    });
    it("should fail with clear error if tool_env sourcing fails", async () => {
        const env_47 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_47, new TestTempDir("test-bash-tool-env-fail"), false);
            const muxDir = `${tempDir.path}/.mux`;
            fs.mkdirSync(muxDir, { recursive: true });
            // Fail `source` without terminating the parent shell.
            fs.writeFileSync(`${muxDir}/tool_env`, "return 1");
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: "echo should_not_run",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.output).toContain("failed to source");
        }
        catch (e_47) {
            env_47.error = e_47;
            env_47.hasError = true;
        }
        finally {
            __disposeResources(env_47);
        }
    });
    it("should run script normally when no tool_env exists", async () => {
        const env_48 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_48, new TestTempDir("test-bash-no-tool-env"), false);
            const config = createTestToolConfig(tempDir.path);
            config.runtimeTempDir = tempDir.path;
            const tool = createBashTool(config);
            const args = {
                script: "echo normal_execution",
                timeout_secs: 5,
                run_in_background: false,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(true);
            expect(result.output).toBe("normal_execution");
        }
        catch (e_48) {
            env_48.error = e_48;
            env_48.hasError = true;
        }
        finally {
            __disposeResources(env_48);
        }
    });
});
describe("bash tool - background execution", () => {
    it("should reject background mode when manager not available", async () => {
        const env_49 = { stack: [], error: void 0, hasError: false };
        try {
            const testEnv = __addDisposableResource(env_49, createTestBashTool(), false);
            const tool = testEnv.tool;
            const args = {
                script: "echo test",
                timeout_secs: 5,
                run_in_background: true,
                display_name: "test",
            };
            const result = (await tool.execute(args, mockToolCallOptions));
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain("Background execution is only available for AI tool calls");
            }
        }
        catch (e_49) {
            env_49.error = e_49;
            env_49.hasError = true;
        }
        finally {
            __disposeResources(env_49);
        }
    });
    it("should accept timeout with background mode for auto-termination", async () => {
        const manager = new BackgroundProcessManager("/tmp/mux-test-bg");
        const tempDir = new TestTempDir("test-bash-bg");
        const config = createTestToolConfig(tempDir.path);
        config.backgroundProcessManager = manager;
        const tool = createBashTool(config);
        const args = {
            script: "echo test",
            timeout_secs: 5,
            run_in_background: true,
            display_name: "test-timeout-bg",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        // Background with timeout should succeed - timeout is used for auto-termination
        expect(result.success).toBe(true);
        if (result.success && "backgroundProcessId" in result) {
            expect(result.backgroundProcessId).toBe("test-timeout-bg");
        }
        await manager.terminateAll();
        tempDir[Symbol.dispose]();
    });
    it("should start background process and return process ID", async () => {
        const manager = new BackgroundProcessManager("/tmp/mux-test-bg");
        const tempDir = new TestTempDir("test-bash-bg");
        const config = createTestToolConfig(tempDir.path);
        config.backgroundProcessManager = manager;
        const tool = createBashTool(config);
        const args = {
            script: "echo hello",
            timeout_secs: 5,
            run_in_background: true,
            display_name: "test",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (result.success && "backgroundProcessId" in result) {
            expect(result.backgroundProcessId).toBeDefined();
            // Process ID is now the display name directly
            expect(result.backgroundProcessId).toBe("test");
        }
        else {
            throw new Error("Expected background process ID in result");
        }
        tempDir[Symbol.dispose]();
    });
    it("should inject muxEnv environment variables in background mode", async () => {
        const manager = new BackgroundProcessManager("/tmp/mux-test-bg");
        const tempDir = new TestTempDir("test-bash-bg-mux-env");
        const config = createTestToolConfig(tempDir.path);
        config.backgroundProcessManager = manager;
        config.muxEnv = {
            MUX_MODEL_STRING: "openai:gpt-5.2",
            MUX_THINKING_LEVEL: "medium",
        };
        const tool = createBashTool(config);
        const args = {
            script: 'echo "MODEL:$MUX_MODEL_STRING THINKING:$MUX_THINKING_LEVEL"',
            timeout_secs: 5,
            run_in_background: true,
            display_name: "test-mux-env-bg",
        };
        const result = (await tool.execute(args, mockToolCallOptions));
        expect(result.success).toBe(true);
        if (result.success && "backgroundProcessId" in result) {
            const outputResult = await manager.getOutput(result.backgroundProcessId, undefined, undefined, 2);
            expect(outputResult.success).toBe(true);
            if (outputResult.success) {
                expect(outputResult.output).toContain("MODEL:openai:gpt-5.2");
                expect(outputResult.output).toContain("THINKING:medium");
            }
        }
        else {
            throw new Error("Expected background process ID in result");
        }
        await manager.terminateAll();
        tempDir[Symbol.dispose]();
    });
});
//# sourceMappingURL=bash.test.js.map