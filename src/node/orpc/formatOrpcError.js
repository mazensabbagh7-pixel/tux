import { ORPCError, ValidationError } from "@orpc/server";
import { inspect } from "node:util";
function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function isUnknownArray(value) {
    return Array.isArray(value);
}
function isPlainObject(value) {
    if (!isRecord(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function redactHeaders(headers) {
    if (!isRecord(headers)) {
        return undefined;
    }
    const result = {};
    for (const [key, value] of Object.entries(headers)) {
        const lower = key.toLowerCase();
        if (lower === "authorization" || lower === "cookie" || lower === "set-cookie") {
            result[key] = "<redacted>";
            continue;
        }
        result[key] = value;
    }
    return result;
}
function extractRequestContext(interceptorOptions) {
    if (!isRecord(interceptorOptions)) {
        return {};
    }
    const prefix = typeof interceptorOptions.prefix === "string" ? interceptorOptions.prefix : undefined;
    const request = isRecord(interceptorOptions.request) ? interceptorOptions.request : undefined;
    const method = request && typeof request.method === "string" ? request.method : undefined;
    const urlRaw = request ? request.url : undefined;
    const url = urlRaw instanceof URL ? urlRaw.toString() : typeof urlRaw === "string" ? urlRaw : undefined;
    const path = urlRaw instanceof URL ? `${urlRaw.pathname}${urlRaw.search}` : undefined;
    const headers = request ? redactHeaders(request.headers) : undefined;
    return {
        method,
        url,
        path,
        prefix,
        headers,
    };
}
function toJsonSafe(value, options) {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return null;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "function") {
        return `[Function${value.name ? ` ${value.name}` : ""}]`;
    }
    if (typeof value === "symbol") {
        return value.toString();
    }
    if (value instanceof URL) {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            cause: options.depth > 0
                ? toJsonSafe(value.cause, { ...options, depth: options.depth - 1 })
                : undefined,
        };
    }
    if (Array.isArray(value)) {
        if (options.depth <= 0) {
            return `Array(${value.length})`;
        }
        return value
            .slice(0, 100)
            .map((entry) => toJsonSafe(entry, { ...options, depth: options.depth - 1 }));
    }
    if (isPlainObject(value)) {
        if (options.seen.has(value)) {
            return "[Circular]";
        }
        if (options.depth <= 0) {
            return `Object(${Object.keys(value).length})`;
        }
        options.seen.add(value);
        const out = {};
        const entries = Object.entries(value);
        for (const [key, entry] of entries.slice(0, 200)) {
            out[key] = toJsonSafe(entry, { ...options, depth: options.depth - 1 });
        }
        if (entries.length > 200) {
            out.__truncated__ = `+${entries.length - 200} keys`;
        }
        return out;
    }
    return value;
}
function summarizeForLogs(value, depth = 1) {
    if (value === undefined) {
        return "undefined";
    }
    if (value === null) {
        return "null";
    }
    if (typeof value === "string") {
        const trimmed = value.length > 300 ? `${value.slice(0, 300)}…` : value;
        return JSON.stringify(trimmed);
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    if (value instanceof URL) {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return `Array(${value.length})`;
    }
    if (isPlainObject(value)) {
        const keys = Object.keys(value);
        if (depth <= 0) {
            return `Object(${keys.length})`;
        }
        const preview = keys.slice(0, 10).map((key) => {
            const entry = value[key];
            return `${key}: ${summarizeForLogs(entry, depth - 1)}`;
        });
        const suffix = keys.length > 10 ? ", …" : "";
        return `{ ${preview.join(", ")}${suffix} }`;
    }
    // Fallback for non-plain objects.
    return inspect(value, { depth: 3, maxArrayLength: 50, breakLength: 120 });
}
function isIssue(value) {
    return isRecord(value) && typeof value.message === "string";
}
function formatIssuePath(path) {
    if (!path || path.length === 0) {
        return "<root>";
    }
    const parts = [];
    for (const segment of path) {
        const key = typeof segment === "object" && segment !== null && "key" in segment
            ? segment.key
            : segment;
        if (typeof key === "number") {
            parts.push(`[${key}]`);
            continue;
        }
        if (typeof key === "string") {
            const isIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
            if (parts.length === 0) {
                parts.push(isIdentifier ? key : `[${JSON.stringify(key)}]`);
            }
            else {
                parts.push(isIdentifier ? `.${key}` : `[${JSON.stringify(key)}]`);
            }
            continue;
        }
        const rendered = typeof key === "symbol" ? key.toString() : String(key);
        parts.push(parts.length === 0 ? `[${rendered}]` : `[${rendered}]`);
    }
    return parts.join("");
}
function getValidationErrorInfo(cause) {
    if (cause instanceof ValidationError) {
        return {
            message: cause.message,
            issues: cause.issues,
            data: cause.data,
        };
    }
    if (!isRecord(cause) || !isUnknownArray(cause.issues)) {
        return null;
    }
    const issues = cause.issues.filter(isIssue);
    return {
        message: typeof cause.message === "string" ? cause.message : undefined,
        issues,
        data: "data" in cause ? cause.data : undefined,
    };
}
function formatUnknown(value) {
    if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`;
    }
    return inspect(value, { depth: 5, maxArrayLength: 50, breakLength: 120 });
}
export function formatOrpcError(error, interceptorOptions) {
    try {
        const requestContext = extractRequestContext(interceptorOptions);
        const where = requestContext.method && requestContext.path
            ? `${requestContext.method} ${requestContext.path}`
            : (requestContext.path ?? requestContext.url);
        const whereSuffix = where ? ` ${where}` : "";
        const debugDump = {
            request: requestContext,
        };
        if (error instanceof ORPCError) {
            const code = typeof error.code === "string" ? error.code : String(error.code);
            const status = typeof error.status === "number" ? error.status : undefined;
            debugDump.error = {
                type: "ORPCError",
                code,
                status,
                message: error.message,
                data: toJsonSafe(error.data, { depth: 6, seen: new WeakSet() }),
                stack: error.stack,
            };
            const validation = getValidationErrorInfo(error.cause);
            if (validation) {
                debugDump.cause = {
                    type: "ValidationError",
                    message: validation.message,
                    issues: toJsonSafe(validation.issues, { depth: 6, seen: new WeakSet() }),
                    data: toJsonSafe(validation.data, { depth: 6, seen: new WeakSet() }),
                };
                const lines = [];
                lines.push(`ORPC${whereSuffix}: ${code} ${error.message}${status !== undefined ? ` (status ${status})` : ""}`);
                if (validation.issues.length > 0) {
                    const maxIssues = 5;
                    lines.push(`Validation issues (${validation.issues.length}):`);
                    for (const issue of validation.issues.slice(0, maxIssues)) {
                        const path = formatIssuePath(issue.path);
                        lines.push(`  - ${path}: ${issue.message}`);
                    }
                    if (validation.issues.length > maxIssues) {
                        lines.push(`  (+${validation.issues.length - maxIssues} more)`);
                    }
                }
                lines.push(`Data: ${summarizeForLogs(validation.data, 1)}`);
                return {
                    message: lines.join("\n"),
                    debugDump,
                };
            }
            // Non-validation ORPC error.
            debugDump.cause = toJsonSafe(error.cause, { depth: 6, seen: new WeakSet() });
            return {
                message: `ORPC${whereSuffix}: ${code} ${error.message}${status !== undefined ? ` (status ${status})` : ""}`,
                debugDump,
            };
        }
        // Unknown error shape.
        debugDump.error = toJsonSafe(error, { depth: 6, seen: new WeakSet() });
        return {
            message: `ORPC${whereSuffix}: ${formatUnknown(error)}`,
            debugDump,
        };
    }
    catch (formatError) {
        // Best-effort: formatting should never crash the server.
        const fallback = `ORPC: Failed to format error: ${formatUnknown(formatError)}\nOriginal error: ${formatUnknown(error)}`;
        return {
            message: fallback,
            debugDump: {
                formatError: toJsonSafe(formatError, { depth: 4, seen: new WeakSet() }),
                originalError: toJsonSafe(error, { depth: 4, seen: new WeakSet() }),
            },
        };
    }
}
//# sourceMappingURL=formatOrpcError.js.map