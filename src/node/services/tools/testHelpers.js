import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { InitStateManager } from "@/node/services/initStateManager";
import { Config } from "@/node/config";
import { log } from "@/node/services/log";
/**
 * Disposable test temp directory that auto-cleans when disposed
 * Use with `using` statement for automatic cleanup in tests
 */
export class TestTempDir {
    constructor(prefix = "test-tool") {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.path = path.join(os.tmpdir(), `${prefix}-${id}`);
        fs.mkdirSync(this.path, { recursive: true });
    }
    [Symbol.dispose]() {
        if (fs.existsSync(this.path)) {
            try {
                fs.rmSync(this.path, { recursive: true, force: true });
            }
            catch (error) {
                log.warn(`Failed to cleanup test temp dir ${this.path}:`, error);
            }
        }
    }
}
// Singleton instances for test configuration (shared across all test tool configs)
let testConfig = null;
let testInitStateManager = null;
function getTestConfig() {
    testConfig ?? (testConfig = new Config());
    return testConfig;
}
function getTestInitStateManager() {
    testInitStateManager ?? (testInitStateManager = new InitStateManager(getTestConfig()));
    return testInitStateManager;
}
/**
 * Create basic tool configuration for testing.
 * Returns a config object with default values that can be overridden.
 * Uses tempDir for both cwd and sessionsDir to isolate tests.
 */
export function createTestToolConfig(tempDir, options) {
    return {
        cwd: tempDir,
        workspaceSessionDir: options?.sessionsDir ?? tempDir,
        runtime: new LocalRuntime(tempDir),
        runtimeTempDir: tempDir,
        workspaceId: options?.workspaceId ?? "test-workspace",
    };
}
/**
 * Get shared test config and initStateManager for inline tool configs in tests.
 * Use this when creating tool configs inline in tests.
 */
export function getTestDeps() {
    return {
        workspaceId: "test-workspace",
        initStateManager: getTestInitStateManager(),
    };
}
//# sourceMappingURL=testHelpers.js.map