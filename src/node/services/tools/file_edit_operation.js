import { FILE_EDIT_DIFF_OMITTED_MESSAGE, } from "@/common/types/tools";
import { generateDiff, validateFileSize, validateAndCorrectPath, validatePlanModeAccess, } from "./fileCommon";
import { RuntimeError } from "@/node/runtime/Runtime";
import { readFileString, writeFileString } from "@/node/utils/runtime/helpers";
/**
 * Shared execution pipeline for file edit tools.
 * Handles validation, file IO, diff generation, and common error handling.
 */
export async function executeFileEditOperation({ config, filePath, operation, abortSignal, }) {
    try {
        // Validate and auto-correct redundant path prefix
        const { correctedPath: validatedPath, warning: pathWarning } = validateAndCorrectPath(filePath, config.cwd, config.runtime);
        filePath = validatedPath;
        // Use runtime's normalizePath method to resolve paths correctly for both local and SSH runtimes
        // This ensures path resolution uses runtime-specific semantics instead of Node.js path module
        const resolvedPath = config.runtime.normalizePath(filePath, config.cwd);
        // Validate plan mode access restrictions
        const planModeError = await validatePlanModeAccess(filePath, config);
        if (planModeError) {
            return planModeError;
        }
        // Check if file exists and get stats using runtime
        let fileStat;
        try {
            fileStat = await config.runtime.stat(resolvedPath, abortSignal);
        }
        catch (err) {
            if (err instanceof RuntimeError) {
                return {
                    success: false,
                    error: err.message,
                };
            }
            throw err;
        }
        if (fileStat.isDirectory) {
            return {
                success: false,
                error: `Path is a directory, not a file: ${resolvedPath}`,
            };
        }
        const sizeValidation = validateFileSize(fileStat);
        if (sizeValidation) {
            return {
                success: false,
                error: sizeValidation.error,
            };
        }
        // Read file content using runtime helper
        let originalContent;
        try {
            originalContent = await readFileString(config.runtime, resolvedPath, abortSignal);
        }
        catch (err) {
            if (err instanceof RuntimeError) {
                return {
                    success: false,
                    error: err.message,
                };
            }
            throw err;
        }
        const operationResult = await Promise.resolve(operation(originalContent));
        if (!operationResult.success) {
            return {
                success: false,
                error: operationResult.error,
                note: operationResult.note, // Pass through agent-only message
            };
        }
        // Write file using runtime helper
        try {
            await writeFileString(config.runtime, resolvedPath, operationResult.newContent, abortSignal);
        }
        catch (err) {
            if (err instanceof RuntimeError) {
                return {
                    success: false,
                    error: err.message,
                };
            }
            throw err;
        }
        // Record file state for post-compaction attachment tracking
        if (config.recordFileState) {
            try {
                const newStat = await config.runtime.stat(resolvedPath, abortSignal);
                config.recordFileState(resolvedPath, {
                    content: operationResult.newContent,
                    timestamp: newStat.modifiedTime.getTime(),
                });
            }
            catch {
                // File stat failed, skip recording (shouldn't happen since we just wrote it)
            }
        }
        const diff = generateDiff(resolvedPath, originalContent, operationResult.newContent);
        return {
            success: true,
            diff: FILE_EDIT_DIFF_OMITTED_MESSAGE,
            ui_only: {
                file_edit: {
                    diff,
                },
            },
            ...operationResult.metadata,
            ...(pathWarning && { warning: pathWarning }),
        };
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error) {
            const nodeError = error;
            if (nodeError.code === "ENOENT") {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                };
            }
            if (nodeError.code === "EACCES") {
                return {
                    success: false,
                    error: `Permission denied: ${filePath}`,
                };
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Failed to edit file: ${message}`,
        };
    }
}
//# sourceMappingURL=file_edit_operation.js.map