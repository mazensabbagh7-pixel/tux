import { parseAgentDefinitionMarkdown } from "./parseAgentDefinitionMarkdown";
import { BUILTIN_AGENT_CONTENT } from "./builtInAgentContent.generated";
const BUILT_IN_SOURCES = [
    { id: "exec", content: BUILTIN_AGENT_CONTENT.exec },
    { id: "plan", content: BUILTIN_AGENT_CONTENT.plan },
    { id: "ask", content: BUILTIN_AGENT_CONTENT.ask },
    { id: "compact", content: BUILTIN_AGENT_CONTENT.compact },
    { id: "explore", content: BUILTIN_AGENT_CONTENT.explore },
    { id: "system1_bash", content: BUILTIN_AGENT_CONTENT.system1_bash },
    { id: "mux", content: BUILTIN_AGENT_CONTENT.mux },
    { id: "orchestrator", content: BUILTIN_AGENT_CONTENT.orchestrator },
];
let cachedPackages = null;
function parseBuiltIns() {
    return BUILT_IN_SOURCES.map(({ id, content }) => {
        const parsed = parseAgentDefinitionMarkdown({
            content,
            byteSize: Buffer.byteLength(content, "utf8"),
        });
        return {
            id,
            scope: "built-in",
            frontmatter: parsed.frontmatter,
            body: parsed.body.trim(),
        };
    });
}
export function getBuiltInAgentDefinitions() {
    cachedPackages ?? (cachedPackages = parseBuiltIns());
    return cachedPackages;
}
/** Exposed for testing - clears cached parsed packages */
export function clearBuiltInAgentCache() {
    cachedPackages = null;
}
//# sourceMappingURL=builtInAgentDefinitions.js.map