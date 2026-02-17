/**
 * Stream context builder: assembles plan instructions and system prompt for a stream.
 *
 * Extracted from `streamMessage()` to make these purely functional
 * preparation steps explicit and testable. Contains:
 * - Plan file reading, mode instructions, task nesting warnings
 * - Plan→exec handoff transition content
 * - Agent body resolution with inheritance + subagent prompt append
 * - Subagent discovery for tool descriptions
 * - Skill discovery for tool descriptions
 * - System message construction and token counting
 *
 * All functions are pure — no service dependencies (`this.*`).
 */
import assert from "@/common/utils/assert";
import { isPlanLikeInResolvedChain } from "@/common/utils/agentTools";
import { getPlanFilePath } from "@/common/utils/planStorage";
import { getPlanFileHint, getPlanModeInstruction } from "@/common/utils/ui/modeUtils";
import { hasStartHerePlanSummary } from "@/common/utils/messages/startHerePlanSummary";
import { readPlanFile } from "@/node/utils/runtime/helpers";
import { readAgentDefinition, resolveAgentBody, resolveAgentFrontmatter, discoverAgentDefinitions, } from "@/node/services/agentDefinitions/agentDefinitionsService";
import { isAgentEffectivelyDisabled } from "@/node/services/agentDefinitions/agentEnablement";
import { resolveAgentInheritanceChain } from "@/node/services/agentDefinitions/resolveAgentInheritanceChain";
import { discoverAgentSkills } from "@/node/services/agentSkills/agentSkillsService";
import { buildSystemMessage } from "./systemMessage";
import { getTokenizerForModel } from "@/node/utils/main/tokenizer";
import { log } from "./log";
/**
 * Build plan-aware additional instructions and determine transition content.
 *
 * This handles:
 * 1. Reading the plan file (with legacy migration)
 * 2. Injecting plan-mode instructions when in plan mode
 * 3. Injecting plan-file hints in non-plan modes (unless Start Here already has it)
 * 4. Appending task-nesting-depth warnings
 * 5. Determining plan→exec handoff content by checking if the last assistant
 *    used a plan-like agent
 */
