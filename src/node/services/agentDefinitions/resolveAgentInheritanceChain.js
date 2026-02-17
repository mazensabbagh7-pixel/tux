import { log } from "@/node/services/log";
import { agentVisitKey, computeBaseSkipScope, MAX_INHERITANCE_DEPTH, readAgentDefinition, } from "./agentDefinitionsService";
/**
 * Resolve an agent's `base` inheritance chain (starting at the selected agent).
 *
 * IMPORTANT: Tool-policy computation requires the base chain to be present.
 * Building an "all agents" set in callers is error-prone because base agents
 * can be workspace-defined (project/global) rather than built-ins.
 *
 * When resolving a base with the same ID as the current agent (e.g., project-scope
 * `exec.md` with `base: exec`), we skip the current scope to find global/built-in.
 */
export async function resolveAgentInheritanceChain(options) {
    const { runtime, workspacePath, agentId, agentDefinition, workspaceId } = options;
    const maxDepth = options.maxDepth ?? MAX_INHERITANCE_DEPTH;
    const agentsForInheritance = [];
    const seenPackages = new Set();
    let currentAgentId = agentId;
    let currentDefinition = agentDefinition;
    for (let depth = 0; depth < maxDepth; depth++) {
        const visitKey = agentVisitKey(currentDefinition.id, currentDefinition.scope);
        if (seenPackages.has(visitKey)) {
            log.warn("Agent definition base chain has a cycle; stopping resolution", {
                workspaceId,
                agentId,
                currentAgentId,
                scope: currentDefinition.scope,
            });
            break;
        }
        seenPackages.add(visitKey);
        agentsForInheritance.push({
            id: currentAgentId,
            base: currentDefinition.frontmatter.base,
            tools: currentDefinition.frontmatter.tools,
            uiColor: currentDefinition.frontmatter.ui?.color,
        });
        const baseId = currentDefinition.frontmatter.base;
        if (!baseId) {
            break;
        }
        const skipScopesAbove = computeBaseSkipScope(baseId, currentAgentId, currentDefinition.scope);
        currentAgentId = baseId;
        try {
            currentDefinition = await readAgentDefinition(runtime, workspacePath, baseId, {
                skipScopesAbove,
            });
        }
        catch (error) {
            log.warn("Failed to load base agent definition; stopping inheritance resolution", {
                workspaceId,
                agentId,
                baseId,
                error: error instanceof Error ? error.message : String(error),
            });
            break;
        }
    }
    return agentsForInheritance;
}
//# sourceMappingURL=resolveAgentInheritanceChain.js.map