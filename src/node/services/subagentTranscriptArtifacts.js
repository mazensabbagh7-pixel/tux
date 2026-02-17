import * as fsPromises from "fs/promises";
import * as path from "node:path";
import writeFileAtomic from "write-file-atomic";
import { log } from "@/node/services/log";
import { workspaceFileLocks } from "@/node/utils/concurrency/workspaceFileLocks";
const SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION = 1;
const SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_NAME = "subagent-transcripts.json";
const SUBAGENT_TRANSCRIPTS_DIR_NAME = "subagent-transcripts";
const SUBAGENT_TRANSCRIPT_CHAT_FILE_NAME = "chat.jsonl";
const SUBAGENT_TRANSCRIPT_PARTIAL_FILE_NAME = "partial.json";
export function getSubagentTranscriptArtifactsFilePath(workspaceSessionDir) {
    return path.join(workspaceSessionDir, SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_NAME);
}
export function getSubagentTranscriptChatPath(workspaceSessionDir, childTaskId) {
    return path.join(workspaceSessionDir, SUBAGENT_TRANSCRIPTS_DIR_NAME, childTaskId, SUBAGENT_TRANSCRIPT_CHAT_FILE_NAME);
}
export function getSubagentTranscriptPartialPath(workspaceSessionDir, childTaskId) {
    return path.join(workspaceSessionDir, SUBAGENT_TRANSCRIPTS_DIR_NAME, childTaskId, SUBAGENT_TRANSCRIPT_PARTIAL_FILE_NAME);
}
export async function readSubagentTranscriptArtifactsFile(workspaceSessionDir) {
    try {
        const filePath = getSubagentTranscriptArtifactsFilePath(workspaceSessionDir);
        const raw = await fsPromises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        const obj = parsed;
        if (obj.version !== SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION) {
            // Unknown version; treat as empty.
            return { version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        if (!obj.artifactsByChildTaskId || typeof obj.artifactsByChildTaskId !== "object") {
            return { version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        return {
            version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION,
            artifactsByChildTaskId: obj.artifactsByChildTaskId,
        };
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            return { version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
        }
        log.error("Failed to read subagent transcript artifacts file", { error });
        return { version: SUBAGENT_TRANSCRIPT_ARTIFACTS_FILE_VERSION, artifactsByChildTaskId: {} };
    }
}
export async function updateSubagentTranscriptArtifactsFile(params) {
    return workspaceFileLocks.withLock(params.workspaceId, async () => {
        const file = await readSubagentTranscriptArtifactsFile(params.workspaceSessionDir);
        params.update(file);
        try {
            await fsPromises.mkdir(params.workspaceSessionDir, { recursive: true });
            const filePath = getSubagentTranscriptArtifactsFilePath(params.workspaceSessionDir);
            await writeFileAtomic(filePath, JSON.stringify(file, null, 2));
        }
        catch (error) {
            log.error("Failed to write subagent transcript artifacts file", { error });
        }
        return file;
    });
}
export async function upsertSubagentTranscriptArtifactIndexEntry(params) {
    let updated = null;
    await updateSubagentTranscriptArtifactsFile({
        workspaceId: params.workspaceId,
        workspaceSessionDir: params.workspaceSessionDir,
        update: (file) => {
            const existing = file.artifactsByChildTaskId[params.childTaskId] ?? null;
            updated = params.updater(existing);
            file.artifactsByChildTaskId[params.childTaskId] = updated;
        },
    });
    if (!updated) {
        throw new Error("upsertSubagentTranscriptArtifactIndexEntry: updater returned no entry");
    }
    return updated;
}
//# sourceMappingURL=subagentTranscriptArtifacts.js.map