export async function buildPlanInstructions(opts) {
    const { runtime, metadata, workspaceId, effectiveMode, effectiveAgentId, agentIsPlanLike, agentDiscoveryPath, additionalSystemInstructions, shouldDisableTaskToolsForDepth, taskDepth, taskSettings, requestPayloadMessages, } = opts;
    const workspaceLog = log.withFields({ workspaceId, workspaceName: metadata.name });
    // Construct plan mode instruction if in plan mode
    // This is done backend-side because we have access to the plan file path
    let effectiveAdditionalInstructions = additionalSystemInstructions;
    const muxHome = runtime.getMuxHome();
    const planFilePath = getPlanFilePath(metadata.name, metadata.projectName, muxHome);
    // Read plan file (handles legacy migration transparently)
    const planResult = await readPlanFile(runtime, metadata.name, metadata.projectName, workspaceId);
    const chatHasStartHerePlanSummary = hasStartHerePlanSummary(requestPayloadMessages);
    if (effectiveMode === "plan") {
        const planModeInstruction = getPlanModeInstruction(planFilePath, planResult.exists);
        effectiveAdditionalInstructions = additionalSystemInstructions
            ? `${planModeInstruction}\n\n${additionalSystemInstructions}`
            : planModeInstruction;
    }
    else if (planResult.exists && planResult.content.trim()) {
        // Users often use "Replace all chat history" after plan mode. In exec (or other non-plan)
        // modes, the model can lose the plan file location because plan path injection only
        // happens in plan mode.
        //
        // Exception: the ProposePlanToolCall "Start Here" flow already stores the full plan
        // (and plan path) directly in chat history. In that case, prompting the model to
        // re-open the plan file is redundant and often results in an extra "read …KB" step.
        if (!chatHasStartHerePlanSummary) {
            const planFileHint = getPlanFileHint(planFilePath, planResult.exists);
            if (planFileHint) {
                effectiveAdditionalInstructions = effectiveAdditionalInstructions
                    ? `${planFileHint}\n\n${effectiveAdditionalInstructions}`
                    : planFileHint;
            }
        }
        else {
            workspaceLog.debug("Skipping plan file hint: Start Here already includes the plan in chat history.");
        }
    }
    if (shouldDisableTaskToolsForDepth) {
        const nestingInstruction = `Task delegation is disabled in this workspace (taskDepth=${taskDepth}, ` +
            `maxTaskNestingDepth=${taskSettings.maxTaskNestingDepth}). Do not call task/task_await/task_list/task_terminate.`;
        effectiveAdditionalInstructions = effectiveAdditionalInstructions
            ? `${effectiveAdditionalInstructions}\n\n${nestingInstruction}`
            : nestingInstruction;
    }
    // Read plan content for agent transition (plan-like → exec/orchestrator).
    // Only read if switching to the built-in exec/orchestrator agent and last assistant was plan-like.
    let planContentForTransition;
    const isPlanHandoffAgent = effectiveAgentId === "exec" || effectiveAgentId === "orchestrator";
    if (isPlanHandoffAgent && !chatHasStartHerePlanSummary) {
        const lastAssistantMessage = [...requestPayloadMessages]
            .reverse()
            .find((m) => m.role === "assistant");
        const lastAgentId = lastAssistantMessage?.metadata?.agentId;
        if (lastAgentId && planResult.content.trim()) {
            let lastAgentIsPlanLike = false;
            if (lastAgentId === effectiveAgentId) {
                lastAgentIsPlanLike = agentIsPlanLike;
            }
            else {
                try {
                    const lastDefinition = await readAgentDefinition(runtime, agentDiscoveryPath, lastAgentId);
                    const lastChain = await resolveAgentInheritanceChain({
                        runtime,
                        workspacePath: agentDiscoveryPath,
                        agentId: lastAgentId,
                        agentDefinition: lastDefinition,
                        workspaceId,
                    });
                    lastAgentIsPlanLike = isPlanLikeInResolvedChain(lastChain);
                }
                catch (error) {
                    workspaceLog.warn("Failed to resolve last agent definition for plan handoff", {
                        lastAgentId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            if (lastAgentIsPlanLike) {
                planContentForTransition = planResult.content;
            }
        }
    }
    else if (isPlanHandoffAgent && chatHasStartHerePlanSummary) {
        workspaceLog.debug("Skipping plan content injection for plan handoff transition: Start Here already includes the plan in chat history.");
    }
    return { effectiveAdditionalInstructions, planFilePath, planContentForTransition };
}
/**
 * Build the agent system prompt, system message, and discover available agents/skills.
 *
 * This handles:
 * 1. Resolving the agent body with inheritance (prompt.append merges with base)
 * 2. Appending subagent.append_prompt for subagent workspaces
 * 3. Discovering available subagent definitions for task tool context
 * 4. Discovering available skills for tool descriptions
 * 5. Constructing the final system message
 * 6. Counting system message tokens
 */
export async function buildStreamSystemContext(opts) {
    const { runtime, metadata, workspacePath, workspaceId, agentDefinition, agentDiscoveryPath, isSubagentWorkspace, effectiveAdditionalInstructions, modelString, cfg, mcpServers, } = opts;
    const workspaceLog = log.withFields({ workspaceId, workspaceName: metadata.name });
    // Resolve the body with inheritance (prompt.append merges with base).
    // Use agentDefinition.id (may have fallen back to exec) instead of effectiveAgentId.
    const resolvedBody = await resolveAgentBody(runtime, agentDiscoveryPath, agentDefinition.id);
    let subagentAppendPrompt;
    if (isSubagentWorkspace) {
        try {
            const resolvedFrontmatter = await resolveAgentFrontmatter(runtime, agentDiscoveryPath, agentDefinition.id);
            subagentAppendPrompt = resolvedFrontmatter.subagent?.append_prompt;
        }
        catch (error) {
            workspaceLog.debug("Failed to resolve agent frontmatter for subagent append_prompt", {
                agentId: agentDefinition.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const agentSystemPrompt = isSubagentWorkspace && subagentAppendPrompt
        ? `${resolvedBody}\n\n${subagentAppendPrompt}`
        : resolvedBody;
    // Discover available agent definitions for sub-agent context (only for top-level workspaces).
    //
    // NOTE: discoverAgentDefinitions returns disabled agents too, so Settings can surface them.
    // For tool descriptions (task tool), filter to agents that are effectively enabled.
    let agentDefinitions;
    if (!isSubagentWorkspace) {
        agentDefinitions = await discoverAvailableSubagentsForToolContext({
            runtime,
            workspacePath: agentDiscoveryPath,
            cfg,
        });
    }
    // Discover available skills for tool description context
    let availableSkills;
    try {
        availableSkills = await discoverAgentSkills(runtime, workspacePath);
    }
    catch (error) {
        workspaceLog.warn("Failed to discover agent skills for tool description", { error });
    }
    // Build system message from workspace metadata
    const systemMessage = await buildSystemMessage(metadata, runtime, workspacePath, effectiveAdditionalInstructions, modelString, mcpServers, { agentSystemPrompt });
    // Count system message tokens for cost tracking
    const tokenizer = await getTokenizerForModel(modelString);
    const systemMessageTokens = await tokenizer.countTokens(systemMessage);
    return {
        agentSystemPrompt,
        systemMessage,
        systemMessageTokens,
        agentDefinitions,
        availableSkills,
    };
}
// ---------------------------------------------------------------------------
// Subagent Discovery Helper
// ---------------------------------------------------------------------------
/**
 * Discover agent definitions for tool description context.
 *
 * The task tool lists "Available sub-agents" by filtering on
 * AgentDefinitionDescriptor.subagentRunnable.
 *
 * NOTE: discoverAgentDefinitions() sets descriptor.subagentRunnable from the agent's *own*
 * frontmatter only, which means derived agents (e.g. `base: exec`) may incorrectly appear
 * non-runnable if they don't repeat `subagent.runnable: true`.
 *
 * Re-resolve frontmatter with inheritance (base-first) so subagent.runnable is inherited.
 */
export async function discoverAvailableSubagentsForToolContext(args) {
    assert(args, "discoverAvailableSubagentsForToolContext: args is required");
    assert(args.runtime, "discoverAvailableSubagentsForToolContext: runtime is required");
    assert(args.workspacePath && args.workspacePath.length > 0, "discoverAvailableSubagentsForToolContext: workspacePath is required");
    assert(args.cfg, "discoverAvailableSubagentsForToolContext: cfg is required");
    const discovered = await discoverAgentDefinitions(args.runtime, args.workspacePath, {
        roots: args.roots,
    });
    const resolved = await Promise.all(discovered.map(async (descriptor) => {
        try {
            const resolvedFrontmatter = await resolveAgentFrontmatter(args.runtime, args.workspacePath, descriptor.id, { roots: args.roots });
            const effectivelyDisabled = isAgentEffectivelyDisabled({
                cfg: args.cfg,
                agentId: descriptor.id,
                resolvedFrontmatter,
            });
            if (effectivelyDisabled) {
                return null;
            }
            return {
                ...descriptor,
                // Important: descriptor.subagentRunnable comes from the agent's own frontmatter only.
                // Re-resolve with inheritance so derived agents inherit runnable: true from their base.
                subagentRunnable: resolvedFrontmatter.subagent?.runnable ?? false,
            };
        }
        catch {
            // Best-effort: keep the descriptor if enablement or inheritance can't be resolved.
            return descriptor;
        }
    }));
    return resolved.filter((descriptor) => Boolean(descriptor));
}
//# sourceMappingURL=streamContextBuilder.js.map