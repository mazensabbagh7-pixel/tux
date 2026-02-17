/**
 * SSH2 Transport Integration Tests
 *
 * Focused tests for the SSH2 transport (ssh2 npm library) against a real
 * Docker SSH server. These tests are isolated from the main runtime suite
 * to keep SSH2-specific coverage small and easy to diagnose.
 *
 * Tests use the same Docker fixture as runtime.test.ts but explicitly use
 * `createSSHTransport(config, true)` to exercise the SSH2 code path.
 */
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
import { isDockerAvailable, startSSHServer, stopSSHServer, } from "./test-fixtures/ssh-fixture";
import { TestWorkspace } from "./test-fixtures/test-helpers";
import { SSHRuntime } from "@/node/runtime/SSHRuntime";
import { createSSHTransport } from "@/node/runtime/transports";
import { execBuffered, readFileString, writeFileString } from "@/node/utils/runtime/helpers";
import { sshConnectionPool } from "@/node/runtime/sshConnectionPool";
import { ssh2ConnectionPool } from "@/node/runtime/SSH2ConnectionPool";
function shouldRunIntegrationTests() {
    return process.env.TEST_INTEGRATION === "1" || process.env.TEST_INTEGRATION === "true";
}
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;
let sshConfig;
/**
 * Create an SSHRuntime using the SSH2 transport (not OpenSSH)
 */
function createSSH2Runtime(config) {
    const sshRuntimeConfig = {
        host: "testuser@localhost",
        srcBaseDir: config.workdir,
        identityFile: config.privateKeyPath,
        port: config.port,
    };
    // useSSH2 = true to exercise the ssh2 library transport
    return new SSHRuntime(sshRuntimeConfig, createSSHTransport(sshRuntimeConfig, true));
}
describeIntegration("SSH2 Transport integration tests", () => {
    beforeAll(async () => {
        if (!(await isDockerAvailable())) {
            throw new Error("Docker is required for SSH2 integration tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION.");
        }
        console.log("Starting SSH server container for SSH2 tests...");
        sshConfig = await startSSHServer();
        console.log(`SSH server ready on port ${sshConfig.port}`);
    }, 120000);
    afterAll(async () => {
        if (sshConfig) {
            console.log("Stopping SSH server container...");
            await stopSSHServer(sshConfig);
        }
    }, 30000);
    // Reset SSH connection pool state before each test to prevent backoff from one
    // test affecting subsequent tests.
    beforeEach(() => {
        sshConnectionPool.clearAllHealth();
        ssh2ConnectionPool.clearAllHealth();
    });
    describe("exec() - Command execution via SSH2", () => {
        test("returns correct exit code for failed commands", async () => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const runtime = createSSH2Runtime(sshConfig);
                const workspace = __addDisposableResource(env_1, await TestWorkspace.create(runtime, "ssh"), true);
                const result = await execBuffered(runtime, "exit 42", {
                    cwd: workspace.path,
                    timeout: 30,
                });
                expect(result.exitCode).toBe(42);
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                const result_1 = __disposeResources(env_1);
                if (result_1)
                    await result_1;
            }
        });
        test("captures stderr separately", async () => {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const runtime = createSSH2Runtime(sshConfig);
                const workspace = __addDisposableResource(env_2, await TestWorkspace.create(runtime, "ssh"), true);
                const result = await execBuffered(runtime, 'echo "out" && echo "err" >&2', {
                    cwd: workspace.path,
                    timeout: 30,
                });
                expect(result.exitCode).toBe(0);
                expect(result.stdout.trim()).toBe("out");
                expect(result.stderr.trim()).toBe("err");
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                const result_2 = __disposeResources(env_2);
                if (result_2)
                    await result_2;
            }
        });
    });
    describe("File operations via SSH2", () => {
        test("writes and reads file roundtrip", async () => {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const runtime = createSSH2Runtime(sshConfig);
                const workspace = __addDisposableResource(env_3, await TestWorkspace.create(runtime, "ssh"), true);
                const testContent = "Hello from SSH2 transport test!\nLine 2\n";
                const filePath = `${workspace.path}/test-file.txt`;
                await writeFileString(runtime, filePath, testContent);
                const readContent = await readFileString(runtime, filePath);
                expect(readContent).toBe(testContent);
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                const result_3 = __disposeResources(env_3);
                if (result_3)
                    await result_3;
            }
        });
        test("handles binary-like content", async () => {
            const env_4 = { stack: [], error: void 0, hasError: false };
            try {
                const runtime = createSSH2Runtime(sshConfig);
                const workspace = __addDisposableResource(env_4, await TestWorkspace.create(runtime, "ssh"), true);
                // Content with special characters that might trip up text handling
                const testContent = "Line with special chars: \t\r\nUnicode: 日本語 émojis: 🚀\n";
                const filePath = `${workspace.path}/special-chars.txt`;
                await writeFileString(runtime, filePath, testContent);
                const readContent = await readFileString(runtime, filePath);
                expect(readContent).toBe(testContent);
            }
            catch (e_4) {
                env_4.error = e_4;
                env_4.hasError = true;
            }
            finally {
                const result_4 = __disposeResources(env_4);
                if (result_4)
                    await result_4;
            }
        });
    });
});
//# sourceMappingURL=ssh2-runtime.test.js.map