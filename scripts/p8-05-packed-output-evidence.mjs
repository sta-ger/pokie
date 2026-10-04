import {createHash} from "node:crypto";
import {readFile, readdir, stat} from "node:fs/promises";
import path from "node:path";

export const P805_MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const chunkBytes = 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const outputPath = (value) => typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.posix.isAbsolute(value) && value.split("/").every((part) => part && part !== "." && part !== "..");

/** Preserve the actual public CLI output before its owned workspace is drained.
 * Bytes live once in bounded immutable evidence; receipts carry only references. */
export async function preserveP805PackedCliOutput(output, command, target, candidate, save, services = {readFile, readdir, stat}) {
    const files = [];
    const collectFile = async (filePath, targetPath) => {
        const bytes = Buffer.from(await services.readFile(targetPath));
        if (!outputPath(filePath) || bytes.length === 0) throw new Error(`packed ${output} has an empty or invalid output file`);
        const chunks = [];
        for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
            const chunk = bytes.subarray(offset, offset + chunkBytes);
            const evidenceId = await save("packed-cli-output-chunk", `compound-${output}-${files.length}-${chunks.length}.bin`, chunk, ["outcome-library-report-diff-replay"]);
            chunks.push({evidenceId, offset, sizeBytes:chunk.length, sha256:digest(chunk)});
        }
        files.push({path:filePath, sha256:digest(bytes), sizeBytes:bytes.length, chunks});
    };
    const collectDirectory = async (directory, relative = "") => {
        const entries = await services.readdir(directory, {withFileTypes:true});
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            const next = path.posix.join(relative, entry.name), nextTarget = path.join(directory, entry.name);
            if (entry.isDirectory()) await collectDirectory(nextTarget, next);
            else if (entry.isFile()) await collectFile(next, nextTarget);
            else throw new Error(`packed ${output} has a non-regular output file`);
        }
    };
    const metadata = await services.stat(target);
    if (metadata.isDirectory()) await collectDirectory(target);
    else if (metadata.isFile()) await collectFile(path.basename(target), target);
    if (files.length === 0) throw new Error(`${command} created no retainable ${output} output`);
    files.sort((left, right) => left.path.localeCompare(right.path));
    const receipt = {kind:"p8-05-packed-cli-output", ...candidate, publicWorkflow:"outcome-library-report-diff-replay", output, command, files, sha256:digest(JSON.stringify(files))};
    const evidenceId = await save("packed-cli-output", `compound-${output}.json`, JSON.stringify(receipt), ["outcome-library-report-diff-replay"]);
    return {...receipt, evidenceId};
}

/** Structural validation is also used by the rendered child receipt consumer.
 * Referenced bytes still require the campaign's bounded filesystem validation. */
export function hasP805PackedOutputManifest(entry) {
    const files = entry?.files, ids = new Set(), paths = new Set();
    return Array.isArray(files) && files.length > 0 && files.every((file) => {
        if (!outputPath(file?.path) || paths.has(file.path) || !sha(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1) return false;
        paths.add(file.path);
        // Keep existing immutable inline receipts readable with their original
        // digest contract. The writer now emits only chunk references.
        if (file.chunks === undefined) return typeof file.contentsBase64 === "string" && Buffer.from(file.contentsBase64, "base64").length === file.sizeBytes && digest(Buffer.from(file.contentsBase64, "base64")) === file.sha256;
        if (file.contentsBase64 !== undefined || !Array.isArray(file.chunks) || file.chunks.length === 0) return false;
        let offset = 0;
        for (const chunk of file.chunks) {
            if (typeof chunk?.evidenceId !== "string" || !chunk.evidenceId || ids.has(chunk.evidenceId) || chunk.offset !== offset || !sha(chunk.sha256) || !Number.isSafeInteger(chunk.sizeBytes) || chunk.sizeBytes < 1 || chunk.sizeBytes > P805_MAX_EVIDENCE_BYTES) return false;
            ids.add(chunk.evidenceId);
            offset += chunk.sizeBytes;
        }
        return offset === file.sizeBytes;
    }) && sha(entry.sha256) && entry.sha256 === digest(JSON.stringify([...files].sort((left, right) => left.path.localeCompare(right.path))));
}

/** All entries were read through boundedEvidence before this reconstruction. */
export function authenticateP805PackedOutput(entry, evidenceById, usedChunks) {
    if (!hasP805PackedOutputManifest(entry)) throw new Error("packed CLI output has an invalid file manifest");
    const manifest = evidenceById.get(entry.evidenceId);
    const {evidenceId, ...receipt} = entry;
    if (!manifest || !["packed-cli-output", "artifact"].includes(manifest.item.kind) || !manifest.item.observationIds.includes("outcome-library-report-diff-replay") || JSON.stringify(JSON.parse(manifest.contents.toString("utf8"))) !== JSON.stringify(receipt)) throw new Error("packed CLI output differs from its immutable receipt");
    for (const file of entry.files) {
        if (file.chunks === undefined) continue;
        const hash = createHash("sha256");
        for (const chunk of file.chunks) {
            const evidence = evidenceById.get(chunk.evidenceId);
            if (usedChunks.has(chunk.evidenceId) || evidence?.item.kind !== "packed-cli-output-chunk" || !evidence.item.observationIds.includes("outcome-library-report-diff-replay") || evidence.contents.length !== chunk.sizeBytes || digest(evidence.contents) !== chunk.sha256) throw new Error("packed CLI output has a missing, duplicate, or digest-mismatched chunk");
            usedChunks.add(chunk.evidenceId);
            hash.update(evidence.contents);
        }
        if (hash.digest("hex") !== file.sha256) throw new Error("packed CLI output chunks differ from the complete output digest");
    }
}
