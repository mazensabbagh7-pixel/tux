/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { execAsync } from "./disposableExec";
/**
 * Tests for DisposableExec - verifies no process leaks under any scenario
 *
 * These tests access internal implementation details (child process) to verify cleanup.
 * The eslint disables are necessary for test verification purposes.
 */
describe("disposableExec", () => {
    const activeProcesses = new Set();
    beforeEach(() => {
        activeProcesses.clear();
    });
    afterEach(() => {
        // Verify all processes are cleaned up after each test
        for (const proc of activeProcesses) {
            const hasExited = proc.exitCode !== null || proc.signalCode !== null;
            expect(hasExited || proc.killed).toBe(true);
            if (!hasExited && !proc.killed) {
                proc.kill();
            }
        }
        activeProcesses.clear();
    });
    test("successful command completes and cleans up automatically", async () => {
        let childProc;
        {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_1, execAsync("echo 'hello world'"), false);
                childProc = proc.child;
                activeProcesses.add(childProc);
                const { stdout } = await proc.result;
                expect(stdout.trim()).toBe("hello world");
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        // After scope exit, process should be exited
        expect(childProc.exitCode).toBe(0);
        expect(childProc.killed).toBe(false);
    });
    test("failed command completes and cleans up automatically", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_2, execAsync("exit 1"), false);
            const childProc = proc.child;
            activeProcesses.add(childProc);
            try {
                await proc.result;
                expect(true).toBe(false); // Should not reach here
            }
            catch (error) {
                expect(error.code).toBe(1);
            }
            // After scope exit, process should be exited
            expect(childProc.exitCode).toBe(1);
            expect(childProc.killed).toBe(false);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    test("disposing before completion kills the process", async () => {
        const proc = execAsync("sleep 2");
        const childProc = proc.child;
        activeProcesses.add(childProc);
        // Give process time to start
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(childProc.exitCode).toBeNull();
        expect(childProc.signalCode).toBeNull();
        // Explicit disposal - kill the process
        proc[Symbol.dispose]();
        // Wait for process to be killed
        await new Promise((resolve) => {
            if (childProc.killed) {
                resolve(undefined);
            }
            else {
                childProc.once("exit", () => resolve(undefined));
            }
        });
        // Process should be killed
        expect(childProc.killed).toBe(true);
        // Result promise should reject since we killed it
        await expect(proc.result).rejects.toThrow();
    });
    test("using block disposes and kills long-running process", async () => {
        let childProc;
        let resultPromise;
        {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_3, execAsync("sleep 2"), false);
                childProc = proc.child;
                resultPromise = proc.result;
                activeProcesses.add(childProc);
                // Give process time to start
                await new Promise((resolve) => setTimeout(resolve, 50));
                expect(childProc.exitCode).toBeNull();
                expect(childProc.signalCode).toBeNull();
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        }
        // Wait for process to be killed
        await new Promise((resolve) => {
            if (childProc.killed || childProc.exitCode !== null) {
                resolve(undefined);
            }
            else {
                childProc.once("exit", () => resolve(undefined));
            }
        });
        // Process should be killed
        expect(childProc.killed).toBe(true);
        // Result should reject since we killed it
        await expect(resultPromise).rejects.toThrow();
    });
    test("disposing already-exited process is safe", async () => {
        const proc = execAsync("echo 'test'");
        const childProc = proc.child;
        activeProcesses.add(childProc);
        await proc.result;
        // Process already exited
        expect(childProc.exitCode).toBe(0);
        // Should not throw or cause issues
        proc[Symbol.dispose]();
        // Still exited, not killed
        expect(childProc.exitCode).toBe(0);
        expect(childProc.killed).toBe(false);
    });
    test("stdout and stderr are captured correctly", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_4, execAsync("echo 'stdout message' && echo 'stderr message' >&2"), false);
            const childProc = proc.child;
            activeProcesses.add(childProc);
            const { stdout, stderr } = await proc.result;
            expect(stdout.trim()).toBe("stdout message");
            expect(stderr.trim()).toBe("stderr message");
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    test("error includes stderr content", async () => {
        try {
            const env_5 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_5, execAsync("echo 'error details' >&2 && exit 42"), false);
                const childProc = proc.child;
                activeProcesses.add(childProc);
                await proc.result;
                expect(true).toBe(false); // Should not reach
            }
            catch (e_5) {
                env_5.error = e_5;
                env_5.hasError = true;
            }
            finally {
                __disposeResources(env_5);
            }
        }
        catch (error) {
            expect(error.code).toBe(42);
            expect(error.stderr.trim()).toBe("error details");
            expect(error.message).toContain("error details");
        }
    });
    test("multiple processes in parallel all clean up", async () => {
        const childProcs = [];
        await Promise.all(Array.from({ length: 5 }, async (_, i) => {
            const env_6 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_6, execAsync(`echo 'process ${i}'`), false);
                const childProc = proc.child;
                childProcs.push(childProc);
                activeProcesses.add(childProc);
                const { stdout } = await proc.result;
                expect(stdout.trim()).toBe(`process ${i}`);
            }
            catch (e_6) {
                env_6.error = e_6;
                env_6.hasError = true;
            }
            finally {
                __disposeResources(env_6);
            }
        }));
        // All processes should be exited
        for (const proc of childProcs) {
            expect(proc.exitCode).toBe(0);
        }
    });
    test("exception during process handling still cleans up", async () => {
        let childProc;
        let resultPromise;
        try {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_7, execAsync("sleep 2"), false);
                childProc = proc.child;
                resultPromise = proc.result;
                activeProcesses.add(childProc);
                // Give process time to start
                await new Promise((resolve) => setTimeout(resolve, 50));
                // Throw exception before awaiting result - disposal will happen when leaving this block
                throw new Error("Simulated error");
            }
            catch (e_7) {
                env_7.error = e_7;
                env_7.hasError = true;
            }
            finally {
                __disposeResources(env_7);
            }
        }
        catch (error) {
            expect(error.message).toBe("Simulated error");
        }
        // Wait for process to be killed
        if (childProc) {
            await new Promise((resolve) => {
                if (childProc.killed || childProc.exitCode !== null) {
                    resolve(undefined);
                }
                else {
                    childProc.once("exit", () => resolve(undefined));
                }
            });
        }
        // Process should be killed despite exception
        expect(childProc?.killed).toBe(true);
        // After leaving try block, disposal has occurred
        // Result should reject since we killed it via disposal
        await expect(resultPromise).rejects.toThrow();
    });
    test("process killed by signal is handled correctly", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const proc = __addDisposableResource(env_8, execAsync("sleep 2"), false);
            const childProc = proc.child;
            activeProcesses.add(childProc);
            try {
                // Give process time to start
                await new Promise((resolve) => setTimeout(resolve, 50));
                // Manually kill with SIGTERM
                childProc.kill("SIGTERM");
                await proc.result;
                expect(true).toBe(false); // Should not reach
            }
            catch (error) {
                expect(error.signal).toBe("SIGTERM");
                expect(error.message).toContain("SIGTERM");
            }
            // Wait for process to fully exit
            await new Promise((resolve) => {
                if (childProc.exitCode !== null || childProc.signalCode !== null) {
                    resolve(undefined);
                }
                else {
                    childProc.once("exit", () => resolve(undefined));
                }
            });
            // Process should be killed
            expect(childProc.killed).toBe(true);
            expect(childProc.signalCode).toBe("SIGTERM");
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    test("early disposal prevents result promise from hanging", async () => {
        const proc = execAsync("sleep 2");
        const childProc = proc.child;
        activeProcesses.add(childProc);
        // Give process time to start
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Dispose immediately
        proc[Symbol.dispose]();
        // Wait for process to be killed
        await new Promise((resolve) => {
            if (childProc.killed || childProc.exitCode !== null) {
                resolve(undefined);
            }
            else {
                childProc.once("exit", () => resolve(undefined));
            }
        });
        // Process should be killed
        expect(childProc.killed).toBe(true);
        // Result should reject, not hang forever
        await expect(proc.result).rejects.toThrow();
    });
    test("dispose is idempotent - calling multiple times is safe", async () => {
        const proc = execAsync("sleep 2");
        const childProc = proc.child;
        activeProcesses.add(childProc);
        // Give process time to start
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Multiple dispose calls should be safe
        proc[Symbol.dispose]();
        proc[Symbol.dispose]();
        proc[Symbol.dispose]();
        // Wait for process to be killed
        await new Promise((resolve) => {
            if (childProc.killed || childProc.exitCode !== null) {
                resolve(undefined);
            }
            else {
                childProc.once("exit", () => resolve(undefined));
            }
        });
        // Process should be killed once
        expect(childProc.killed).toBe(true);
        // Result should reject since we killed it
        await expect(proc.result).rejects.toThrow();
    });
    test("close event waits for stdio to flush", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            // Generate large output to test stdio buffering
            const largeOutput = "x".repeat(100000);
            const proc = __addDisposableResource(env_9, execAsync(`echo '${largeOutput}'`), false);
            const childProc = proc.child;
            activeProcesses.add(childProc);
            const { stdout } = await proc.result;
            // Should receive all output, not truncated
            expect(stdout.trim()).toBe(largeOutput);
            expect(stdout.trim().length).toBe(largeOutput.length);
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    });
});
//# sourceMappingURL=disposableExec.test.js.map