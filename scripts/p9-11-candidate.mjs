/** Read-only P9 handoff. The controller builds, packs and installs once; this
 * reader never invokes npm, a compiler, a gate, or a publication workflow. */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstat, readFile, realpath, readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {archiveExecutableManifest} from "./p8-05-candidate-package-verifier.mjs";

export const P911_CAMPAIGN = "pokie-phase-9-audit-corrections";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value, length = 64) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const fail = (message) => { throw new Error(`P9-11 candidate: ${message}`); };
const tooling = new Set([
    "docs/audit-corrections/README.md", "docs/audit-corrections/p9-11-closeout.md",
    "scripts/p9-11-candidate.mjs", "scripts/p9-11-corrective-closeout.mjs", "scripts/p9-11-corrective-scenarios.mjs",
    "scripts/p9-11-produce-candidate.mjs", "tests/scripts/p9-11-produce-candidate.test.mjs",
    // Rendered collection tooling is separate from packed product bytes. The
    // external controller driver must still authenticate against its own pin.
    "scripts/p9-11-rendered-driver.mjs", "tests/scripts/p9-11-rendered-driver.test.mjs",
    "scripts/p8-05-candidate-package-verifier.mjs",
    // Reviewed gate corrections affect collection/regressions, not production
    // build inputs. Keep every exemption named; sibling tests remain protected.
    "scripts/p8-05-valera-browser-audit.mjs",
    "scripts/p8-04-studio-polish-browser-audit.mjs",
    "tests/cli/studio-client/src/P804StudioPolish.browser.test.tsx",
    "tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx",
    "tests/cli/studio-client/src/components/common/StudioPresentation.test.tsx",
    "tests/cli/studio-client/src/hooks/useHomeSourceJobs.test.tsx",
    "tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx",
    "tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx",
    "tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx",
    "tests/cli/studio-client/src/StudioReadinessConvergence.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.validationWorkflow.test.tsx",
    "tests/cli/studio-client/src/integration/happyPath.test.tsx",
    "tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx",
    "tests/testUtils/createP911CandidateFixture.mjs",
    "tests/scripts/p9-11-corrective-closeout.test.mjs", "tests/packaging/npmPackSmoke.test.ts", "tests/packaging/P805ValeraProgrammer.test.ts",
]);
const git = (repository, args) => execFileSync("git", args, {cwd:repository, encoding:"utf8", timeout:10_000, maxBuffer:16 * 1024 * 1024}).trimEnd();

export function authenticateP911Tree(candidateId, candidateTreeId, repository = root) {
    if (!sha(candidateId, 40) || !sha(candidateTreeId, 40)) fail("source commit/tree identity missing");
    if (git(repository, ["rev-parse", `${candidateId}^{tree}`]) !== candidateTreeId) fail("source tree mismatch");
    const reviewedId = git(repository, ["rev-parse", "HEAD"]);
    git(repository, ["merge-base", "--is-ancestor", candidateId, reviewedId]);
    const tree = (id) => git(repository, ["ls-tree", "-rz", "--full-tree", id]).split("\0").filter(Boolean);
    const source = tree(candidateId), reviewed = tree(reviewedId);
    const protect = (entries) => entries.filter((entry) => !tooling.has(entry.split("\t")[1]));
    if (JSON.stringify(protect(source)) !== JSON.stringify(protect(reviewed))) fail("product/build inputs changed; affected proofs must be rerun");
    if ([...source, ...reviewed].some((entry) => tooling.has(entry.split("\t")[1]) && !/^100(?:644|755) blob /.test(entry))) fail("nonregular tooling/evidence entry");
    if (git(repository, ["status", "--porcelain", "--untracked-files=normal"])) fail("candidate checkout is dirty");
    return {reviewedId, candidateId, candidateTreeId, changedEvidenceAndTooling:git(repository, ["diff", "--name-only", candidateId, reviewedId]).split("\n").filter(Boolean)};
}

export async function readPinnedJson(reference) {
    if (!path.isAbsolute(reference?.path ?? "") || !sha(reference?.sha256)) fail("absolute receipt path and externally pinned digest required");
    const bytes = await readFile(reference.path);
    if (sha256(bytes) !== reference.sha256) fail(`receipt digest mismatch: ${reference.path}`);
    return JSON.parse(bytes);
}

export async function authenticateP911Driver(reference) {
    if (!path.isAbsolute(reference?.path ?? "") || !sha(reference?.sha256)
        || !(await lstat(reference.path)).isFile() || sha256(await readFile(reference.path)) !== reference.sha256) fail("authenticated controller browser driver required");
}

/** Shared selector for both CommonJS packaging consumers. Empty legacy P8
 * context is normal in the release runner; real competing handoffs fail closed.
 * A partial P9 delivery must never fall back to rebuilding/reinstalling. */
export function readP911CandidateFromEnvironment(environment, options) {
    const file = environment.POKIE_P911_CANDIDATE_HANDOFF, pin = environment.POKIE_P911_CANDIDATE_HANDOFF_SHA256;
    if (!file && !pin) return Promise.resolve(undefined);
    if (environment.POKIE_P805_RELEASE_HANDOFF) fail("P9 and P8 candidate handoffs cannot be combined");
    return readP911Candidate({path:file, sha256:pin}, options);
}

