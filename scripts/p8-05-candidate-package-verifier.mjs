#!/usr/bin/env node
/**
 * Produce a candidate-tree-bound executable receipt from a locally packed
 * archive.  This lives outside the campaign collector so the collector only
 * consumes a verifier result; it never authors provenance for itself.
 */
import {createHash} from "node:crypto";
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtemp, readFile, readdir, rm, symlink, writeFile} from "node:fs/promises";
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

export async function archiveExecutableManifest(archive) {
    const extraction = await mkdtemp(path.join(tmpdir(), "p8-05-candidate-verifier-"));
    try {
        // Validate and extract one immutable snapshot so the manifest cannot
        // describe different bytes from those authenticated and handed off.
        const snapshot = path.join(extraction, "archive.tgz");
        await writeFile(snapshot, Buffer.isBuffer(archive) ? archive : await readFile(archive), {flag:"wx"});
        const names = execFileSync("tar", ["-tzf", snapshot], {encoding:"utf8", maxBuffer:8 * 1024 * 1024}).trim().split("\n");
        const types = execFileSync("tar", ["-tvzf", snapshot], {encoding:"utf8", maxBuffer:8 * 1024 * 1024}).trim().split("\n");
        if (names.some((name) => !name.startsWith("package/") || name.split("/").includes("..") || path.isAbsolute(name)) || types.some((entry) => !["-", "d"].includes(entry[0])) || new Set(names).size !== names.length) fail("archive contains escaping, duplicate, or nonregular package entries");
        execFileSync("tar", ["-xzf", snapshot, "-C", extraction, "--no-same-owner"], {stdio:"pipe"});
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
        return {packageJson, entries, files:entries.length, sha256:digest(JSON.stringify(entries))};
    } finally { await rm(extraction, {recursive:true, force:true}); }
}

/** Build the immutable candidate tree in an empty directory. The checkout's
 * dist is never an input, and the archive remains the canonical npm output. */
async function verifyCandidateBuild(options, projection, repository) {
    // TypeScript applies dependency-package module/emit rules to paths under
    // node_modules, even for an explicit project. Build beside the source
    // checkout instead, and remove this temporary directory on every exit.
    const workspace = await mkdtemp(path.join(repository, ".p8-05-candidate-build-"));
    try {
        const source = execFileSync("git", ["archive", options.candidateId], {cwd:repository, maxBuffer:128 * 1024 * 1024});
        execFileSync("tar", ["-x", "-C", workspace], {input:source, stdio:["pipe", "pipe", "pipe"]});
        const declaration = JSON.parse(await readFile(path.join(workspace, "package.json"), "utf8"));
        const {gitHead, ...packedDeclaration} = projection.packageJson;
        if (gitHead !== undefined && gitHead !== options.candidateId || JSON.stringify(packedDeclaration) !== JSON.stringify(declaration)) fail("canonical archive package declaration differs from candidate");
        // Use the clone-installed dependencies only for the identical lockfile.
        if (digest(await readFile(path.join(repository, "package-lock.json"))) !== digest(await readFile(path.join(workspace, "package-lock.json")))) fail("candidate build dependency lock differs from installed checkout");
        await symlink(path.join(repository, "node_modules"), path.join(workspace, "node_modules"), "dir");
        if (typeof declaration.scripts?.build !== "string" || !declaration.scripts.build) fail("candidate has no canonical build script");
        // A verifier launched by Jest must still build the production package.
        // NODE_ENV=test enables development JSX with absolute checkout paths,
        // making otherwise identical candidates differ between workspaces.
        // Bind npm's package/lifecycle context as well as NODE_ENV. A shell
        // inheriting test:targeted's package paths can read the checkout instead
        // of the immutable candidate. Invoke only scripts.build as before;
        // prebuild's lint gate remains outside this executable verification.
        const lifecycle = {npm_lifecycle_event:"build", npm_lifecycle_script:declaration.scripts.build, npm_package_json:path.join(workspace, "package.json"), npm_package_name:declaration.name, npm_package_version:declaration.version};
        const buildOutput = execFileSync("/bin/sh", ["-c", declaration.scripts.build], {cwd:workspace, env:{...process.env, ...lifecycle, NODE_ENV:"production", INIT_CWD:workspace, PWD:workspace, PATH:`${path.join(workspace, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`}, encoding:"utf8", timeout:300_000, maxBuffer:8 * 1024 * 1024});
        const entries = [];
        const collect = async (directory, prefix) => {
            for (const entry of await readdir(directory, {withFileTypes:true})) {
                const file = `${prefix}/${entry.name}`, target = path.join(directory, entry.name);
                if (entry.isDirectory()) await collect(target, file);
                else if (entry.isFile()) entries.push({path:file, sha256:digest(await readFile(target))});
                else fail("candidate build contains a nonregular executable");
            }
        };
        await collect(path.join(workspace, "dist"), "dist");
        entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        const archived = projection.entries.filter((entry) => entry.path.startsWith("dist/"));
        if (JSON.stringify(entries) !== JSON.stringify(archived)) {
            const expected = new Map(entries.map((entry) => [entry.path, entry.sha256]));
            const actual = new Map(archived.map((entry) => [entry.path, entry.sha256]));
            const missing = entries.filter((entry) => !actual.has(entry.path)).map((entry) => entry.path);
            const unexpected = archived.filter((entry) => !expected.has(entry.path)).map((entry) => entry.path);
            const changed = entries.filter((entry) => actual.has(entry.path) && actual.get(entry.path) !== entry.sha256).map((entry) => entry.path);
            const summarize = (files) => ({count:files.length, paths:files.slice(0, 10)});
            fail(`archive executables differ from the verified candidate build; run the candidate's clean build before npm pack: ${JSON.stringify({missing:summarize(missing), unexpected:summarize(unexpected), changed:summarize(changed)})}`);
        }
        return {kind:"p8-05-verified-candidate-build", candidateId:options.candidateId, command:declaration.scripts.build, commandSource:"candidate package.json#scripts.build", environment:{NODE_ENV:"production"}, lifecycle:{event:lifecycle.npm_lifecycle_event, packageName:lifecycle.npm_package_name, packageVersion:lifecycle.npm_package_version}, executableFiles:entries.length, executableSha256:digest(JSON.stringify(entries)), outputSha256:digest(buildOutput)};
    } finally { await rm(workspace, {recursive:true, force:true}); }
}

