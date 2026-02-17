export const TOOL_OUTPUT_UI_ONLY_FIELD = "ui_only";
function unwrapJsonContainer(output) {
    if (output && typeof output === "object" && "type" in output && "value" in output) {
        const record = output;
        if (record.type === "json") {
            return { wrapped: true, value: record.value };
        }
    }
    return { wrapped: false, value: output };
}
function rewrapJsonContainer(wrapped, value) {
    if (!wrapped) {
        return value;
    }
    const container = {
        type: "json",
        value,
    };
    return container;
}
function stripUiOnlyDeep(value) {
    if (!value || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(stripUiOnlyDeep);
    }
    const record = value;
    const stripped = {};
    for (const [key, nested] of Object.entries(record)) {
        if (key === TOOL_OUTPUT_UI_ONLY_FIELD) {
            continue;
        }
        stripped[key] = stripUiOnlyDeep(nested);
    }
    return stripped;
}
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function isStringRecord(value) {
    if (!isRecord(value)) {
        return false;
    }
    return Object.values(value).every((entry) => typeof entry === "string");
}
function isAskUserQuestionUiOnly(value) {
    if (!isRecord(value)) {
        return false;
    }
    if (!Array.isArray(value.questions)) {
        return false;
    }
    return isStringRecord(value.answers);
}
function isFileEditUiOnly(value) {
    return isRecord(value) && typeof value.diff === "string";
}
function isNotifyUiOnly(value) {
    if (!isRecord(value)) {
        return false;
    }
    const notifiedVia = value.notifiedVia;
    if (notifiedVia !== "electron" && notifiedVia !== "browser") {
        return false;
    }
    if ("workspaceId" in value &&
        value.workspaceId !== undefined &&
        typeof value.workspaceId !== "string") {
        return false;
    }
    return true;
}
function isUiOnlyRecord(value) {
    if (!isRecord(value)) {
        return false;
    }
    const record = value;
    if ("ask_user_question" in record && !isAskUserQuestionUiOnly(record.ask_user_question)) {
        return false;
    }
    if ("file_edit" in record && !isFileEditUiOnly(record.file_edit)) {
        return false;
    }
    if ("notify" in record && !isNotifyUiOnly(record.notify)) {
        return false;
    }
    return true;
}
export function getToolOutputUiOnly(output) {
    const unwrapped = unwrapJsonContainer(output);
    const value = unwrapped.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    if (!(TOOL_OUTPUT_UI_ONLY_FIELD in value)) {
        return undefined;
    }
    const uiOnly = value[TOOL_OUTPUT_UI_ONLY_FIELD];
    return isUiOnlyRecord(uiOnly) ? uiOnly : undefined;
}
export function stripToolOutputUiOnly(output) {
    const unwrapped = unwrapJsonContainer(output);
    const stripped = stripUiOnlyDeep(unwrapped.value);
    return rewrapJsonContainer(unwrapped.wrapped, stripped);
}
//# sourceMappingURL=toolOutputUiOnly.js.map