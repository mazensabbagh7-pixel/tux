function normalizeError(error) {
    if (error instanceof Error) {
        return error;
    }
    if (typeof error === "string") {
        return new Error(error);
    }
    return new Error("Unknown error");
}
function getErrorCode(error) {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    if ("code" in error && typeof error.code === "string") {
        return error.code;
    }
    return undefined;
}
export function isIgnorableStreamError(error) {
    const code = getErrorCode(error);
    return code === "EPIPE" || code === "ECONNRESET";
}
export function attachStreamErrorHandler(emitter, label, options = {}) {
    const handler = (error) => {
        const normalized = normalizeError(error);
        const info = {
            label,
            code: getErrorCode(error),
            message: normalized.message,
        };
        if (isIgnorableStreamError(error)) {
            options.logger?.debug("Ignored stream error", info, normalized);
            options.onIgnorable?.(normalized, info);
            return;
        }
        options.logger?.warn("Stream error", info, normalized);
        options.onUnexpected?.(normalized, info);
    };
    emitter.on("error", handler);
    return () => {
        emitter.removeListener("error", handler);
    };
}
//# sourceMappingURL=streamErrors.js.map