#!/usr/bin/env node
/**
 * Produce a candidate-tree-bound executable receipt from a locally packed
 * archive.  This lives outside the campaign collector so the collector only
 * consumes a verifier result; it never authors provenance for itself.
 */
import {createHash} from "node:crypto";
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(`P8-05 candidate package verifier is invalid: ${message}`); };
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);

function optionsFrom(argv) {
    const values = {};
    for (let index = 2; index < argv.length; index += 2) {
        if (!argv[index]?.startsWith("--") || values[argv[index]] || argv[index + 1] === undefined) fail("usage: --source-archive <absolute-tgz> --candidate-archive <absolute-tgz> --candidate <sha> --receipt <absolute-json>");
        values[argv[index]] = argv[index + 1];
    }
    const options = {sourceArchive:values["--source-archive"], candidateArchive:values["--candidate-archive"], candidateId:values["--candidate"], receipt:values["--receipt"]};
    if (!path.isAbsolute(options.sourceArchive ?? "") || !path.isAbsolute(options.candidateArchive ?? "") || !path.isAbsolute(options.receipt ?? "") || !commit(options.candidateId)) fail("usage: --source-archive <absolute-tgz> --candidate-archive <absolute-tgz> --candidate <sha> --receipt <absolute-json>");
    return options;
}

async function archiveExecutableManifest(archive) {
    const extraction = await mkdtemp(path.join(tmpdir(), "p8-05-candidate-verifier-"));
    try {
        execFileSync("tar", ["-xzf", archive, "-C", extraction], {stdio:"pipe"});
        const packageRoot = path.join(extraction, "package"), packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")), files = [];
        const collect = async (directory, relative = "") => {
            for (const entry of await readdir(directory, {withFileTypes:true})) {
                const next = path.join(relative, entry.name), target = path.join(directory, entry.name);
                if (entry.isDirectory()) await collect(target, next);
                else if (entry.isFile() && (next === "package.json" || next.startsWith(`dist${path.sep}`))) files.push(next.replaceAll(path.sep, "/"));
            }
        };
        await collect(packageRoot);
        if (!files.includes("package.json") || !files.some((file) => file.startsWith("dist/"))) fail("archive contains no executable package projection");
        const entries = [];
        for (const file of files.sort()) entries.push({path:file, sha256:digest(await readFile(path.join(packageRoot, file)))});
        return {packageJson, files:entries.length, sha256:digest(JSON.stringify(entries))};
    } finally { await rm(extraction, {recursive:true, force:true}); }
}

/** npm --ignore-scripts intentionally omits npm's gitHead decoration.  Add
 * that metadata from the declared candidate before calculating the archive
 * projection, so the installed package can prove the same immutable commit. */
async function bindArchiveToCandidate(sourceArchive, candidateArchive, candidateId) {
    const extraction = await mkdtemp(path.join(tmpdir(), "p8-05-candidate-bind-"));
    try {
        execFileSync("tar", ["-xzf", sourceArchive, "-C", extraction], {stdio:"pipe"});
        const packageRoot = path.join(extraction, "package"), packagePath = path.join(packageRoot, "package.json"), packageJson = JSON.parse(await readFile(packagePath, "utf8"));
        const source = spawnSync("git", ["show", `${candidateId}:package.json`], {cwd:root, encoding:"utf8"});
        if (source.status !== 0) fail("candidate package declaration cannot be read");
        const candidatePackage = JSON.parse(source.stdout);
        if (packageJson.name !== candidatePackage.name || packageJson.version !== candidatePackage.version || (packageJson.gitHead && packageJson.gitHead !== candidateId)) fail("packed source archive is not the declared candidate package");
        await writeFile(packagePath, `${JSON.stringify({...packageJson, gitHead:candidateId}, null, 2)}\n`);
        execFileSync("tar", ["-czf", candidateArchive, "-C", extraction, "package"], {stdio:"pipe"});
    } finally { await rm(extraction, {recursive:true, force:true}); }
}

function candidateTreeExecutableManifest(candidateId) {
    const listing = spawnSync("git", ["ls-tree", "-r", "--name-only", candidateId, "--", "package.json", "package-lock.json", "tsconfig.json", "cli", "src", "scripts", "generate-barrels.js"], {cwd:root, encoding:"utf8"});
    if (listing.status !== 0) fail("candidate tree cannot be read");
    const files = listing.stdout.split("\n").filter(Boolean).filter((file) => file === "package.json" || file === "package-lock.json" || file === "tsconfig.json" || file === "generate-barrels.js" || file.startsWith("cli/") || file.startsWith("src/") || file.startsWith("scripts/"));
    if (!files.includes("package.json")) fail("candidate tree has no package declaration");
    const entries = files.sort().map((file) => {
        const object = spawnSync("git", ["rev-parse", `${candidateId}:${file}`], {cwd:root, encoding:"utf8"}).stdout.trim();
        if (!/^[a-f0-9]{40}$/i.test(object)) fail(`candidate executable cannot resolve ${file}`);
        return {path:file, gitBlob:object};
    });
    const tree = spawnSync("git", ["rev-parse", `${candidateId}^{tree}`], {cwd:root, encoding:"utf8"}).stdout.trim();
    if (!commit(tree)) fail("candidate tree object cannot be resolved");
    return {candidateId, tree, sha256:digest(JSON.stringify({tree, entries}))};
}

export async function verifyP805CandidatePackage(options) {
    await bindArchiveToCandidate(options.sourceArchive, options.candidateArchive, options.candidateId);
    const archive = await readFile(options.candidateArchive), projection = await archiveExecutableManifest(options.candidateArchive), tree = candidateTreeExecutableManifest(options.candidateId);
    if (projection.packageJson?.gitHead !== options.candidateId) fail("archive package gitHead does not match candidate");
    const verifierExecutable = await readFile(fileURLToPath(import.meta.url));
    const receipt = {kind:"p8-05-candidate-executable-receipt", receiptId:`local-candidate-${digest(archive).slice(0, 16)}`, issuer:"p8-05-candidate-package-verifier", candidateId:options.candidateId, candidatePackageSha256:digest(archive), candidateExecutableSha256:projection.sha256, candidateExecutableFiles:projection.files, candidateTreeManifestCandidateId:options.candidateId, candidateTreeManifestSha256:tree.sha256, candidateTreeObjectId:tree.tree, authentication:{scheme:"verifier-owned-candidate-tree", verifierId:"p8-05-candidate-package-verifier", verifierExecutableSha256:digest(verifierExecutable), attestedCandidateId:options.candidateId, attestedCandidateTreeManifestSha256:tree.sha256, attestedExecutableSha256:projection.sha256}};
    await writeFile(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyP805CandidatePackage(optionsFrom(process.argv)).then((receipt) => process.stdout.write(`P805_CANDIDATE_PACKAGE_VERIFIED ${JSON.stringify(receipt)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
