/**
 * Type Generator for PTC
 *
 * Generates `.d.ts` TypeScript declarations from tool schemas.
 * Used to:
 * 1. Inform the model about available tools and their signatures
 * 2. Validate agent code with TypeScript before QuickJS execution
 *
 * Input types are generated from Zod schemas via JSON Schema conversion.
 * Result types are generated from Zod schemas in toolDefinitions.ts (single source of truth).
 */
import { createHash } from "crypto";
import { z } from "zod";
import { compile } from "json-schema-to-typescript";
import { RESULT_SCHEMAS } from "@/common/utils/tools/toolDefinitions";
/**
 * MCP result type - protocol-defined, same for all MCP tools.
 */
const MCP_RESULT_TYPE = `type MCPCallToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; text?: string; blob?: string } }
  >;
  isError?: boolean;
};`;
const cache = {
    fullTypes: new Map(),
    resultTypes: new Map(),
};
/**
 * Clear all type caches. Call for test isolation or when tool schemas might have changed.
 */
export function clearTypeCache() {
    cache.fullTypes.clear();
    cache.resultTypes.clear();
}
/**
 * Hash tool definitions (names, schemas, descriptions) to detect when tools change.
 * This ensures cache invalidation when schemas are updated, not just when tool names change.
 */
function hashToolDefinitions(tools) {
    const sortedNames = Object.keys(tools).sort();
    const toolData = sortedNames.map((name) => {
        const tool = tools[name];
        return {
            name,
            schema: getInputJsonSchema(tool),
            description: tool.description ?? "",
        };
    });
    return createHash("md5").update(JSON.stringify(toolData)).digest("hex");
}
/**
 * Get cached mux types or generate new ones if tool definitions changed.
 */
