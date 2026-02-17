import { createRuntime } from "./runtimeFactory";
/**
 * Create a runtime from workspace metadata, ensuring workspaceName is always passed.
 *
 * Use this helper when creating a runtime from workspace metadata to ensure
 * DevcontainerRuntime.currentWorkspacePath is set, enabling host-path reads
 * (stat, readFile, etc.) before the container is ready.
 */
export function createRuntimeForWorkspace(metadata) {
    return createRuntime(metadata.runtimeConfig, {
        projectPath: metadata.projectPath,
        workspaceName: metadata.name,
    });
}
//# sourceMappingURL=runtimeHelpers.js.map