export function isAbortError(error) {
    if (error instanceof Error) {
        return error.name === "AbortError";
    }
    const name = error?.name;
    return typeof name === "string" && name === "AbortError";
}
//# sourceMappingURL=isAbortError.js.map