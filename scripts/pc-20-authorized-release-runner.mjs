#!/usr/bin/env node
/**
 * The credentialed half of PC-20.  This file is for the protected
 * `pokie-release-runner` only; it never guesses credentials or manufactures a
 * lifecycle receipt when git, npm, or Drive cannot prove the same archive.
 */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {assertPc20CandidateClean, PC20_EVIDENCE_DIRECTORY, PC20_SCHEMA_VERSION, validatePc20ReleaseGate} from "./pc-20-release-completion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sha = (value, length) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
const fail = (message) => { throw new Error(`PC-20 authorized release runner refused: ${message}`); };
const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {cwd:root, encoding:"utf8", ...options});
    if (result.error || result.status !== 0) fail(`${command} ${args.join(" ")} failed: ${(result.error?.message || result.stderr || result.stdout || "").trim()}`);
    return (result.stdout || "").trim();
};
const json = async (target) => {
    try { return JSON.parse(await readFile(target, "utf8")); } catch { fail(`cannot read JSON: ${target}`); }
};

function requireConfig(config, candidateRef) {
    if (!config || path.resolve(config.repositoryDirectory || "") !== root || path.resolve(config.outputDirectory || "") !== PC20_EVIDENCE_DIRECTORY || !sha(config.candidateId, 40) || config.candidateId !== candidateRef || !sha(config.candidatePackageSha256, 64) || typeof config.packageName !== "string" || typeof config.packageVersion !== "string" || !path.isAbsolute(config.lifecycleReceiptPath || "") || path.resolve(config.lifecycleReceiptPath).startsWith(`${PC20_EVIDENCE_DIRECTORY}${path.sep}`)) fail("config is not a canonical authorized PC-20 candidate configuration");
    if (!process.env.NODE_AUTH_TOKEN) fail("npm publication authority is unavailable");
    if (!process.env.PC20_DRIVE_ACCESS_TOKEN) fail("credentialed Drive round-trip authority is unavailable");
}

async function driveRoundTrip(gatePath, gateSha256) {
    const body = await readFile(gatePath);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=media", {method:"POST", headers:{Authorization:`Bearer ${process.env.PC20_DRIVE_ACCESS_TOKEN}`, "Content-Type":"application/json"}, body});
    if (!response.ok) fail(`Drive upload failed (${response.status})`);
    const uploaded = await response.json();
    if (!uploaded || typeof uploaded.id !== "string" || !uploaded.id) fail("Drive upload returned no file id");
    const readBack = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}?alt=media`, {headers:{Authorization:`Bearer ${process.env.PC20_DRIVE_ACCESS_TOKEN}`}});
    if (!readBack.ok) fail(`Drive read-back failed (${readBack.status})`);
    const bytes = Buffer.from(await readBack.arrayBuffer());
    if (digest(bytes) !== gateSha256) fail("Drive read-back digest differs from retained gate evidence");
    return {uploaded:true, readBack:true, releaseGateSha256:gateSha256, readBackSha256:gateSha256, uploadId:uploaded.id, uploadedAt:new Date().toISOString(), readBackAt:new Date().toISOString()};
}

export async function runAuthorizedPc20Lifecycle(config, candidateRef) {
    requireConfig(config, candidateRef);
    if (run("git", ["rev-parse", "HEAD"]) !== candidateRef) fail("checked-out candidate ref drifted before lifecycle");
    const nameVersion = `${config.packageName}@${config.packageVersion}`;
    // The controller's exact candidate receipts are intentionally untracked until
    // the protected runner publishes.  Nothing else, including another PC-20
    // artifact, is tolerated by this shared cleanliness contract.
    assertPc20CandidateClean(root, candidateRef, "candidate checkout before lifecycle", {includeCompletion:false, includeFailed:false});
    // Re-read the controller's immutable gate rather than treating the
    // tolerated filenames as proof that a gate really succeeded.
    await validatePc20ReleaseGate(config);
    const remote = run("git", ["remote", "get-url", "origin"]);
    if (!remote) fail("push authority is unavailable");
    run("git", ["checkout", "develop"]);
    run("git", ["merge", "--ff-only", candidateRef]);
    if (run("git", ["rev-parse", "HEAD"]) !== candidateRef) fail("develop did not resolve to the accepted candidate");
    assertPc20CandidateClean(root, candidateRef, "develop before push/publication", {includeCompletion:false, includeFailed:false});
    run("git", ["push", "origin", "develop"]);
    const pushedAt = new Date().toISOString();
    const archive = path.join(PC20_EVIDENCE_DIRECTORY, `pc-20-${candidateRef}-package.tgz`);
    const gatePath = path.join(PC20_EVIDENCE_DIRECTORY, `pc-20-${candidateRef}-release-gate.json`);
    if (!existsSync(archive) || !existsSync(gatePath)) fail("candidate-bound gate archive/receipt is unavailable");
    const archiveBytes = await readFile(archive);
    if (digest(archiveBytes) !== config.candidatePackageSha256) fail("retained archive digest drifted before npm publication");
    run("npm", ["publish", archive, "--access", "public"]);
    const dist = JSON.parse(run("npm", ["view", nameVersion, "dist", "--json"]));
    if (!dist || typeof dist.tarball !== "string") fail("registry publication confirmation lacks a tarball identity");
    const publishedArchive = Buffer.from(await (await fetch(dist.tarball)).arrayBuffer());
    if (digest(publishedArchive) !== config.candidatePackageSha256) fail("registry tarball differs from the retained candidate archive");
    const gateContents = await readFile(gatePath);
    const gateSha256 = digest(gateContents);
    const drive = await driveRoundTrip(gatePath, gateSha256);
    const receipt = {schemaVersion:PC20_SCHEMA_VERSION, receiptId:`pc-20-${candidateRef}`, issuedAt:new Date().toISOString(), candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, releaseSha:candidateRef, git:{mergedToDevelop:true, cleanDevelop:true, developSha:candidateRef, pushedSha:candidateRef, remote, pushedAt}, publication:{published:true, packageName:config.packageName, packageVersion:config.packageVersion, packageSha256:config.candidatePackageSha256, registryArchiveSha256:config.candidatePackageSha256, publishedSha:candidateRef, registryIdentity:dist.tarball, publishedAt:new Date().toISOString()}, drive};
    const target = path.resolve(config.lifecycleReceiptPath);
    await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return receipt;
}

async function main(argv = process.argv) {
    if (argv.length !== 6 || argv[2] !== "--config" || argv[4] !== "--candidate-ref" || !path.isAbsolute(argv[3]) || !sha(argv[5], 40)) fail("usage: --config <absolute-path> --candidate-ref <40-char-sha>");
    const config = await json(argv[3]);
    await runAuthorizedPc20Lifecycle(config, argv[5]);
    // The protected runner is the trusted producer of this post-publication
    // receipt.  Bind its final bytes before the separate completion invocation;
    // a read-only/missing config fails here and therefore cannot be completed.
    config.lifecycleReceiptSha256 = digest(await readFile(config.lifecycleReceiptPath));
    await writeFile(argv[3], `${JSON.stringify(config, null, 2)}\n`);
    process.stdout.write(`PC20_AUTHORIZED_LIFECYCLE_PASS candidate=${argv[5]}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
