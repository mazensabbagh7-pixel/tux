import assert from "@/common/utils/assert";
export function extractAssistantText(parts) {
    if (!Array.isArray(parts)) {
        return "";
    }
    const textParts = parts.filter((part) => part.type === "text");
    return textParts
        .map((part) => {
        assert(typeof part.text === "string", "Text part must include text");
        return part.text;
    })
        .join("");
}
export function extractReasoning(parts) {
    if (!Array.isArray(parts)) {
        return [];
    }
    const reasoningParts = parts.filter((part) => part.type === "reasoning");
    return reasoningParts.map((part) => {
        assert(typeof part.text === "string", "Reasoning part must include text");
        return part.text;
    });
}
export function extractToolCalls(parts) {
    if (!Array.isArray(parts)) {
        return [];
    }
    return parts.filter((part) => part.type === "dynamic-tool");
}
//# sourceMappingURL=chatExtractors.js.map