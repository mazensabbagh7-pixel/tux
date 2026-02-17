function isSecretReferenceValue(value) {
    return (typeof value === "object" &&
        value !== null &&
        "secret" in value &&
        typeof value.secret === "string");
}
/**
 * Convert an array of secrets to a Record for environment variable injection.
 *
 * Secret values can either be literal strings, or aliases to other secret keys
 * (`{ secret: "OTHER_KEY" }`).
 *
 * Reference resolution is defensive:
 * - Missing references are omitted
 * - Cycles are omitted
 */
export function secretsToRecord(secrets) {
    // Merge-by-key (last writer wins) so lookups during resolution are deterministic.
    const rawByKey = new Map();
    for (const secret of secrets) {
        // Defensive: avoid crashing if callers pass malformed persisted data.
        if (!secret || typeof secret.key !== "string") {
            continue;
        }
        rawByKey.set(secret.key, secret.value);
    }
    const resolved = new Map();
    const resolving = new Set();
    const resolveKey = (key) => {
        if (resolved.has(key)) {
            return resolved.get(key);
        }
        if (resolving.has(key)) {
            // Cycle detected.
            resolved.set(key, undefined);
            return undefined;
        }
        resolving.add(key);
        try {
            const raw = rawByKey.get(key);
            if (typeof raw === "string") {
                resolved.set(key, raw);
                return raw;
            }
            if (isSecretReferenceValue(raw)) {
                const target = raw.secret.trim();
                if (!target) {
                    resolved.set(key, undefined);
                    return undefined;
                }
                const value = resolveKey(target);
                resolved.set(key, value);
                return value;
            }
            resolved.set(key, undefined);
            return undefined;
        }
        finally {
            resolving.delete(key);
        }
    };
    const record = {};
    for (const key of rawByKey.keys()) {
        const value = resolveKey(key);
        if (value !== undefined) {
            record[key] = value;
        }
    }
    return record;
}
//# sourceMappingURL=secrets.js.map