import fs from "fs";
import {execFileSync} from "child_process";
import os from "os";
import path from "path";
import {pathToFileURL} from "url";
import {ProjectTargetResolver, STUDIO_OPERATION} from "@fromstan/pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {BlueprintProjectMaterializer} from "../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../cli/materialize/materializeRuntimePackage.js";
import {withLinkedLocalPokieRuntime} from "../../cli/prepare/PackageCommandRunner.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../v2/fixtures/PackageExtractionFixture.js";

const POKIE_VERSION = "1.3.0";

it("retains authenticated candidate pins across the complete V2C-37 lifecycle gate correction", () => {
    const cache = path.resolve(__dirname, "../../node_modules/.cache/pokie-tmp");
    fs.mkdirSync(cache, {recursive: true});
    const directory = fs.mkdtempSync(path.join(cache, "pc18-candidate-"));
    try {
        // Synthetic archive/receipts exercise the actual shared readers, never
        // installed acceptance collection, build, pack or an official gate.
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const options = {repository: fixture.repository};
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
            const readers = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            const original = await readers[0](environment, options);
            const correctionPaths = ["scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs",
                "tests/cli/P906ValeraProgrammer.integration.test.ts", "tests/cli/PC18LifecycleParity.integration.test.ts",
                "tests/cli/commands/ReplayCommand.test.ts", "tests/cli/studio/StudioServer.test.ts",
                "tests/testUtils/createP911CandidateFixture.mjs"];
            for (const file of correctionPaths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction path: " + file);
                await writeFile(path.join(fixture.repository, file), "// Bounded lifecycle test correction.");
            }
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8"}).trim();
            git(["add", "."]);
            git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "bounded lifecycle test correction"]);
            const correctedId = git(["rev-parse", "HEAD"]);
            assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId, correctedId, fixture.repository).changedToolingAndEvidencePaths, correctionPaths);
            for (const reader of readers) {
                const selected = await reader({...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: correctedId,
                    POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256}, options);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, correctionPaths);
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            }
            const reviewedId = await commitP911ToolingDescendant(fixture);
            const selected = await readers[0](environment, options);
            assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
            for (const reference of [fixture.reference, fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(selected.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const reader of readers) await assert.rejects(reader(environment, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            await assert.rejects(readers[1]({...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: correctedId}, options), /smoke reviewed candidate identity mismatch/);
            await assert.rejects(readers[1]({...environment, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: "0".repeat(64)}, options), /smoke archive digest mismatch/);
            // The P8 reader has its own narrower historical evidence scope.
            // Check its protected inputs against this exact correction delta.
            git(["reset", "--hard", correctedId]);
            for (const file of ["tests/cli/PC18LifecycleParity.extra.test.ts", "src/index.ts", "package.json", "tsconfig.prod.json"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "protected input fixture"]);
                assert.throws(() => authenticateP805ProductTree(fixture.handoff.candidateId, git(["rev-parse", "HEAD"]), fixture.repository), /product or build inputs/);
                for (const reader of readers) await assert.rejects(reader(environment, options), /product\\/build inputs changed/);
                git(["reset", "--hard", correctedId]);
            }
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "");
    fs.writeFileSync(path.join(root, "style.css"), "");
}

async function request(baseUrl: string, route: string, body: unknown): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(`${baseUrl}${route}`, {method: "POST", headers: {"Content-Type": "application/json", Connection: "close"}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json() as Record<string, unknown>};
}

async function waitForBuild(baseUrl: string, id: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + PACKAGE_EXTRACTION_TEST_TIMEOUT;
    while (Date.now() < deadline) {
        const response = await fetch(`${baseUrl}/api/project/artifacts/build/${id}`, {headers: {Connection: "close"}});
        expect(response.status).toBe(200);
        const job = await response.json() as Record<string, unknown>;
        if (job.status !== "queued" && job.status !== "running" && job.status !== "cancelling") return job;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
    throw new Error("PC-18 Studio build did not finish.");
}

describe("PC-18 CLI/Studio lifecycle parity", () => {
    let restoreRuntimeEnvironment: () => void;
    beforeAll(() => {
        restoreRuntimeEnvironment = createPackageExtractionTestEnvironment();
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);
    afterAll(() => restoreRuntimeEnvironment());

    let workDir: string;
    let studioRoot: string;
    let server: StudioServer;
    let repository: FileStudioJobRepository;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-lifecycle-"));
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-studio-"));
        writeStudioAssets(studioRoot);
        // Parallel Jest suites must not reconcile or drain this server's jobs.
        repository = new FileStudioJobRepository(path.join(studioRoot, "jobs"));
    });

    afterEach(async () => {
        await server?.stop();
        expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
        fs.rmSync(workDir, {recursive: true, force: true});
        fs.rmSync(studioRoot, {recursive: true, force: true});
    });

    it("keeps equivalent published artifacts compatible and rejects a stale prepared Studio plan before publication", async () => {
        const blueprint = path.join(workDir, "source.blueprint.json");
        const cliPackage = path.join(workDir, "cli-package");
        const staleStudioStake = path.join(workDir, "stale-studio-stake");
        const studioPackage = path.join(workDir, "studio-package");
        fs.writeFileSync(blueprint, JSON.stringify({
            manifest: {id: "pc18-parity", name: "PC-18 Parity", version: "1.0.0"}, reels: 2, rows: 1,
            symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        expect(await new BuildCommand(POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, process.cwd()).run([
            blueprint, "--target", "tsPackage", "--out", cliPackage,
        ])).toBe(0);

        const home = new StudioHomeService(POKIE_VERSION);
        // Match the real CLI's local-install binding. An omitted installation
        // would run npm against the registry for this background Blueprint load.
        const runtimeRoot = path.join(os.tmpdir(), "node_modules/@fromstan/pokie");
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver(POKIE_VERSION, STUDIO_OPERATION, runtimeRoot, {
            materializer: new BlueprintProjectMaterializer(POKIE_VERSION, undefined, undefined, undefined,
                withLinkedLocalPokieRuntime(runtimeRoot), undefined, path.join(workDir, "runtime-cache")),
        });
        server = new StudioServer({
            pokieVersion: POKIE_VERSION, host: "127.0.0.1", port: 0, studioRoot, homeService: home,
            resolveRuntimePackageRoot,
            jobService: new StudioJobService(repository),
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, home), initialContext: {mode: "project", projectRoot: blueprint},
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        const dashboardDeadline = Date.now() + PACKAGE_EXTRACTION_TEST_TIMEOUT;
        let dashboard;
        do {
            const response = await fetch(`${baseUrl}/api/project/context`, {headers: {Connection: "close"}});
            expect(response.status).toBe(200);
            dashboard = await response.json() as {status: string};
            if (dashboard.status !== "loading") break;
            await new Promise<void>(resolve => {
                setTimeout(resolve, 10);
            });
        } while (Date.now() < dashboardDeadline);
        expect(dashboard).toMatchObject({status: "loaded", projectRoot: blueprint, game: {id: "pc18-parity"}});

        const stalePreview = await request(baseUrl, "/api/project/artifacts/preview", {target: "stakeAdapter", outDir: staleStudioStake});
        expect(stalePreview).toMatchObject({status: 200, body: {status: "ok", target: "stakeAdapter", preparedOperationId: expect.any(String)}});
        const revised = JSON.parse(fs.readFileSync(blueprint, "utf8")) as {manifest: {version: string}};
        revised.manifest.version = "1.0.1";
        fs.writeFileSync(blueprint, JSON.stringify(revised));
        const staleBuild = await request(baseUrl, "/api/project/artifacts/build", {
            target: "stakeAdapter", outDir: staleStudioStake, preparedOperationId: stalePreview.body.preparedOperationId,
        });
        expect(staleBuild).toMatchObject({status: 202, body: {job: {id: expect.any(String)}}});
        expect(await waitForBuild(baseUrl, (staleBuild.body.job as {id: string}).id)).toMatchObject({
            status: "failed", result: {status: "error", message: expect.stringMatching(/source configuration|prepared conversion graph/i)},
        });
        expect(fs.existsSync(staleStudioStake)).toBe(false);
        revised.manifest.version = "1.0.0";
        fs.writeFileSync(blueprint, JSON.stringify(revised));

        const build = await request(baseUrl, "/api/project/artifacts/build", {target: "tsPackage", outDir: studioPackage});
        expect(build).toMatchObject({status: 202, body: {job: {id: expect.any(String)}}});
        expect(await waitForBuild(baseUrl, (build.body.job as {id: string}).id)).toMatchObject({
            status: "completed", result: {status: "ok", target: "tsPackage", outputPath: studioPackage},
        });
        const resolver = new ProjectTargetResolver();
        await expect(resolver.resolve(cliPackage)).resolves.toMatchObject({type: "tsPackage"});
        await expect(resolver.resolve(studioPackage)).resolves.toMatchObject({type: "tsPackage"});
        expect(repository.list()).toEqual(expect.arrayContaining([
            expect.objectContaining({operation: "artifact-build", status: "failed"}),
            expect.objectContaining({operation: "artifact-build", status: "completed"}),
        ]));
        expect(repository.list()).toHaveLength(2);
    }, 3 * PACKAGE_EXTRACTION_TEST_TIMEOUT);
});
