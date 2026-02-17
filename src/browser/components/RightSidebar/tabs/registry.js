/**
 * Tab Registry - Centralized configuration for RightSidebar tabs.
 *
 * Each tab type defines:
 * - name: Display name for the tab
 * - contentClassName: CSS classes for the tab panel container
 * - keepAlive: Whether the tab should remain mounted while hidden
 * - featureFlag: Optional feature flag key required to show the tab
 *
 * This keeps per-tab decisions out of RightSidebar.tsx and avoids switch statements.
 */
/** Static tab configurations (non-terminal tabs) */
export const TAB_CONFIGS = {
    costs: {
        name: "Costs",
        contentClassName: "overflow-y-auto p-[15px]",
    },
    review: {
        name: "Review",
        contentClassName: "overflow-y-auto p-0",
    },
    explorer: {
        name: "Explorer",
        contentClassName: "overflow-y-auto p-0",
    },
    stats: {
        name: "Stats",
        contentClassName: "overflow-y-auto p-[15px]",
        featureFlag: "statsTab",
    },
    output: {
        name: "Output",
        contentClassName: "overflow-hidden p-0",
    },
};
/** Terminal tab configuration */
export const TERMINAL_TAB_CONFIG = {
    name: "Terminal",
    contentClassName: "overflow-hidden p-0",
    keepAlive: true,
};
/** File viewer tab configuration */
export const FILE_TAB_CONFIG = {
    name: "File",
    contentClassName: "overflow-auto p-0",
    keepAlive: false, // No need to keep rendered when hidden
};
/** Get config for a tab type */
export function getTabConfig(tab) {
    if (tab === "costs" ||
        tab === "review" ||
        tab === "explorer" ||
        tab === "stats" ||
        tab === "output") {
        return TAB_CONFIGS[tab];
    }
    // File tabs
    if (tab.startsWith("file:")) {
        return FILE_TAB_CONFIG;
    }
    // All terminal tabs (including "terminal" placeholder)
    return TERMINAL_TAB_CONFIG;
}
/** Get display name for a tab type */
export function getTabName(tab) {
    return getTabConfig(tab).name;
}
/** Get content container class name for a tab type */
export function getTabContentClassName(tab) {
    return getTabConfig(tab).contentClassName;
}
/** Format duration for tab display (compact format) */
export function formatTabDuration(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    if (ms < 60000)
        return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
}
//# sourceMappingURL=registry.js.map