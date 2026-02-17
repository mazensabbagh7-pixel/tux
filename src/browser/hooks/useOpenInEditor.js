import { useCallback } from "react";
import { useAPI } from "@/browser/contexts/API";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { openInEditor } from "@/browser/utils/openInEditor";
/**
 * Hook to open a path in the user's configured code editor.
 *
 * This is a thin wrapper around the shared renderer entry point in
 * `src/browser/utils/openInEditor.ts`.
 */
export function useOpenInEditor() {
    const { api } = useAPI();
    const { open: openSettings } = useSettings();
    return useCallback(async (workspaceId, targetPath, runtimeConfig, options) => {
        return openInEditor({
            api,
            openSettings,
            workspaceId,
            targetPath,
            runtimeConfig,
            isFile: options?.isFile,
        });
    }, [api, openSettings]);
}
//# sourceMappingURL=useOpenInEditor.js.map