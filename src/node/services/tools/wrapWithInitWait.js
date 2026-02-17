/**
 * Wraps a tool to wait for workspace initialization before execution.
 *
 * This wrapper handles the cross-cutting concern of init state waiting,
 * keeping individual tools simple and focused on their core functionality.
 *
 * Only runtime-dependent tools (bash, file_read, file_edit_*) need this wrapper.
 * Non-runtime tools (propose_plan, todo, web_search) execute immediately.
 *
 * @param tool The tool to wrap (returned from a tool factory)
 * @param workspaceId Workspace ID for init state tracking
 * @param initStateManager Init state manager for waiting
 * @returns Wrapped tool that waits for init before executing
 */
export function wrapWithInitWait(tool, workspaceId, initStateManager) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return {
        ...tool,
        execute: async (args, options) => {
            const abortSignal = options && typeof options === "object" && "abortSignal" in options
                ? options.abortSignal
                : undefined;
            // Wait for workspace initialization to complete (no-op if not needed)
            // This never throws - tools proceed regardless of init outcome
            // Forward abort signals so tool cancellation stays responsive during long provisioning waits.
            await initStateManager.waitForInit(workspaceId, abortSignal);
            // Execute the actual tool with all arguments
            if (!tool.execute) {
                throw new Error("Tool does not have an execute function");
            }
            return tool.execute(args, options);
        },
    };
}
//# sourceMappingURL=wrapWithInitWait.js.map