export async function readP911Candidate(reference, {repository = root} = {}) {
    const handoff = await readPinnedJson(reference);
    if (handoff.schemaVersion !== 1 || handoff.kind !== "p9-11-candidate-handoff" || handoff.campaignId !== P911_CAMPAIGN
        || handoff.packageName !== "pokie" || !handoff.packageVersion || !sha(handoff.archiveSha256) || !sha(handoff.executableSha256)
        || !path.isAbsolute(handoff.archivePath ?? "") || !path.isAbsolute(handoff.installationRoot ?? "")) fail("incomplete controller handoff");
    const equivalence = authenticateP911Tree(handoff.candidateId, handoff.candidateTreeId, repository);
    await authenticateP911Driver(handoff.browserDriver);
    const build = await readPinnedJson(handoff.buildReceipt), install = await readPinnedJson(handoff.installReceipt);
    for (const receipt of [build, install]) {
        if (receipt.candidateId !== handoff.candidateId || receipt.candidateTreeId !== handoff.candidateTreeId
            || receipt.archiveSha256 !== handoff.archiveSha256 || receipt.executableSha256 !== handoff.executableSha256
            || receipt.exitCode !== 0 || receipt.resourcesDrained !== true || !receipt.issuer || !receipt.receiptId) fail("build/install receipt identity or terminal mismatch");
    }
    if (build.kind !== "p9-11-normal-build-pack" || build.environment?.NODE_ENV !== "production"
        || !((build.buildCommand === "npm run build" && build.packCommand === "npm pack --ignore-scripts")
            || (build.buildCommand === "prepack:npm run build" && build.packCommand === "npm pack"))) fail("normal production build/pack proof required");
    if (install.kind !== "p9-11-npm-install" || install.installationRoot !== handoff.installationRoot || install.command !== "npm install <archive>") fail("real shared npm installation proof required");
    const archive = await readFile(handoff.archivePath);
    if (sha256(archive) !== handoff.archiveSha256) fail("archive digest mismatch");
    const projection = await archiveExecutableManifest(archive);
    if (projection.sha256 !== handoff.executableSha256 || projection.packageJson.name !== "pokie" || projection.packageJson.version !== handoff.packageVersion
        || (projection.packageJson.gitHead !== undefined && projection.packageJson.gitHead !== handoff.candidateId)) fail("packed identity mismatch");
    const {gitHead, ...declaration} = projection.packageJson;
    if (JSON.stringify(declaration) !== JSON.stringify(JSON.parse(git(repository, ["show", `${handoff.candidateId}:package.json`])))) fail("package declaration differs from source");
    const packageRoot = await realpath(path.join(handoff.installationRoot, "node_modules/pokie"));
    if (packageRoot !== path.join(await realpath(handoff.installationRoot), "node_modules/pokie")) fail("installation resolves a borrowed/copied package tree");
    for (const entry of projection.entries) {
        const file = path.join(packageRoot, entry.path);
        if (!(await lstat(file)).isFile() || await realpath(file) !== file || sha256(await readFile(file)) !== entry.sha256) fail(`stale installed asset: ${entry.path}`);
    }
    const installedFiles = [];
    const collect = async (directory, prefix = "dist") => {
        for (const entry of await readdir(directory, {withFileTypes:true})) {
            const next = `${prefix}/${entry.name}`;
            if (entry.isDirectory()) await collect(path.join(directory, entry.name), next);
            else if (entry.isFile()) installedFiles.push(next);
            else fail(`nonregular installed asset: ${next}`);
        }
    };
    await collect(path.join(packageRoot, "dist"));
    if (JSON.stringify(installedFiles.sort()) !== JSON.stringify(projection.entries.filter((entry) => entry.path.startsWith("dist/")).map((entry) => entry.path))) fail("unexpected installed executable files");
    // Packaging consumers run inside Jest, which intercepts createRequire and
    // maps "pokie" to source. Resolve in a bounded native Node realm instead.
    const resolutions = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs", "-e", `
        const resolver = require('node:module').createRequire(process.argv[1]);
        process.stdout.write(JSON.stringify(Object.fromEntries(['pokie', 'pokie/browser', 'pokie/wasm', 'pokie/client/player'].map(name => [name, resolver.resolve(name)]))));
    `, path.join(handoff.installationRoot, "package.json")], {encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}));
    const esmResolutions = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
        import {fileURLToPath} from 'node:url';
        process.stdout.write(JSON.stringify(Object.fromEntries(['pokie', 'pokie/browser', 'pokie/wasm', 'pokie/client/player'].map(name => [name, fileURLToPath(import.meta.resolve(name))]))));
    `], {cwd:handoff.installationRoot, encoding:"utf8", timeout:10_000, stdio:["ignore", "pipe", "pipe"]}));
    const bin = await realpath(path.join(handoff.installationRoot, "node_modules/.bin/pokie"));
    for (const file of [...Object.values(resolutions), ...Object.values(esmResolutions)]) {
        if (!file.startsWith(`${packageRoot}${path.sep}`) || await realpath(file) !== file
            || !projection.entries.some((entry) => path.join(packageRoot, entry.path) === file)) fail("installed public resolution mismatch");
    }
    if (bin !== path.join(packageRoot, projection.packageJson.bin.pokie)) fail("installed public resolution mismatch");
    return {...handoff, packageRoot, bin, resolutions, esmResolutions, equivalence, projection, archive};
}