function candidateTreeExecutableManifest(candidateId, root) {
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
    const repository = options.repositoryRoot ?? root;
    if (!commit(options.candidateId)) fail("invalid candidate commit");
    const archive = await readFile(options.sourceArchive), projection = await archiveExecutableManifest(archive), tree = candidateTreeExecutableManifest(options.candidateId, repository);
    const verifiedBuild = await verifyCandidateBuild(options, projection, repository);
    if (digest(await readFile(options.sourceArchive)) !== digest(archive)) fail("canonical archive changed during candidate build verification");
    // Hand off the exact authenticated buffer. Reopening the source after its
    // last digest check would let a replacement race acquire this receipt's
    // candidate identity while copying different archive bytes.
    if (options.candidateArchive && path.resolve(options.sourceArchive) !== path.resolve(options.candidateArchive)) await writeFile(options.candidateArchive, archive, {flag:"wx"});
    const verifierExecutable = await readFile(fileURLToPath(import.meta.url));
    const receipt = {kind:"p8-05-candidate-executable-receipt", receiptId:`local-candidate-${digest(archive).slice(0, 16)}`, issuer:"p8-05-candidate-package-verifier", candidateId:options.candidateId, candidatePackageSha256:digest(archive), candidateExecutableSha256:projection.sha256, candidateExecutableFiles:projection.files, candidateTreeManifestCandidateId:options.candidateId, candidateTreeManifestSha256:tree.sha256, candidateTreeObjectId:tree.tree, verifiedBuild, authentication:{scheme:"verifier-owned-candidate-tree", verifierId:"p8-05-candidate-package-verifier", verifierExecutableSha256:digest(verifierExecutable), attestedCandidateId:options.candidateId, attestedCandidateTreeManifestSha256:tree.sha256, attestedExecutableSha256:projection.sha256, attestedBuildSha256:digest(JSON.stringify(verifiedBuild))}};
    await writeFile(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyP805CandidatePackage(optionsFrom(process.argv)).then((receipt) => process.stdout.write(`P805_CANDIDATE_PACKAGE_VERIFIED ${JSON.stringify(receipt)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
