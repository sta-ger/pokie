import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterAll, beforeAll, test} from "@jest/globals";
import {archiveExecutableManifest} from "../../scripts/p8-05-candidate-package-verifier.mjs";
import {authenticateP805ProductTree, readP805ReleaseArchive, validateP805ReleaseHandoff} from "../../scripts/p8-05-release-handoff.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let directory, repository, options, dependencies, runtimeCandidate, buildCandidate, closeout, receiptBytes, closeoutBytes;
const git = (...args) => execFileSync("git", args, {cwd:repository, encoding:"utf8", stdio:["ignore", "pipe", "pipe"]}).trim();
async function commitFile(file, contents) {
    await mkdir(path.dirname(path.join(repository, file)), {recursive:true});
    await writeFile(path.join(repository, file), contents);
    git("add", file);
    git("-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "-m", "handoff fixture");
    return git("rev-parse", "HEAD");
}
beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "p805-handoff-"));
    repository = path.join(directory, "repository");
    await mkdir(repository);
    git("init");
    const declaration = {name:"pokie", version:"1.0.0", scripts:{build:"test-only-declaration"}};
    const auditedCandidateId = await commitFile("package.json", JSON.stringify(declaration));
    const candidateId = await commitFile("docs/evidence/p8-05-product-readiness/index.md", "appended evidence\n");
    runtimeCandidate = await commitFile("cli/pokie.ts", "changed product executable\n");
    git("reset", "--hard", candidateId);
    buildCandidate = await commitFile("tsconfig.prod.json", "changed build inputs\n");
    const packageRoot = path.join(directory, "package");
    await mkdir(path.join(packageRoot, "dist/cli"), {recursive:true});
    await writeFile(path.join(packageRoot, "package.json"), JSON.stringify(declaration));
    await writeFile(path.join(packageRoot, "dist/cli/pokie.js"), "canonical executable\n");
    const archivePath = path.join(directory, "canonical.tgz");
    execFileSync("tar", ["-czf", archivePath, "-C", directory, "package"]);
    const archive = await readFile(archivePath), projection = await archiveExecutableManifest(archive);
    const auditedTreeId = git("rev-parse", `${auditedCandidateId}^{tree}`);
    const entries = [{path:"package.json", gitBlob:git("rev-parse", `${auditedCandidateId}:package.json`)}];
    const manifestSha256 = hash(JSON.stringify({tree:auditedTreeId, entries}));
    const verifiedBuild = {kind:"p8-05-verified-candidate-build", candidateId:auditedCandidateId, executableSha256:projection.sha256, executableFiles:projection.files};
    const receipt = {kind:"p8-05-candidate-executable-receipt", issuer:"fixture-verifier", receiptId:"fixture", candidateId:auditedCandidateId, candidatePackageSha256:hash(archive), candidateExecutableSha256:projection.sha256, candidateTreeManifestCandidateId:auditedCandidateId, candidateTreeObjectId:auditedTreeId, candidateTreeManifestSha256:manifestSha256, verifiedBuild, authentication:{scheme:"verifier-owned-candidate-tree", verifierId:"fixture-verifier", attestedCandidateId:auditedCandidateId, attestedCandidateTreeManifestSha256:manifestSha256, attestedExecutableSha256:projection.sha256, attestedBuildSha256:hash(JSON.stringify(verifiedBuild))}};
    const receiptPath = path.join(directory, "executable-receipt.json");
    receiptBytes = JSON.stringify(receipt);
    await writeFile(receiptPath, receiptBytes);
    const campaignDirectory = path.join(directory, "campaign");
    await mkdir(campaignDirectory);
    const payload = {candidateId:auditedCandidateId, candidatePackageSha256:hash(archive), candidateExecutableSha256:projection.sha256, candidateExecutableReceipt:{path:receiptPath, sha256:hash(receiptBytes)}};
    closeoutBytes = `${JSON.stringify(payload, null, 2)}\n`;
    await writeFile(path.join(campaignDirectory, "closeout.json"), closeoutBytes);
    options = {candidateId, auditedCandidateId, archivePath, campaignDirectory, candidatePackageSha256:hash(archive), freezeAnchorSha256:"a".repeat(64), closeoutAnchorSha256:"b".repeat(64)};
    closeout = {campaignId:"fixture-campaign", candidateId:auditedCandidateId, candidatePackageSha256:hash(archive), closeoutSha256:hash(closeoutBytes), manifestSha256:"c".repeat(64), closedAt:"2026-10-06T00:00:00.000Z"};
    dependencies = {repositoryRoot:repository, validateCampaign:async (target, expected) => {
        assert.equal(target, campaignDirectory);
        assert.deepEqual(expected, {candidateId:auditedCandidateId, candidatePackageSha256:hash(archive), freezeAnchorSha256:options.freezeAnchorSha256, closeoutAnchorSha256:options.closeoutAnchorSha256});
        return closeout;
    }};
});
afterAll(async () => { await rm(directory, {recursive:true, force:true}); });

