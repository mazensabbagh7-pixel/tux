import fsPromises from "fs/promises";
import path from "path";
import { createMuxMessage } from "../../../src/common/types/message";
import { HistoryService } from "../../../src/node/services/historyService";
const BASE_TIMESTAMP_MS = 1700000000000;
const HISTORY_PROFILE_NAMES = [
    "small",
    "medium",
    "large",
    "tool-heavy",
    "reasoning-heavy",
];
const HISTORY_PROFILES = {
    small: {
        messagePairs: 12,
        userChars: 200,
        assistantChars: 2000,
        reasoningChars: 0,
        toolOutputChars: 0,
    },
    medium: {
        messagePairs: 40,
        userChars: 260,
        assistantChars: 4500,
        reasoningChars: 0,
        toolOutputChars: 0,
    },
    large: {
        messagePairs: 90,
        userChars: 320,
        assistantChars: 9500,
        reasoningChars: 0,
        toolOutputChars: 0,
    },
    "tool-heavy": {
        messagePairs: 36,
        userChars: 220,
        assistantChars: 2800,
        reasoningChars: 0,
        toolOutputChars: 5200,
    },
    "reasoning-heavy": {
        messagePairs: 34,
        userChars: 220,
        assistantChars: 2600,
        reasoningChars: 4400,
        toolOutputChars: 0,
    },
};
function buildDeterministicText(label, targetLength) {
    const sentence = `${label}: deterministic payload for workspace replay performance profiling. `;
    if (sentence.length >= targetLength) {
        return sentence.slice(0, targetLength);
    }
    let content = "";
    while (content.length < targetLength) {
        content += sentence;
    }
    return content.slice(0, targetLength);
}
function createAssistantParts(args) {
    const parts = [];
    if (args.toolOutputChars > 0) {
        const toolName = args.index % 2 === 0 ? "file_read" : "bash";
        const outputKey = toolName === "file_read" ? "content" : "output";
        const toolPayload = buildDeterministicText(`${args.profile}-tool-${args.index}`, args.toolOutputChars);
        parts.push({
            type: "dynamic-tool",
            state: "output-available",
            toolCallId: `${args.profile}-tool-call-${args.index}`,
            toolName,
            input: toolName === "file_read"
                ? { path: `src/example-${args.index}.ts` }
                : { script: `echo profile-${args.index}` },
            output: {
                success: true,
                [outputKey]: toolPayload,
            },
            timestamp: BASE_TIMESTAMP_MS + args.index,
        });
    }
    if (args.reasoningChars > 0) {
        parts.push({
            type: "reasoning",
            text: buildDeterministicText(`${args.profile}-reasoning-${args.index}`, args.reasoningChars),
            timestamp: BASE_TIMESTAMP_MS + args.index,
        });
    }
    return parts;
}
async function appendOrThrow(args) {
    const appendResult = await args.historyService.appendToHistory(args.workspaceId, args.message);
    if (appendResult.success) {
        return;
    }
    throw new Error(`Failed to append ${args.role} message for profile ${args.profile}: ${appendResult.error}`);
}
export async function seedWorkspaceHistoryProfile(args) {
    const { demoProject, profile } = args;
    const profileConfig = HISTORY_PROFILES[profile];
    const historyService = new HistoryService({
        getSessionDir: (workspaceId) => path.join(demoProject.sessionsDir, workspaceId),
    });
    await fsPromises.writeFile(demoProject.historyPath, "", "utf-8");
    for (let pairIndex = 0; pairIndex < profileConfig.messagePairs; pairIndex++) {
        const userText = buildDeterministicText(`${profile}-user-${pairIndex}`, profileConfig.userChars);
        const userMessage = createMuxMessage(`${profile}-user-msg-${pairIndex}`, "user", userText, {
            timestamp: BASE_TIMESTAMP_MS + pairIndex * 2,
        });
        await appendOrThrow({
            historyService,
            workspaceId: demoProject.workspaceId,
            message: userMessage,
            profile,
            role: "user",
        });
        const assistantText = buildDeterministicText(`${profile}-assistant-${pairIndex}`, profileConfig.assistantChars);
        const assistantParts = createAssistantParts({
            profile,
            index: pairIndex,
            toolOutputChars: profileConfig.toolOutputChars,
            reasoningChars: profileConfig.reasoningChars,
        });
        const assistantMessage = createMuxMessage(`${profile}-assistant-msg-${pairIndex}`, "assistant", assistantText, {
            model: "anthropic:claude-sonnet-4-5",
            timestamp: BASE_TIMESTAMP_MS + pairIndex * 2 + 1,
        }, assistantParts);
        await appendOrThrow({
            historyService,
            workspaceId: demoProject.workspaceId,
            message: assistantMessage,
            profile,
            role: "assistant",
        });
    }
    return {
        profile,
        messageCount: profileConfig.messagePairs * 2,
        assistantMessageCount: profileConfig.messagePairs,
        estimatedCharacterCount: profileConfig.messagePairs *
            (profileConfig.userChars +
                profileConfig.assistantChars +
                profileConfig.toolOutputChars +
                profileConfig.reasoningChars),
        hasToolParts: profileConfig.toolOutputChars > 0,
        hasReasoningParts: profileConfig.reasoningChars > 0,
    };
}
export function parseHistoryProfilesFromEnv(rawProfiles) {
    if (!rawProfiles) {
        return [...HISTORY_PROFILE_NAMES];
    }
    const requestedProfiles = rawProfiles
        .split(",")
        .map((profile) => profile.trim())
        .filter((profile) => profile.length > 0);
    const invalidProfile = requestedProfiles.find((profile) => !HISTORY_PROFILE_NAMES.includes(profile));
    if (invalidProfile) {
        throw new Error(`Invalid MUX_E2E_PERF_PROFILES entry "${invalidProfile}". Expected one of: ${HISTORY_PROFILE_NAMES.join(", ")}.`);
    }
    return requestedProfiles;
}
//# sourceMappingURL=historyFixture.js.map