export async function getCachedMuxTypes(tools) {
    const hash = hashToolDefinitions(tools);
    const cached = cache.fullTypes.get(hash);
    if (cached) {
        return cached;
    }
    const types = await generateMuxTypes(tools);
    cache.fullTypes.set(hash, types);
    return types;
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Convert snake_case or kebab-case to PascalCase.
 */
function pascalCase(str) {
    return str
        .split(/[_-]/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
}
/**
 * Remove fields with "default" values from the "required" array so
 * json-schema-to-typescript generates optional (`?`) properties.
 *
 * Why this is needed: Zod's `.default(value)` makes the *input* optional
 * (safeParse fills in the default) but z.toJSONSchema() keeps the field in
 * "required" — JSON Schema treats "required" and "default" as orthogonal
 * concepts. json-schema-to-typescript then faithfully maps "required" →
 * non-optional TS property, producing types that don't match runtime behavior.
 *
 * Important: Only apply this to JSON Schema that came from Zod. For raw JSON
 * Schema (e.g. MCP tool parameters), `default` is advisory metadata and does
 * not imply optional input.
 */
function removeDefaultsFromRequired(schema) {
    const result = { ...schema };
    const properties = result.properties;
    const required = result.required;
    if (properties && required) {
        result.required = required.filter((key) => {
            const prop = properties[key];
            return prop == null || !("default" in prop);
        });
    }
    return result;
}
/**
 * Indent each line of a string.
 */
function indent(str, spaces) {
    const pad = " ".repeat(spaces);
    return str
        .split("\n")
        .map((line) => (line.trim() ? pad + line : line))
        .join("\n");
}
/**
 * Extract JSON Schema from a tool, handling both Zod schemas and raw JSON Schema.
 */
function getInputJsonSchema(tool) {
    const toolRecord = tool;
    const schema = toolRecord.inputSchema ?? toolRecord.parameters;
    if (!schema) {
        return { type: "object", properties: {}, required: [] };
    }
    // Check if it's a Zod schema (has _def property)
    if (typeof schema === "object" && "_def" in schema) {
        // Zod `.default(...)` makes inputs optional, but z.toJSONSchema() keeps
        // those fields in the "required" array. Strip them so the generated TS
        // types match runtime behavior.
        return removeDefaultsFromRequired(z.toJSONSchema(schema));
    }
    // Already JSON Schema — leave required array untouched; `default` is advisory
    // metadata and does not imply optional input.
    return schema;
}
/**
 * Get result type string for a built-in tool.
 * Uses Zod schema → JSON Schema → TypeScript string pipeline.
 * Results are cached by tool name.
 *
 * @returns TypeScript type string or null if no schema exists
 */
async function getResultTypeString(toolName) {
    // Check cache first
    if (cache.resultTypes.has(toolName)) {
        return cache.resultTypes.get(toolName);
    }
    // Check if this is a bridgeable tool with a known result schema
    if (!(toolName in RESULT_SCHEMAS)) {
        return null;
    }
    const schema = RESULT_SCHEMAS[toolName];
    // Convert Zod → JSON Schema → TypeScript
    const jsonSchema = z.toJSONSchema(schema);
    const tsOutput = await compile(jsonSchema, `${pascalCase(toolName)}Result`, {
        bannerComment: "",
        ignoreMinAndMaxItems: true,
    });
    // Extract just the type definition body (after "export type X = ")
    // The compile output looks like: "export type FooResult = { ... } | { ... };"
    // Use regex to match the declaration pattern, avoiding false matches on `=` in type body
    const typeBodyRegex = /^export\s+type\s+\w+\s*=\s*([\s\S]+?);?\s*$/;
    const match = typeBodyRegex.exec(tsOutput);
    if (!match)
        return null;
    const result = match[1].trim();
    if (result) {
        cache.resultTypes.set(toolName, result);
    }
    return result;
}
// ============================================================================
// Main Generator
// ============================================================================
/**
 * Generate TypeScript declaration file content for all bridgeable tools.
 *
 * @param tools Record of tool name to Tool, already filtered to bridgeable tools only
 * @returns `.d.ts` content as a string
 */
export async function generateMuxTypes(tools) {
    const lines = ["declare namespace mux {"];
    let mcpToolsPresent = false;
    // Sort tool names for deterministic output
    const sortedNames = Object.keys(tools).sort();
    for (const name of sortedNames) {
        const tool = tools[name];
        const isMcp = name.startsWith("mcp__");
        // Generate arg interface from JSON Schema
        const inputSchema = getInputJsonSchema(tool);
        const argsTypeName = `${pascalCase(name)}Args`;
        try {
            const argInterface = await compile(inputSchema, argsTypeName, {
                bannerComment: "",
                ignoreMinAndMaxItems: true, // Clean Type[] instead of verbose tuple unions
            });
            // Strip "export " prefix and add to output
            const stripped = argInterface.replace(/^export /gm, "");
            lines.push(indent(stripped.trim(), 2));
        }
        catch {
            // Fallback for schemas that can't be compiled
            lines.push(`  interface ${argsTypeName} { [key: string]: unknown; }`);
        }
        // Add JSDoc comment with tool description (first line only)
        const description = tool.description ?? "";
        if (description) {
            const firstLine = description.split("\n")[0].trim();
            if (firstLine) {
                lines.push(`  /** ${firstLine} */`);
            }
        }
        // Add function declaration with appropriate result type
        // Note: Asyncify makes async host functions appear synchronous to QuickJS,
        // so we declare them as returning T directly, not Promise<T>
        if (isMcp) {
            mcpToolsPresent = true;
            lines.push(`  function ${name}(args: ${argsTypeName}): MCPCallToolResult;`);
        }
        else {
            const resultType = await getResultTypeString(name);
            if (resultType) {
                const resultTypeName = `${pascalCase(name)}Result`;
                lines.push(`  type ${resultTypeName} = ${resultType};`);
                lines.push(`  function ${name}(args: ${argsTypeName}): ${resultTypeName};`);
            }
            else {
                // Unknown tool - return unknown
                lines.push(`  function ${name}(args: ${argsTypeName}): unknown;`);
            }
        }
        lines.push(""); // Blank line between tools
    }
    // Add MCP result type if any MCP tools are present
    if (mcpToolsPresent) {
        lines.push(indent(MCP_RESULT_TYPE, 2));
        lines.push("");
    }
    lines.push("}");
    lines.push("");
    // Add console global declaration
    lines.push("declare var console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };");
    lines.push("");
    return lines.join("\n");
}
//# sourceMappingURL=typeGenerator.js.map