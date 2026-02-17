/**
 * Creates an oRPC router proxy that delegates procedure calls to a running server via HTTP.
 *
 * This allows using trpc-cli with an oRPC router without needing to initialize
 * services locally - calls are forwarded to a running mux server.
 *
 * The returned router maintains the same structure and schemas as the original,
 * so trpc-cli can extract procedure metadata for CLI generation.
 */
import { RPCLink as HTTPRPCLink } from "@orpc/client/fetch";
import { createORPCClient } from "@orpc/client";
import { isProcedure } from "@orpc/server";
import { z } from "zod";
// Pre-create an empty object schema for void inputs
const emptyObjectSchema = z.object({});
/**
 * Check if a value looks like a Zod 4 schema (duck-typing).
 */
function isZod4Like(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const v = value;
    return ((v.def !== undefined && typeof v.def === "object") ||
        (v._def !== undefined && typeof v._def === "object"));
}
/**
 * Check if a schema is z.void() or z.undefined().
 * These schemas accept `undefined` but not `{}`.
 */
function isVoidOrUndefinedSchema(schema) {
    if (!isZod4Like(schema))
        return false;
    const def = getDef(schema);
    return def?.type === "void" || def?.type === "undefined";
}
/**
 * Check if a value is an empty object `{}`.
 */
function isEmptyObject(value) {
    return (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0);
}
/**
 * Get the def from a Zod 4 schema (handles both .def and ._def).
 */
function getDef(schema) {
    return schema.def ?? schema._def;
}
/**
 * Unwrap optional/nullable/default wrappers to get the inner schema type.
 */
function unwrapSchema(schema) {
    let current = schema;
    let currentDef = getDef(current);
    while (currentDef &&
        (currentDef.type === "optional" ||
            currentDef.type === "nullable" ||
            currentDef.type === "default") &&
        currentDef.innerType) {
        current = currentDef.innerType;
        currentDef = getDef(current);
    }
    return current;
}
/**
 * Check if a field schema is optional (wrapped in optional/default).
 */
function isOptionalField(schema) {
    const def = getDef(schema);
    return def?.type === "optional" || def?.type === "default";
}
/**
 * Detect a common discriminator field in a plain union (not z.discriminatedUnion).
 * Looks for a field that has a literal value in all object variants.
 * Common patterns: "type", "kind", "tag"
 */
function detectCommonDiscriminator(options) {
    const commonFields = ["type", "kind", "tag", "variant"];
    for (const fieldName of commonFields) {
        let allHaveLiteral = true;
        for (const option of options) {
            if (!isZod4Like(option)) {
                allHaveLiteral = false;
                break;
            }
            const optDef = getDef(option);
            if (optDef?.type !== "object" || !optDef.shape) {
                allHaveLiteral = false;
                break;
            }
            const field = optDef.shape[fieldName];
            if (!field || !isZod4Like(field)) {
                allHaveLiteral = false;
                break;
            }
            const fieldDef = getDef(field);
            if (fieldDef?.type !== "literal") {
                allHaveLiteral = false;
                break;
            }
        }
        if (allHaveLiteral) {
            return fieldName;
        }
    }
    return undefined;
}
/**
 * Describe a Zod 4 type for CLI help.
 * Returns either a simple type string or a multiline hierarchical description.
 * @param schema - The Zod schema to describe
 * @param indent - Current indentation level for nested structures
 */
