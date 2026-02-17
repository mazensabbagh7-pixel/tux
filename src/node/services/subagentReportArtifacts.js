import * as fsPromises from "fs/promises";
import * as path from "node:path";
import writeFileAtomic from "write-file-atomic";
import { coerceThinkingLevel } from "@/common/types/thinking";
import { log } from "@/node/services/log";
import { workspaceFileLocks } from "@/node/utils/concurrency/workspaceFileLocks";
const SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION = 1;
const SUBAGENT_REPORT_ARTIFACTS_FILE_NAME = "subagent-reports.json";
const SUBAGENT_REPORT_DIR_NAME = "subagent-reports";
const SUBAGENT_REPORT_FILE_NAME = "report.json";
function isStringArray(value) {
    return Array.isArray(value) && value.every((v) => typeof v === "string");
}
export function getSubagentReportArtifactsFilePath(workspaceSessionDir) {
    return path.join(workspaceSessionDir, SUBAGENT_REPORT_ARTIFACTS_FILE_NAME);
}
export function getSubagentReportArtifactPath(workspaceSessionDir, childTaskId) {
    return path.join(workspaceSessionDir, SUBAGENT_REPORT_DIR_NAME, childTaskId, SUBAGENT_REPORT_FILE_NAME);
}
export async function readSubagentReportArtifactsFile(workspaceSessionDir) {
    try {
        const filePath = getSubagentReportArtifactsFilePath(workspaceSessionDir);
        const raw = await fsPromises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        const obj = parsed;
        if (obj.version !== SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION) {
            // Unknown version; treat as empty.
            return { version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        if (!obj.artifactsByChildTaskId || typeof obj.artifactsByChildTaskId !== "object") {
            return { version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        return {
            version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION,
            artifactsByChildTaskId: obj.artifactsByChildTaskId,
        };
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return { version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        log.error("Failed to read subagent report artifacts file", { error });
        return { version: SUBAGENT_REPORT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
    }
}
export async function readSubagentReportArtifactIndexEntry(workspaceSessionDir, childTaskId) {
    const file = await readSubagentReportArtifactsFile(workspaceSessionDir);
    return file.artifactsByChildTaskId[childTaskId] ?? null;
}
export async function readSubagentReportArtifact(workspaceSessionDir, childTaskId) {
    const meta = await readSubagentReportArtifactIndexEntry(workspaceSessionDir, childTaskId);
    const reportPath = getSubagentReportArtifactPath(workspaceSessionDir, childTaskId);
    try {
        const raw = await fsPromises.readFile(reportPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        const obj = parsed;
        const reportMarkdown = typeof obj.reportMarkdown === "string" ? obj.reportMarkdown : null;
        if (!reportMarkdown || reportMarkdown.length === 0) {
            return null;
        }
        const title = typeof obj.title === "string" ? obj.title : undefined;
        const model = typeof obj.model === "string" && obj.model.trim().length > 0 ? obj.model.trim() : undefined;
        const thinkingLevel = coerceThinkingLevel(obj.thinkingLevel);
        if (meta) {
            // Trust the index file for metadata (versioned), but allow per-task file to override title.
            return {
                ...meta,
                model: typeof meta.model === "string" && meta.model.trim().length > 0
                    ? meta.model.trim()
                    : undefined,
                thinkingLevel: coerceThinkingLevel(meta.thinkingLevel),
                title: title ?? meta.title,
                reportMarkdown,
            };
        }
        // Self-healing: if the index entry is missing/corrupted, fall back to the per-task artifact.
        const parentWorkspaceId = typeof obj.parentWorkspaceId === "string" ? obj.parentWorkspaceId : null;
        const createdAtMs = typeof obj.createdAtMs === "number" ? obj.createdAtMs : null;
        const updatedAtMs = typeof obj.updatedAtMs === "number" ? obj.updatedAtMs : null;
        const ancestorWorkspaceIds = isStringArray(obj.ancestorWorkspaceIds)
            ? obj.ancestorWorkspaceIds
            : null;
        if (!parentWorkspaceId || !createdAtMs || !updatedAtMs || !ancestorWorkspaceIds) {
            return null;
        }
        return {
            childTaskId,
            parentWorkspaceId,
            createdAtMs,
            updatedAtMs,
            model,
            thinkingLevel,
            title,
            ancestorWorkspaceIds,
            reportMarkdown,
        };
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return null;
        }
        log.error("Failed to read subagent report artifact", { childTaskId, error });
        return null;
    }
}
export async function updateSubagentReportArtifactsFile(params) {
    return workspaceFileLocks.withLock(params.workspaceId, async () => {
        const file = await readSubagentReportArtifactsFile(params.workspaceSessionDir);
        params.update(file);
        try {
            await fsPromises.mkdir(params.workspaceSessionDir, { recursive: true });
            const filePath = getSubagentReportArtifactsFilePath(params.workspaceSessionDir);
            await writeFileAtomic(filePath, JSON.stringify(file, null, 2));
        }
        catch (error) {
            log.error("Failed to write subagent report artifacts file", { error });
        }
        return file;
    });
}
export async function upsertSubagentReportArtifact(params) {
    let updated = null;
    await workspaceFileLocks.withLock(params.workspaceId, async () => {
        const nowMs = params.nowMs ?? Date.now();
        const model = typeof params.model === "string" && params.model.trim().length > 0
            ? params.model.trim()
            : undefined;
        const thinkingLevel = coerceThinkingLevel(params.thinkingLevel);
        const file = await readSubagentReportArtifactsFile(params.workspaceSessionDir);
        const existing = file.artifactsByChildTaskId[params.childTaskId] ?? null;
        const createdAtMs = existing?.createdAtMs ?? nowMs;
        // Write the report payload first so we never publish an index entry without a report body.
        const reportPath = getSubagentReportArtifactPath(params.workspaceSessionDir, params.childTaskId);
        try {
            await fsPromises.mkdir(path.dirname(reportPath), { recursive: true });
            await writeFileAtomic(reportPath, JSON.stringify({
                childTaskId: params.childTaskId,
                parentWorkspaceId: params.parentWorkspaceId,
                createdAtMs,
                updatedAtMs: nowMs,
                model,
                thinkingLevel,
                title: params.title,
                ancestorWorkspaceIds: params.ancestorWorkspaceIds,
                reportMarkdown: params.reportMarkdown,
            }, null, 2));
        }
        catch (error) {
            log.error("Failed to write subagent report artifact", {
                workspaceId: params.workspaceId,
                childTaskId: params.childTaskId,
                error,
            });
            return;
        }
        updated = {
            childTaskId: params.childTaskId,
            parentWorkspaceId: params.parentWorkspaceId,
            createdAtMs,
            updatedAtMs: nowMs,
            model,
            thinkingLevel,
            title: params.title,
            ancestorWorkspaceIds: params.ancestorWorkspaceIds,
        };
        file.artifactsByChildTaskId[params.childTaskId] = updated;
        try {
            await fsPromises.mkdir(params.workspaceSessionDir, { recursive: true });
            const filePath = getSubagentReportArtifactsFilePath(params.workspaceSessionDir);
            await writeFileAtomic(filePath, JSON.stringify(file, null, 2));
        }
        catch (error) {
            log.error("Failed to write subagent report artifacts file", { error });
        }
    });
    if (!updated) {
        throw new Error("upsertSubagentReportArtifact: failed to write report artifact");
    }
    return updated;
}
//# sourceMappingURL=subagentReportArtifacts.js.map