test("authenticates both Git identities and retains the canonical archive byte for byte", async () => {
    const before = await readFile(path.join(options.campaignDirectory, "closeout.json"));
    const result = await validateP805ReleaseHandoff(options, dependencies);
    assert.equal(result.closeout.candidateId, options.auditedCandidateId);
    assert.equal(result.binding.candidateId, options.candidateId);
    assert.equal(result.binding.candidateExecutableReceiptSha256, hash(receiptBytes));
    assert.equal(result.binding.campaignManifestSha256, closeout.manifestSha256);
    assert.equal(result.binding.campaignCloseoutSha256, closeout.closeoutSha256);
    assert.equal(result.sha256, hash(JSON.stringify(result.binding)));
    assert.deepEqual(result.archive, await readFile(options.archivePath));
    const consumed = await readP805ReleaseArchive({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, p805ReleaseHandoff:options, p805ReleaseHandoffSha256:result.sha256}, dependencies);
    assert.deepEqual(consumed.archive, result.archive);
    assert.deepEqual(await readFile(path.join(options.campaignDirectory, "closeout.json")), before);
});

test("rejects runtime, compiler, unrelated-step evidence and non-descendant drift", async () => {
    assert.throws(() => authenticateP805ProductTree(options.auditedCandidateId, runtimeCandidate, repository), /new blind retests/);
    assert.throws(() => authenticateP805ProductTree(options.auditedCandidateId, buildCandidate, repository), /new blind retests/);
    git("reset", "--hard", options.candidateId);
    const priorEvidence = await commitFile("docs/evidence/p8-04-studio-polish/receipt.json", "changed prior-step history\n");
    assert.throws(() => authenticateP805ProductTree(options.auditedCandidateId, priorEvidence, repository), /new blind retests/);
    assert.throws(() => authenticateP805ProductTree(options.candidateId, options.auditedCandidateId, repository), /Git objects/);
});

test("rejects missing anchors, relabelled campaign identity and wrong handoff digest", async () => {
    await assert.rejects(() => validateP805ReleaseHandoff({...options, freezeAnchorSha256:undefined}, dependencies), /trusted campaign anchors/);
    await assert.rejects(() => validateP805ReleaseHandoff({...options, auditedCandidateId:options.candidateId}, dependencies), /Expected values|anchored closeout/);
    await assert.rejects(() => readP805ReleaseArchive({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, p805ReleaseHandoff:options, p805ReleaseHandoffSha256:"0".repeat(64)}, dependencies), /handoff drifted/);
    await assert.rejects(() => readP805ReleaseArchive({candidateId:runtimeCandidate, candidatePackageSha256:options.candidatePackageSha256, p805ReleaseHandoff:options, p805ReleaseHandoffSha256:"0".repeat(64)}, dependencies), /candidate or digest/);
});

test("rejects coordinated closeout/receipt rewrite and canonical archive substitution", async () => {
    const target = path.join(options.campaignDirectory, "closeout.json");
    try {
        await writeFile(target, closeoutBytes.replace(options.auditedCandidateId, options.candidateId));
        await assert.rejects(() => validateP805ReleaseHandoff(options, dependencies), /anchored closeout/);
    } finally { await writeFile(target, closeoutBytes); }
    const receiptPath = JSON.parse(closeoutBytes).candidateExecutableReceipt.path;
    try {
        await writeFile(receiptPath, receiptBytes.replace("canonical", "rewritten") + " ");
        await assert.rejects(() => validateP805ReleaseHandoff(options, dependencies), /original executable receipt/);
    } finally { await writeFile(receiptPath, receiptBytes); }
    const other = path.join(directory, "wrong.tgz");
    await writeFile(other, "wrong archive");
    await assert.rejects(() => validateP805ReleaseHandoff({...options, archivePath:other}, dependencies), /archive digest drifted/);
});