function describeZodType(schema, indent = 0) {
    if (!isZod4Like(schema))
        return "unknown";
    // Unwrap to get the actual type
    const unwrapped = unwrapSchema(schema);
    const def = getDef(unwrapped);
    if (!def)
        return "unknown";
    const type = def.type;
    switch (type) {
        case "string":
            return "string";
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "literal":
            // Zod 4 uses values array, Zod 3 uses value
            if (def.values && def.values.length > 0) {
                return JSON.stringify(def.values[0]);
            }
            if (def.value !== undefined) {
                return JSON.stringify(def.value);
            }
            return "literal";
        case "enum":
            if (def.entries) {
                return Object.values(def.entries)
                    .map((v) => JSON.stringify(v))
                    .join("|");
            }
            return "enum";
        case "array":
            if (def.element && isZod4Like(def.element)) {
                const elemUnwrapped = unwrapSchema(def.element);
                const elemDef = getDef(elemUnwrapped);
                // For arrays of objects, show "Array of:" with nested structure
                if (elemDef?.type === "object" && typeof elemDef.shape === "object") {
                    const childFields = describeObjectFieldsHierarchical(elemUnwrapped, indent + 1);
                    return `Array of:\n${childFields}`;
                }
                // For arrays of unions (discriminated or regular), describe the element
                if (elemDef?.type === "union") {
                    const elemDesc = describeZodType(elemUnwrapped, indent);
                    if (elemDesc.startsWith("One of:")) {
                        return `Array of ${elemDesc}`;
                    }
                }
                // For arrays of primitives, show inline
                return `${describeZodType(def.element, indent)}[]`;
            }
            return "array";
        case "optional":
        case "nullable":
        case "default":
            // Should be unwrapped already, but handle just in case
            if (def.innerType) {
                return describeZodType(def.innerType, indent);
            }
            return "unknown";
        case "union":
            if (def.options && Array.isArray(def.options)) {
                const variants = def.options
                    .map((o) => describeZodType(o, indent))
                    .filter((v) => v !== undefined && v !== null);
                if (variants.length === 0)
                    return "union";
                // Check if all variants are primitives/enums (no newlines)
                const allPrimitive = variants.every((v) => !v.includes("\n"));
                if (allPrimitive) {
                    return variants.join("|");
                }
                // For discriminated unions or plain unions with a common "type" field,
                // extract the discriminator value from each variant for labeling
                const indentStr = "    ".repeat(indent + 1);
                const discriminator = def.discriminator ?? detectCommonDiscriminator(def.options);
                const formattedVariants = def.options
                    .map((option, i) => {
                    const variantDesc = variants[i];
                    if (!variantDesc)
                        return "";
                    // Try to extract discriminator value for labeling
                    let label = `Variant ${i + 1}`;
                    if (discriminator && isZod4Like(option)) {
                        const optDef = getDef(option);
                        if (optDef?.type === "object" && optDef.shape) {
                            const discField = optDef.shape[discriminator];
                            if (discField && isZod4Like(discField)) {
                                const discDef = getDef(discField);
                                if (discDef?.type === "literal") {
                                    const val = discDef.values?.[0] ?? discDef.value;
                                    if (val !== undefined)
                                        label = `${discriminator}=${JSON.stringify(val)}`;
                                }
                            }
                        }
                    }
                    if (variantDesc.startsWith("\n")) {
                        return `${indentStr}${label}:${variantDesc}`;
                    }
                    return `${indentStr}${label}: ${variantDesc}`;
                })
                    .filter(Boolean);
                return `One of:\n${formattedVariants.join("\n")}`;
            }
            return "union";
        case "object":
            // For objects, return hierarchical description
            if (typeof def.shape === "object") {
                const childFields = describeObjectFieldsHierarchical(unwrapped, indent + 1);
                return `\n${childFields}`;
            }
            return "object";
        case "any":
            return "any";
        case "unknown":
            return "unknown";
        case "record":
            return "object";
        default:
            return type ?? "unknown";
    }
}
/**
 * Describe object fields in hierarchical YAML-like format.
 * Each field is on its own line with proper indentation.
 */
function describeObjectFieldsHierarchical(schema, indent) {
    const def = getDef(schema);
    if (!def || typeof def.shape !== "object")
        return `${"    ".repeat(indent)}- object`;
    const shape = def.shape;
    const lines = [];
    const indentStr = "    ".repeat(indent);
    for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!isZod4Like(fieldSchema))
            continue;
        const isOpt = isOptionalField(fieldSchema);
        const optMark = isOpt ? "?" : "";
        const fieldType = describeZodType(fieldSchema, indent);
        // Guard against undefined/null fieldType
        if (!fieldType) {
            lines.push(`${indentStr}- ${key}${optMark}: unknown`);
            continue;
        }
        // If the type starts with newline, it's a nested object - append directly
        if (fieldType.startsWith("\n")) {
            lines.push(`${indentStr}- ${key}${optMark}:${fieldType}`);
        }
        else if (fieldType.startsWith("Array of:\n")) {
            // Array of objects - split and handle
            lines.push(`${indentStr}- ${key}${optMark}: ${fieldType}`);
        }
        else {
            lines.push(`${indentStr}- ${key}${optMark}: ${fieldType}`);
        }
    }
    return lines.join("\n");
}
/**
 * Describe a ZodObject's fields for the top-level CLI description.
 * Separates required and optional fields with headers.
 */
