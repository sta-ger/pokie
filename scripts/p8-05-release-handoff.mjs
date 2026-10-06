/** Authenticate a reviewed tooling/evidence descendant without relabelling
 * the product which was actually exercised. No build, gate or write occurs. */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {archiveExecutableManifest} from "./p8-05-candidate-package-verifier.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = (value, length = 64) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const fail = (message) => { throw new Error(`P8-05 release handoff is invalid: ${message}`); };
// Everything else, including package metadata, lockfile, compiler/Vite config,
// generators, runtime sources and other steps' evidence, must be byte-identical.
const tooling = new Set([
    "scripts/p8-05-product-readiness-campaign.mjs", "scripts/p8-05-product-readiness-controller.mjs",
    "scripts/p8-05-release-completion.mjs", "scripts/p8-05-release-handoff.mjs",
    "scripts/pc-20-release-completion.mjs", "scripts/pc-20-authorized-release-runner.mjs",
    "tests/scripts/p8-05-product-readiness-campaign.test.mjs", "tests/scripts/p8-05-product-readiness-controller.test.mjs",
    "tests/scripts/p8-05-release-completion.test.mjs", "tests/scripts/p8-05-release-handoff.test.mjs",
    "tests/scripts/pc-20-release-completion.test.mjs", "tests/scripts/pc-20-authorized-release-runner.test.mjs",
    "tests/packaging/npmPackSmoke.test.ts",
]);
const evidence = (file) => file.startsWith("docs/evidence/p8-05-product-readiness/");
const excluded = (file) => tooling.has(file) || evidence(file);
function git(repository, args) {
    try { return execFileSync("git", args, {cwd:repository, encoding:"utf8", maxBuffer:16 * 1024 * 1024}).trimEnd(); }
    catch { fail(`cannot authenticate Git objects (${args[0]})`); }
}
function tree(repository, candidate) {
    return git(repository, ["ls-tree", "-rz", "--full-tree", candidate]).split("\0").filter(Boolean).map((record) => {
        const [identity, file] = record.split("\t");
        const [mode, type, object] = identity.split(" ");
        return {path:file, mode, type, object};
    });
}

export function authenticateP805ProductTree(auditedCandidateId, candidateId, repository = root) {
    if (!sha(auditedCandidateId, 40) || !sha(candidateId, 40)) fail("exact audited and reviewed commits are required");
    git(repository, ["merge-base", "--is-ancestor", auditedCandidateId, candidateId]);
    const source = tree(repository, auditedCandidateId), reviewed = tree(repository, candidateId);
    const protectedSource = source.filter((entry) => !excluded(entry.path)), protectedReviewed = reviewed.filter((entry) => !excluded(entry.path));
    if (JSON.stringify(protectedSource) !== JSON.stringify(protectedReviewed)) fail("reviewed candidate changes product or build inputs; new blind retests are required");
    // Do not allow an excluded tooling/evidence path to become a symlink or
    // submodule which could change inputs outside its own namespace.
    if ([...source, ...reviewed].some((entry) => excluded(entry.path) && (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)))) fail("handoff tooling/evidence contains nonregular Git entries");
    const changed = git(repository, ["diff", "--name-only", "-z", auditedCandidateId, candidateId]).split("\0").filter(Boolean);
    return {scheme:"git-identical-product-and-build-inputs-v1", productTreeSha256:digest(JSON.stringify(protectedSource)), auditedTreeId:git(repository, ["rev-parse", `${auditedCandidateId}^{tree}`]), reviewedTreeId:git(repository, ["rev-parse", `${candidateId}^{tree}`]), changedToolingAndEvidencePaths:changed};
}

