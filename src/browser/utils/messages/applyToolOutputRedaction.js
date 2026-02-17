import { stripToolOutputUiOnly } from "@/common/utils/tools/toolOutputUiOnly";
export function applyToolOutputRedaction(messages) {
    return messages.map((msg) => {
        if (msg.role !== "assistant")
            return msg;
        const newParts = msg.parts.map((part) => {
            if (part.type !== "dynamic-tool")
                return part;
            if (part.state !== "output-available")
                return part;
            return {
                ...part,
                output: stripToolOutputUiOnly(part.output),
            };
        });
        return {
            ...msg,
            parts: newParts,
        };
    });
}
//# sourceMappingURL=applyToolOutputRedaction.js.map