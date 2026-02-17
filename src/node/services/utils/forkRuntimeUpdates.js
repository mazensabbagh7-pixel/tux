export function resolveForkRuntimeConfigs(sourceRuntimeConfig, forkResult) {
    return {
        forkedRuntimeConfig: forkResult.forkedRuntimeConfig ?? sourceRuntimeConfig,
        sourceRuntimeConfigUpdate: forkResult.sourceRuntimeConfig,
    };
}
/**
 * Apply runtime config updates returned by runtime.forkWorkspace().
 *
 * Runtimes may return updated runtimeConfig for:
 * - the new workspace (forkedRuntimeConfig)
 * - the source workspace (sourceRuntimeConfig)
 *
 * This helper centralizes the logic so WorkspaceService and TaskService stay consistent.
 */
export async function applyForkRuntimeUpdates(config, sourceWorkspaceId, sourceRuntimeConfig, forkResult) {
    const resolved = resolveForkRuntimeConfigs(sourceRuntimeConfig, forkResult);
    if (resolved.sourceRuntimeConfigUpdate) {
        await config.updateWorkspaceMetadata(sourceWorkspaceId, {
            runtimeConfig: resolved.sourceRuntimeConfigUpdate,
        });
    }
    return { forkedRuntimeConfig: resolved.forkedRuntimeConfig };
}
//# sourceMappingURL=forkRuntimeUpdates.js.map