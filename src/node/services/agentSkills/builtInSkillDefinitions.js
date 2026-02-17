import * as path from "node:path";
import { parseSkillMarkdown } from "./parseSkillMarkdown";
import { BUILTIN_SKILL_FILES } from "./builtInSkillContent.generated";
const BUILT_IN_SOURCES = Object.entries(BUILTIN_SKILL_FILES).map(([name, files]) => ({ name, files }));
let cachedPackages = null;
function parseBuiltIns() {
    return BUILT_IN_SOURCES.map(({ name, files }) => {
        const content = files["SKILL.md"];
        if (content === undefined) {
            throw new Error(`Built-in skill '${name}' is missing SKILL.md`);
        }
        const parsed = parseSkillMarkdown({
            content,
            byteSize: Buffer.byteLength(content, "utf8"),
            directoryName: name,
        });
        return {
            scope: "built-in",
            directoryName: name,
            frontmatter: parsed.frontmatter,
            body: parsed.body.trim(),
        };
    });
}
export function getBuiltInSkillDefinitions() {
    cachedPackages ?? (cachedPackages = parseBuiltIns());
    return cachedPackages;
}
export function getBuiltInSkillDescriptors() {
    return getBuiltInSkillDefinitions().map((pkg) => ({
        name: pkg.frontmatter.name,
        description: pkg.frontmatter.description,
        scope: pkg.scope,
        advertise: pkg.frontmatter.advertise,
    }));
}
export function getBuiltInSkillByName(name) {
    return getBuiltInSkillDefinitions().find((pkg) => pkg.frontmatter.name === name);
}
function isAbsolutePathAny(filePath) {
    if (filePath.startsWith("/") || filePath.startsWith("\\"))
        return true;
    // Windows drive letter paths (e.g., C:\foo or C:/foo)
    if (/^[A-Za-z]:/.test(filePath)) {
        const sep = filePath[2];
        return sep === "\\" || sep === "/";
    }
    return false;
}
function normalizeBuiltInSkillFilePath(filePath) {
    if (!filePath) {
        throw new Error("filePath is required");
    }
    // Disallow absolute paths and home-relative paths.
    if (isAbsolutePathAny(filePath) || filePath.startsWith("~")) {
        throw new Error(`Invalid filePath (must be relative to the skill directory): ${filePath}`);
    }
    // Always normalize with posix separators (built-in skill file paths are stored posix-style).
    const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
    const stripped = normalized.startsWith("./") ? normalized.slice(2) : normalized;
    if (stripped === "" || stripped === "." || stripped.endsWith("/")) {
        throw new Error(`Invalid filePath (expected a file, got directory): ${filePath}`);
    }
    if (stripped === ".." || stripped.startsWith("../")) {
        throw new Error(`Invalid filePath (path traversal): ${filePath}`);
    }
    return stripped;
}
export function readBuiltInSkillFile(name, filePath) {
    const resolvedPath = normalizeBuiltInSkillFilePath(filePath);
    const skillFiles = BUILTIN_SKILL_FILES[name];
    if (!skillFiles) {
        throw new Error(`Built-in skill not found: ${name}`);
    }
    const content = skillFiles[resolvedPath];
    if (content === undefined) {
        throw new Error(`Built-in skill file not found: ${name}/${resolvedPath}`);
    }
    return { resolvedPath, content };
}
/** Exposed for testing - clears cached parsed packages */
export function clearBuiltInSkillCache() {
    cachedPackages = null;
}
//# sourceMappingURL=builtInSkillDefinitions.js.map