function describeZodObjectFields(schema) {
    const def = getDef(schema);
    if (!def || typeof def.shape !== "object")
        return "object";
    const shape = def.shape;
    const requiredLines = [];
    const optionalLines = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!isZod4Like(fieldSchema))
            continue;
        const isOpt = isOptionalField(fieldSchema);
        const optMark = isOpt ? "?" : "";
        const fieldType = describeZodType(fieldSchema, 1);
        // Format the field entry
        let entry;
        if (fieldType.startsWith("\n")) {
            // Nested object - the type already includes the newline and indented children
            entry = `- ${key}${optMark}:${fieldType}`;
        }
        else if (fieldType.startsWith("Array of:\n") || fieldType.startsWith("Array of One of:\n")) {
            // Array of objects or discriminated unions
            entry = `- ${key}${optMark}: ${fieldType}`;
        }
        else {
            entry = `- ${key}${optMark}: ${fieldType}`;
        }
        if (isOpt) {
            optionalLines.push(entry);
        }
        else {
            requiredLines.push(entry);
        }
    }
    const parts = [];
    if (requiredLines.length > 0) {
        parts.push(`Required:\n${requiredLines.join("\n")}`);
    }
    if (optionalLines.length > 0) {
        parts.push(`Optional:\n${optionalLines.join("\n")}`);
    }
    const content = parts.join("\n") || "object";
    // Add base indent to all lines and prepend newline for CLI formatting
    // This ensures the description appears indented under the --option flag
    const baseIndent = "      "; // 6 spaces
    const indentedContent = content
        .split("\n")
        .map((line) => baseIndent + line)
        .join("\n");
    return "\n" + indentedContent;
}
/**
 * Enhance a Zod 4 schema by injecting rich descriptions for complex fields.
 * This makes CLI help show field details instead of raw JSON Schema.
 *
 * For object-typed fields without descriptions, we inject a description
 * showing all available fields with their types.
 *
 * For union and array fields, we generate hierarchical descriptions.
 *
 * Special handling for void/undefined schemas which don't convert well to JSON Schema.
 */
