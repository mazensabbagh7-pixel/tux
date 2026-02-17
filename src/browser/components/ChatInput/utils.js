import { parseCommand } from "@/browser/utils/slashCommands/parser";
import { buildAgentSkillMetadata } from "@/common/types/message";
/**
 * Extract error message from SendMessageError or string
 * Handles both string errors and structured error objects
 */
export function extractErrorMessage(error) {
    if (typeof error === "string") {
        return error;
    }
    return "raw" in error ? error.raw : error.type;
}
function isUnknownSlashCommand(value) {
    return value !== null && value.type === "unknown-command";
}
export function buildSkillInvocationMetadata(rawCommand, descriptor) {
    return buildAgentSkillMetadata({
        rawCommand,
        commandPrefix: `/${descriptor.name}`,
        skillName: descriptor.name,
        scope: descriptor.scope,
    });
}
/**
 * Format user message text for skill invocation.
 * Makes it explicit to the model that a skill was invoked.
 */
function formatSkillInvocationText(skillName, userMessage) {
    return userMessage ? `Using skill ${skillName}: ${userMessage}` : `Use skill ${skillName}`;
}
async function resolveSkillInvocation(options) {
    if (!isUnknownSlashCommand(options.parsed)) {
        return null;
    }
    const command = options.parsed.command;
    const prefix = `/${command}`;
    const afterPrefix = options.messageText.slice(prefix.length);
    const hasSeparator = afterPrefix.length === 0 || /^\s/.test(afterPrefix);
    if (!hasSeparator) {
        return null;
    }
    let skill = options.agentSkillDescriptors.find((candidate) => candidate.name === command);
    if (!skill && options.api && options.discovery) {
        try {
            const pkg = options.discovery.kind === "project"
                ? await options.api.agentSkills.get({
                    projectPath: options.discovery.projectPath,
                    skillName: command,
                })
                : await options.api.agentSkills.get({
                    workspaceId: options.discovery.workspaceId,
                    disableWorkspaceAgents: options.discovery.disableWorkspaceAgents,
                    skillName: command,
                });
            skill = {
                name: pkg.frontmatter.name,
                description: pkg.frontmatter.description,
                scope: pkg.scope,
            };
        }
        catch {
            // Not a skill (or not available yet) - fall through.
        }
    }
    if (!skill) {
        return null;
    }
    return {
        descriptor: skill,
        userText: formatSkillInvocationText(skill.name, afterPrefix.trimStart()),
    };
}
export async function parseCommandWithSkillInvocation(options) {
    const parsed = parseCommand(options.messageText);
    const skillInvocation = await resolveSkillInvocation({
        messageText: options.messageText,
        parsed,
        agentSkillDescriptors: options.agentSkillDescriptors,
        api: options.api,
        discovery: options.discovery,
    });
    return { parsed: skillInvocation ? null : parsed, skillInvocation };
}
// -----------------------------------------------------------------------------
// Runtime Validation
// -----------------------------------------------------------------------------
export function validateCreationRuntime(runtime, coderPresetCount) {
    if (runtime.mode === "docker") {
        return runtime.image.trim() ? null : { mode: "docker", kind: "missingImage" };
    }
    if (runtime.mode === "ssh") {
        if (runtime.coder) {
            if (runtime.coder.existingWorkspace) {
                // Existing mode: workspace name is required
                if (!(runtime.coder.workspaceName ?? "").trim()) {
                    return { mode: "ssh", kind: "missingCoderWorkspace" };
                }
            }
            else {
                // New mode: template is required
                if (!(runtime.coder.template ?? "").trim()) {
                    return { mode: "ssh", kind: "missingCoderTemplate" };
                }
                // Preset required when 2+ presets exist
                const requiresPreset = coderPresetCount >= 2;
                if (requiresPreset && !(runtime.coder.preset ?? "").trim()) {
                    return { mode: "ssh", kind: "missingCoderPreset" };
                }
            }
            return null;
        }
        return runtime.host.trim() ? null : { mode: "ssh", kind: "missingHost" };
    }
    return null;
}
// -----------------------------------------------------------------------------
// Attachment Conversion Helpers
// -----------------------------------------------------------------------------
export function filePartsToChatAttachments(fileParts, idPrefix) {
    return fileParts.map((part, index) => ({
        id: `${idPrefix}-${index}`,
        url: part.url,
        mediaType: part.mediaType,
        filename: part.filename,
    }));
}
// -----------------------------------------------------------------------------
// Review Helpers
// -----------------------------------------------------------------------------
/**
 * Extract review data from attached reviews for sending.
 * Returns undefined if no reviews attached.
 */
export function getReviewData(reviews) {
    return reviews.length > 0 ? reviews.map((r) => r.data) : undefined;
}
/**
 * Extract review IDs from attached reviews.
 */
export function getReviewIds(reviews) {
    return reviews.map((r) => r.id);
}
//# sourceMappingURL=utils.js.map