export async function validateP805ReleaseHandoff(options, dependencies = {}) {
    const repository = dependencies.repositoryRoot ?? root;
    if (!options || !sha(options.candidatePackageSha256) || !sha(options.freezeAnchorSha256) || !sha(options.closeoutAnchorSha256)
        || !path.isAbsolute(options.campaignDirectory ?? "") || !path.isAbsolute(options.archivePath ?? "")) fail("handoff requires external campaign/archive paths and trusted campaign anchors");
    for (const target of [options.campaignDirectory, options.archivePath]) if (path.resolve(target) === repository || path.resolve(target).startsWith(`${repository}${path.sep}`)) fail("handoff evidence must be outside the candidate checkout");
    const equivalence = authenticateP805ProductTree(options.auditedCandidateId, options.candidateId, repository);
    // Lazy import keeps PC-20's shared ownership primitives independent of the
    // campaign/browser module initialization cycle.
    const validateCampaign = dependencies.validateCampaign ?? (await import("./p8-05-product-readiness-campaign.mjs")).validateP805ProductReadinessCampaign;
    const closeout = await validateCampaign(options.campaignDirectory, {candidateId:options.auditedCandidateId, candidatePackageSha256:options.candidatePackageSha256, freezeAnchorSha256:options.freezeAnchorSha256, closeoutAnchorSha256:options.closeoutAnchorSha256});
    const record = JSON.parse(await readFile(path.join(options.campaignDirectory, "closeout.json"), "utf8"));
    const {externalAnchor, ...payload} = record;
    if (digest(`${JSON.stringify(payload, null, 2)}\n`) !== closeout.closeoutSha256 || record.candidateId !== options.auditedCandidateId || record.candidatePackageSha256 !== options.candidatePackageSha256 || !sha(record.candidateExecutableSha256)
        || !path.isAbsolute(record.candidateExecutableReceipt?.path ?? "") || !sha(record.candidateExecutableReceipt?.sha256)) fail("anchored closeout omits its original executable receipt");
    for (const parent of [repository, options.campaignDirectory]) if (path.resolve(record.candidateExecutableReceipt.path).startsWith(`${path.resolve(parent)}${path.sep}`)) fail("original executable receipt must remain outside mutable campaign/checkout evidence");
    const receiptBytes = await readFile(record.candidateExecutableReceipt.path), receipt = JSON.parse(receiptBytes), authentication = receipt.authentication;
    const sourceEntries = tree(repository, options.auditedCandidateId).filter((entry) => ["package.json", "package-lock.json", "tsconfig.json", "generate-barrels.js"].includes(entry.path) || ["cli/", "src/", "scripts/"].some((prefix) => entry.path.startsWith(prefix))).map((entry) => ({path:entry.path, gitBlob:entry.object})).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const sourceManifestSha256 = digest(JSON.stringify({tree:equivalence.auditedTreeId, entries:sourceEntries}));
    if (digest(receiptBytes) !== record.candidateExecutableReceipt.sha256 || receipt.kind !== "p8-05-candidate-executable-receipt" || !receipt.issuer || !receipt.receiptId || receipt.candidateId !== options.auditedCandidateId || receipt.candidatePackageSha256 !== options.candidatePackageSha256
        || receipt.candidateExecutableSha256 !== record.candidateExecutableSha256 || receipt.candidateTreeManifestCandidateId !== options.auditedCandidateId || receipt.candidateTreeObjectId !== equivalence.auditedTreeId || receipt.candidateTreeManifestSha256 !== sourceManifestSha256
        || authentication?.scheme !== "verifier-owned-candidate-tree" || !authentication.verifierId || authentication.attestedCandidateId !== options.auditedCandidateId || authentication.attestedCandidateTreeManifestSha256 !== sourceManifestSha256 || authentication.attestedExecutableSha256 !== record.candidateExecutableSha256
        || receipt.verifiedBuild?.kind !== "p8-05-verified-candidate-build" || receipt.verifiedBuild.candidateId !== options.auditedCandidateId || authentication.attestedBuildSha256 !== digest(JSON.stringify(receipt.verifiedBuild))) fail("original executable receipt does not authenticate the audited Git tree and build");
    const archive = await readFile(options.archivePath);
    if (digest(archive) !== options.candidatePackageSha256) fail("canonical audited archive digest drifted");
    const projection = await archiveExecutableManifest(archive);
    if (projection.sha256 !== record.candidateExecutableSha256 || (projection.packageJson.gitHead !== undefined && projection.packageJson.gitHead !== options.auditedCandidateId)) fail("canonical archive executables differ from the authenticated audited build");
    const dist = projection.entries.filter((entry) => entry.path.startsWith("dist/"));
    const build = receipt.verifiedBuild;
    if (!(build.executableSha256 === projection.sha256 && build.executableFiles === projection.files)
        && !(build.executableSha256 === digest(JSON.stringify(dist)) && build.executableFiles === dist.length)) fail("verified build executable result differs from the canonical archive");
    const {gitHead, ...declaration} = projection.packageJson;
    if (JSON.stringify(declaration) !== JSON.stringify(JSON.parse(git(repository, ["show", `${options.candidateId}:package.json`])))) fail("archive declaration differs from the reviewed candidate");
    const binding = {schemaVersion:1, kind:"p8-05-reviewed-release-handoff", candidateId:options.candidateId, auditedCandidateId:options.auditedCandidateId, candidatePackageSha256:options.candidatePackageSha256, archivePath:options.archivePath, campaignId:closeout.campaignId, campaignManifestSha256:closeout.manifestSha256, campaignCloseoutSha256:closeout.closeoutSha256, freezeAnchorSha256:options.freezeAnchorSha256, closeoutAnchorSha256:options.closeoutAnchorSha256, candidateExecutableReceiptSha256:record.candidateExecutableReceipt.sha256, candidateExecutableSha256:projection.sha256, equivalence};
    return {closeout, binding, sha256:digest(JSON.stringify(binding)), archive};
}

/** Used by the real smoke boundary: it installs a snapshot of the original
 * canonical npm archive, then retains those same bytes for publication. */
export async function readP805ReleaseArchive(config, dependencies = {}) {
    if (!config?.p805ReleaseHandoff || !sha(config.p805ReleaseHandoffSha256) || config.p805ReleaseHandoff.candidateId !== config.candidateId || config.p805ReleaseHandoff.candidatePackageSha256 !== config.candidatePackageSha256) fail("PC-20 handoff candidate or digest is missing/drifted");
    const result = await validateP805ReleaseHandoff(config.p805ReleaseHandoff, dependencies);
    if (result.sha256 !== config.p805ReleaseHandoffSha256) fail("authenticated release handoff drifted");
    return result;
}
