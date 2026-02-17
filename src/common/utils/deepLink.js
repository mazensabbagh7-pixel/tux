function getNonEmptySearchParam(url, key) {
    const value = url.searchParams.get(key);
    if (!value)
        return undefined;
    return value;
}
/**
 * Parse a mux:// deep link into a typed payload.
 *
 * Currently supported route:
 * - mux://chat/new
 */
export function parseMuxDeepLink(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        return null;
    }
    if (url.protocol !== "mux:") {
        return null;
    }
    // Be forgiving: some callers may include a trailing slash.
    const normalizedPathname = url.pathname.replace(/\/+$/, "");
    if (url.hostname !== "chat" || normalizedPathname !== "/new") {
        return null;
    }
    const project = getNonEmptySearchParam(url, "project");
    const projectPath = getNonEmptySearchParam(url, "projectPath");
    const projectId = getNonEmptySearchParam(url, "projectId");
    const prompt = getNonEmptySearchParam(url, "prompt");
    const sectionId = getNonEmptySearchParam(url, "sectionId");
    return {
        type: "new_chat",
        ...(project ? { project } : {}),
        ...(projectPath ? { projectPath } : {}),
        ...(projectId ? { projectId } : {}),
        ...(prompt ? { prompt } : {}),
        ...(sectionId ? { sectionId } : {}),
    };
}
function getLastPathSegment(projectPath) {
    const normalized = projectPath.trim().replace(/[\\/]+$/, "");
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? normalized;
}
/**
 * Resolve a configured project path from a human-friendly deep-link `project` query.
 *
 * Matching rules:
 * - Compare against the final path segment (e.g. /Users/me/repos/mux -> "mux")
 * - Prefer exact matches (case-insensitive)
 * - Otherwise, prefer substring matches (case-insensitive), picking the shortest
 *   name as the "closest" match.
 */
export function resolveProjectPathFromProjectQuery(projectPaths, projectQuery) {
    const query = getLastPathSegment(projectQuery).trim().toLowerCase();
    if (query.length === 0)
        return null;
    for (const projectPath of projectPaths) {
        const candidate = getLastPathSegment(projectPath).toLowerCase();
        if (candidate === query) {
            return projectPath;
        }
    }
    let bestProjectPath = null;
    let bestCandidateLength = Number.POSITIVE_INFINITY;
    for (const projectPath of projectPaths) {
        const candidate = getLastPathSegment(projectPath).toLowerCase();
        if (!candidate.includes(query))
            continue;
        if (bestProjectPath === null ||
            candidate.length < bestCandidateLength ||
            (candidate.length === bestCandidateLength && projectPath < bestProjectPath)) {
            bestProjectPath = projectPath;
            bestCandidateLength = candidate.length;
        }
    }
    return bestProjectPath;
}
//# sourceMappingURL=deepLink.js.map