function enhanceInputSchema(schema) {
    if (!isZod4Like(schema))
        return schema;
    const def = getDef(schema);
    // Handle void/undefined schemas - trpc-cli doesn't handle these well.
    // Convert them to an empty object schema which converts properly to JSON Schema.
    if (def?.type === "void" || def?.type === "undefined") {
        return emptyObjectSchema;
    }
    if (def?.type !== "object" || typeof def.shape !== "object") {
        return schema;
    }
    const shape = def.shape;
    let hasEnhancements = false;
    const enhancedShape = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!isZod4Like(fieldSchema)) {
            enhancedShape[key] = fieldSchema;
            continue;
        }
        // Skip if already has a description
        if (fieldSchema.description || typeof fieldSchema.describe !== "function") {
            enhancedShape[key] = fieldSchema;
            continue;
        }
        // Unwrap optional/default to get the inner type
        let innerSchema = fieldSchema;
        let innerDef = getDef(fieldSchema);
        while (innerDef &&
            (innerDef.type === "optional" || innerDef.type === "default") &&
            innerDef.innerType) {
            innerSchema = innerDef.innerType;
            innerDef = getDef(innerSchema);
        }
        const innerType = innerDef?.type;
        // For objects, replace with z.any().describe(...) to avoid trpc-cli appending
        // "Object (json formatted); Required: [...]" from the JSON Schema
        if (innerType === "object" && typeof innerDef?.shape === "object") {
            const desc = describeZodObjectFields(innerSchema);
            const isOptional = getDef(fieldSchema)?.type === "optional";
            const replacement = isOptional ? z.any().optional().describe(desc) : z.any().describe(desc);
            enhancedShape[key] = replacement;
            hasEnhancements = true;
        }
        // For unions and arrays of complex types, replace with z.any().describe(...)
        // This prevents trpc-cli from appending raw JSON Schema (anyOf, oneOf, etc.)
        else if (innerType === "union" || innerType === "array") {
            const desc = describeZodType(innerSchema, 0);
            // Only replace if it's multi-line (complex type)
            if (desc.includes("\n")) {
                const baseIndent = "      ";
                const indentedDesc = desc
                    .split("\n")
                    .map((line) => baseIndent + line)
                    .join("\n");
                // Replace with z.any() to avoid anyOf/oneOf in JSON Schema
                // Preserve optionality by wrapping appropriately
                const isOptional = getDef(fieldSchema)?.type === "optional";
                const replacement = isOptional
                    ? z
                        .any()
                        .optional()
                        .describe("\n" + indentedDesc)
                    : z.any().describe("\n" + indentedDesc);
                enhancedShape[key] = replacement;
                hasEnhancements = true;
            }
            else {
                enhancedShape[key] = fieldSchema;
            }
        }
        else {
            enhancedShape[key] = fieldSchema;
        }
    }
    if (!hasEnhancements)
        return schema;
    // Clone the schema preserving the _zod property which trpc-cli needs for Zod 4 detection.
    // Object spread doesn't capture _zod properly (it may be non-enumerable or have getters),
    // so we explicitly copy it. We also update _zod.def.shape to use our enhanced shape,
    // since toJSONSchema reads from _zod.def, not schema.def.
    const enhancedDef = { ...def, shape: enhancedShape };
    const enhanced = {
        ...schema,
        def: enhancedDef,
        _def: enhancedDef,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const originalZod = schema._zod;
    if (originalZod) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        enhanced._zod = {
            ...originalZod,
            def: enhancedDef, // toJSONSchema reads shape from _zod.def
        };
        // Remove processJSONSchema: this method is a closure bound to the original
        // schema's internal state and traverses the original shape, ignoring our
        // enhanced def. Deleting it causes toJSONSchema to fall through to the
        // generic processor path which reads from _zod.def.shape — our patched one.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        delete enhanced._zod.processJSONSchema;
    }
    return enhanced;
}
export function proxifyOrpc(router, options) {
    // Client factory - creates a new client on each procedure invocation
    const createClient = () => {
        const link = new HTTPRPCLink({
            url: `${options.baseUrl}/orpc`,
            headers: options.authToken ? { Authorization: `Bearer ${options.authToken}` } : undefined,
        });
        return createORPCClient(link);
    };
    return createRouterProxy(router, createClient, []);
}
function createRouterProxy(router, createClient, path) {
    const result = {};
    for (const [key, value] of Object.entries(router)) {
        const newPath = [...path, key];
        if (isProcedure(value)) {
            result[key] = createProcedureProxy(value, createClient, newPath);
        }
        else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            result[key] = createRouterProxy(value, createClient, newPath);
        }
    }
    return result;
}
function createProcedureProxy(procedure, createClient, path) {
    const originalDef = procedure["~orpc"];
    const originalInputSchema = originalDef.inputSchema;
    // Check if the original schema was void/undefined - trpc-cli sends {} but server expects undefined
    const isVoidInput = isVoidOrUndefinedSchema(originalInputSchema);
    // Enhance input schema to show rich field descriptions in CLI help
    const enhancedInputSchema = enhanceInputSchema(originalInputSchema);
    // Navigate to the client method using the path (lazily creates client on call)
    const getClientMethod = () => {
        const client = createClient();
        let method = client;
        for (const segment of path) {
            method = method[segment];
        }
        return method;
    };
    // Create a procedure-like object that:
    // 1. Has the same ~orpc metadata (for schema extraction by trpc-cli)
    // 2. When called via @orpc/server's `call()`, delegates to the HTTP client
    //
    // The trick is that @orpc/server's `call()` function looks for a handler
    // in the procedure definition. We provide one that proxies to the client.
    const proxy = {
        "~orpc": {
            ...originalDef,
            // Use enhanced schema for CLI help generation
            inputSchema: enhancedInputSchema,
            // Keep the original middlewares empty for the proxy - we don't need them
            // since the server will run its own middleware chain
            middlewares: [],
            // The handler that will be called by @orpc/server's `call()` function
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            handler: async (opts) => {
                const clientMethod = getClientMethod();
                // trpc-cli sends {} for void inputs, but the server expects undefined
                const input = isVoidInput && isEmptyObject(opts.input) ? undefined : opts.input;
                return clientMethod(input);
            },
        },
    };
    return proxy;
}
//# sourceMappingURL=proxifyOrpc.js.map