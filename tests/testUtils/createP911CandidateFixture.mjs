/** Synthetic archive/install for handoff contracts, never acceptance evidence. */
import {execFileSync} from "node:child_process";
import {cp, mkdir, readFile, symlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {P911_CAMPAIGN, sha256} from "../../scripts/p9-11-candidate.mjs";
import {archiveExecutableManifest} from "../../scripts/p8-05-candidate-package-verifier.mjs";
const json = (file, value) => writeFile(file, `${JSON.stringify(value)}\n`);
// Independent of the reader's allowlist: include the entire reviewed gate
// delta, the prior driver repair, the reviewed interoperability correction and
// every file changed by this handoff repair.
export const P911_TOOLING_DESCENDANT_PATHS = [
    "scripts/p9-11-rendered-driver.mjs", "tests/scripts/p9-11-rendered-driver.test.mjs",
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
    // P10-03 retained-candidate delta: installed receipt plus bounded gate regression.
    "docs/math-contract-corrections/README.md",
    "docs/math-contract-corrections/p10-03-candidate-reader-targeted-verification.md",
    "docs/math-contract-corrections/p10-03-b6024422-installed-rerun.md",
    "docs/math-contract-corrections/p10-03-f9e64020-evidence-finalization.md",
    "docs/math-contract-corrections/p10-03-dd0ce39d-installed-rerun.md",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.validationWorkflow.test.tsx",
    "tests/cli/studio-client/src/integration/happyPath.test.tsx",
    "tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx",
    // Complete V2C-11 non-product correction delta, independently named from the reader.
    "tests/cli/studio/StudioArtifactBuildService.test.ts",
    "tests/v2/fixtures/PackageExtractionFixture.ts",
    "docs/v2-completion/V2C-11.md",
    // Complete V2C-26 gate correction, independently named from the reader.
    "tests/project/ArtifactBuilderRegistry.test.ts",
    "tests/v2/OptimizationPublicWorkflow.test.ts",
    "docs/v2-completion/V2C-26.md",
    "scripts/p9-11-candidate.mjs", "tests/testUtils/createP911CandidateFixture.mjs",
    "tests/scripts/p9-11-corrective-closeout.test.mjs", "tests/scripts/p9-11-produce-candidate.test.mjs",
    "docs/audit-corrections/README.md", "docs/audit-corrections/p9-11-closeout.md",
    // Complete V2C-31 test/evidence repair; production and build inputs stay protected.
    "docs/v2-completion/V2C-31.md",
    "tests/cli/BuildProductMatrix.crossSurface.contract.test.ts",
    "tests/cli/studio/replay/StudioReplayExecutionService.test.ts",
    "tests/packaging/helpers/selectPackedArchive.ts",
    "tests/packaging/npmPackSmoke.test.ts",
    "tests/v2/StableConsumerContracts.test.ts",
    "tests/v2/PackageBlueprintExtraction.test.ts",
    "tests/v2/WasmSharedMath.test.ts",
    "tests/fixtures/wasm/verifyDeliveredSharedMath.cjs",
    "tests/v2/fixtures/normal-pack.stdout.txt",
    "scripts/p8-05-release-handoff.mjs",
    // V2C-32 teardown correction, independently named from both candidate readers.
    "tests/v2/PublicDocsSite.test.ts",
    "tests/v2/helpers/PublicDocsBrowser.ts",
    // V2C-34 retained installed receipt, independently named from both readers.
    "docs/v2-completion/V2C-34.md",
    // V2C-34 bounded timeout regressions; sibling tests and product/build inputs stay protected.
    "tests/cli/studio/AdvancedModelValidationRoutes.test.ts",
    "tests/cli/studio/simulation/StudioSimulationService.test.ts",
    // Complete V2C-34 saved gate delta, independently named from the readers.
    "tests/cli/PC17CliStudioParity.integration.test.ts",
    "tests/cli/StudioFullWorkflow.integration.test.ts",
    "tests/cli/studio/StudioServerParWorkbook.integration.test.ts",
    // V2C-34 saved two-file gate correction; no product/build or sibling-test exemption.
    "tests/cli/commands/BuildCommand.test.ts",
    "tests/cli/studio/StudioServer.test.ts",
    // V2C-34 saved mechanics gate correction; only this named test is admitted.
    "tests/v2/ExistingMechanicsAuthoring.test.ts",
    // V2C-34 retained interoperability and Replay route gate correction only.
    "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts",
    "tests/cli/studio/StudioJobRoutes.integration.test.ts",
];
const commit = (repository, message) => {
    execFileSync("git", ["add", "."], {cwd:repository});
    execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", message], {cwd:repository});
    return execFileSync("git", ["rev-parse", "HEAD"], {cwd:repository, encoding:"utf8"}).trim();
};

/** Commit the complete non-product repair, leaving the retained delivery and
 * external controller driver untouched. These comments are not executable proof. */
export async function commitP911ToolingDescendant(fixture) {
    for (const file of P911_TOOLING_DESCENDANT_PATHS) await writeFile(path.join(fixture.repository, file), "// Repaired tooling fixture; never executed.\n");
    return commit(fixture.repository, "fixture complete tooling repair descendant");
}

export async function candidateFixture(directory, {packageName = "@fromstan/pokie", includeGitHead = false} = {}) {
    const repository = path.join(directory, "repository"), pack = path.join(directory, "pack"), installationRoot = path.join(directory, "installation");
    await mkdir(repository); await mkdir(path.join(pack, "package"), {recursive:true});
    const declaration = {name:packageName, private:true, version:"1.3.0", type:"module", exports:{".":{import:"./dist/esm/index.js", require:"./dist/cjs/index.cjs"}, ...Object.fromEntries([["browser", "dist/esm/browser.js"], ["wasm", "dist/esm/wasm.js"], ["client/player", "dist/cli/player.js"]].map(([subpath, file]) => [`./${subpath}`, packageName === "pokie" ? `./${file}` : {import:`./${file}`}]))}, bin:{pokie:"./dist/cli/pokie.js"}};
    await json(path.join(repository, "package.json"), declaration);
    for (const file of P911_TOOLING_DESCENDANT_PATHS) {
        await mkdir(path.dirname(path.join(repository, file)), {recursive:true});
        // These evidence documents are first recorded after the original candidate.
        if (file === "docs/math-contract-corrections/p10-03-b6024422-installed-rerun.md"
            || file === "docs/math-contract-corrections/p10-03-f9e64020-evidence-finalization.md"
            || file === "docs/math-contract-corrections/p10-03-dd0ce39d-installed-rerun.md") continue;
        await writeFile(path.join(repository, file), "// Original tooling fixture; never executed.\n");
    }
    execFileSync("git", ["init", "--quiet"], {cwd:repository});
    const candidateId = commit(repository, "test fixture");
    const candidateTreeId = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {cwd:repository, encoding:"utf8"}).trim();
    await json(path.join(pack, "package/package.json"), {...declaration, ...(includeGitHead ? {gitHead:candidateId} : {})});
    for (const file of ["dist/cjs/index.cjs", "dist/esm/index.js", "dist/esm/browser.js", "dist/esm/wasm.js", "dist/cli/player.js", "dist/cli/pokie.js", "dist/cli/studio-client/index.html"]) {
        await mkdir(path.dirname(path.join(pack, "package", file)), {recursive:true});
        await writeFile(path.join(pack, "package", file), `fixture:${file}`);
    }
    const archivePath = path.join(directory, "fixture.tgz");
    execFileSync("tar", ["-czf", archivePath, "-C", pack, "package"], {timeout:5000});
    const projection = await archiveExecutableManifest(await readFile(archivePath));
    await mkdir(path.join(installationRoot, "node_modules/.bin"), {recursive:true});
    await cp(path.join(pack, "package"), path.join(installationRoot, `node_modules/${packageName}`), {recursive:true});
    await symlink(`../${packageName}/dist/cli/pokie.js`, path.join(installationRoot, "node_modules/.bin/pokie"));
    const binding = {candidateId, candidateTreeId, archiveSha256:sha256(await readFile(archivePath)), executableSha256:projection.sha256, exitCode:0, resourcesDrained:true, issuer:"fixture-controller", receiptId:"fixture"};
    const buildPath = path.join(directory, "build.json"), installPath = path.join(directory, "install.json");
    const driverPath = path.join(directory, "fixture-driver.mjs");
    await writeFile(driverPath, "// Synthetic contract driver; never acceptance evidence.\n");
    await json(buildPath, {...binding, kind:"p9-11-normal-build-pack", buildCommand:"npm run build", packCommand:"npm pack --ignore-scripts", environment:{NODE_ENV:"production"}});
    await json(installPath, {...binding, kind:"p9-11-npm-install", command:"npm install <archive>", installationRoot});
    const handoff = {schemaVersion:1, kind:"p9-11-candidate-handoff", campaignId:P911_CAMPAIGN, ...binding, packageName, packageVersion:"1.3.0", archivePath, installationRoot,
        buildReceipt:{path:buildPath, sha256:sha256(await readFile(buildPath))}, installReceipt:{path:installPath, sha256:sha256(await readFile(installPath))},
        browserDriver:{path:driverPath, sha256:sha256(await readFile(driverPath))}};
    const handoffPath = path.join(directory, "handoff.json"); await json(handoffPath, handoff);
    return {reference:{path:handoffPath, sha256:sha256(await readFile(handoffPath))}, repository, handoff};
}
