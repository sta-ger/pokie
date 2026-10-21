import {ArtifactConversionPlanner} from "@fromstan/pokie";
import fs from "fs";
import {execFileSync} from "child_process";
import {pathToFileURL} from "url";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../../v2/fixtures/PackageExtractionFixture.js";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {InMemoryStudioReplayRepository} from "../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
import type {StudioReplayJobView} from "../../../cli/studio/replay/StudioReplayJobView.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

async function post(url: string, body: unknown): Promise<{status: number; body: unknown}> {
    const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
}

describe("Studio common job routes", () => {
    let directory: string;
    let server: StudioServer | undefined;
    let jobs: StudioJobService | undefined;
    let restoreTemporaryDirectory: () => void;

    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-common-job-routes-"));
    });
    afterEach(async () => {
        const activeServer = server;
        const activeJobs = jobs;
        server = undefined;
        jobs = undefined;
        for (const job of activeJobs?.list() ?? []) activeJobs?.cancelled(job.id, {summary: "Manual route fixture released by its test owner."});
        await activeServer?.stop();
        fs.rmSync(directory, {recursive: true, force: true});
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("retains candidate authentication across the complete V2C-34 interoperability gate correction", () => {
        // Synthetic reader fixtures only: no product build/install or acceptance collection.
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, symlink, unlink, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911Candidate, readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const options = {repository: fixture.repository};
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
            const commit = () => {
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "bounded gate fixture"]);
                return git(["rev-parse", "HEAD"]);
            };
            const original = await readP911Candidate(fixture.reference, options);
            const paths = ["tests/cli/commands/BuildCommand.test.ts", "tests/cli/studio/StudioServer.test.ts", "tests/v2/ExistingMechanicsAuthoring.test.ts",
                "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts", "tests/cli/studio/StudioJobRoutes.integration.test.ts",
                "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs", "tests/testUtils/createP911CandidateFixture.mjs"];
            for (const file of paths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction fixture: " + file);
                await writeFile(path.join(fixture.repository, file), "changed bounded gate tooling");
            }
            const reviewedId = commit();
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256,
                POKIE_PACK_SMOKE_CANDIDATE_ID: reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256};
            const direct = await readP911Candidate(fixture.reference, options);
            const selectors = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            for (const selector of selectors) {
                const selected = await selector(environment, options);
                assert.deepEqual(selected, direct);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...paths].sort());
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
                await assert.rejects(selector({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "0".repeat(64)}, options), /receipt digest mismatch/);
                await assert.rejects(async () => selector({...environment, POKIE_P805_RELEASE_HANDOFF: "conflict"}, options), /cannot be combined/);
            }
            validateP911SmokeCandidateIdentity(direct, environment, options);
            const legacy = () => authenticateP805ProductTree(original.candidateId, git(["rev-parse", "HEAD"]), fixture.repository);
            assert.deepEqual(legacy().changedToolingAndEvidencePaths, [...paths].sort());
            for (const file of ["tests/cli/studio/StudioJobRoutes.extra.integration.test.ts", "src/index.ts", "cli/pokie.ts", "package.json", "package-lock.json", "tsconfig.prod.json", "generate-barrels.js"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                commit();
                for (const selector of selectors) await assert.rejects(selector(environment, options), /product\\/build inputs changed/);
                assert.throws(legacy, /changes product or build inputs/);
                git(["reset", "--hard", reviewedId]);
            }
            const admitted = path.join(fixture.repository, "tests/cli/studio/StudioJobRoutes.integration.test.ts");
            await unlink(admitted);
            await symlink("nonregular-target", admitted);
            commit();
            for (const selector of selectors) await assert.rejects(selector(environment, options), /nonregular tooling/);
            assert.throws(legacy, /nonregular Git entries/);
            git(["reset", "--hard", reviewedId]);
            for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(direct.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const selector of selectors) await assert.rejects(selector(environment, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            assert.deepEqual(await readP911SmokeCandidateFromEnvironment(environment, options), direct);
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    });

    // Replay plus three valid artifact inspections each acquire and release a real runtime.
    it("inspects the exact downloaded unseeded replay and recovers after an invalid artifact", async () => {
        const projectRoot = path.join(__dirname, "..", "fixtures", "playable-game");
        const home = new StudioHomeService("1.3.0");
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
        server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
            homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot}, jobService: jobs,
            replayService: new StudioReplayExecutionService(new InMemoryStudioReplayRepository()),
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}/api/project/replays`;
        const started = await post(baseUrl, {round: 1});
        expect(started.status).toBe(202);
        const id = (started.body as {id: string}).id;
        let terminal: StudioReplayJobView;
        const deadline = performance.now() + PACKAGE_EXTRACTION_TEST_TIMEOUT;
        for (;;) {
            terminal = (await get(`${baseUrl}/${id}`)).body as StudioReplayJobView;
            if (["completed", "failed", "cancelled"].includes(terminal.status)) break;
            if (performance.now() > deadline) throw new Error(`Replay did not settle: ${JSON.stringify(terminal)}`);
            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });
        }
        expect(terminal.status).toBe("completed");
        const download = await get(`${baseUrl}/${id}/download`);
        expect(download.status).toBe(200);
        expect(download.body).toEqual(terminal.descriptor);
        expect(download.body).toMatchObject({round: 1, seed: null});
        const inspect = () => post(`${baseUrl}/inspect-artifact`, download.body);
        await expect(inspect()).resolves.toEqual({status: 200, body: {round: 1, artifactWarnings: []}});
        await expect(post(`${baseUrl}/inspect-artifact`, {round: 0, seed: null})).resolves.toEqual({
            status: 400, body: {error: '"round" must be a positive integer.'},
        });
        await expect(inspect()).resolves.toEqual({status: 200, body: {round: 1, artifactWarnings: []}});
        for (const seed of ["", "   ", 805, {}]) {
            await expect(post(`${baseUrl}/inspect-artifact`, {round: 1, seed})).resolves.toEqual({
                status: 400, body: {error: '"seed" must be a non-empty string when given.'},
            });
        }
        // Null belongs to the portable descriptor contract, not the run form.
        await expect(post(baseUrl, {round: 1, seed: null})).resolves.toEqual({
            status: 400, body: {error: '"seed" must be a non-empty string when given.'},
        });
        await expect(post(`${baseUrl}/inspect-artifact`, {round: 1, seed: null, outcomeSource: {modeName: "base"}})).resolves.toEqual({
            status: 400, body: {error: "Cannot exactly replay an outcome-library round without a seed. Restore the original session seed and retry."},
        });
    }, 4 * PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("keeps server shutdown pending until artifact staging cleanup settles", async () => {
        const repository = new FileStudioJobRepository(path.join(directory, "jobs"));
        jobs = new StudioJobService(repository, () => 100, () => "shutdown-artifact");
        const artifacts = new StudioArtifactBuildService("1.3.0");
        const staging = path.join(directory, "staging");
        let release!: () => void;
        const cleanup = new Promise<void>((resolve) => {
            release = resolve;
        });
        jest.spyOn(artifacts, "build").mockImplementation(async () => {
            fs.mkdirSync(staging);
            await cleanup;
            fs.rmSync(staging, {recursive: true});
            return {status: "cancelled", message: "Staging removed", plan: new ArtifactConversionPlanner().planType("blueprint", "tsPackage")};
        });
        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory, homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home), initialContext: {mode: "home"}, jobService: jobs, artifactBuildService: artifacts});
        await server.start();
        const started = artifacts.start(directory, "tsPackage");
        if (started.status !== "created") throw new Error("expected an artifact executor");
        await Promise.resolve();
        const stopping = server.stop();
        let stopped = false;
        stopping.then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        expect(fs.existsSync(staging)).toBe(true);
        expect(jobs.get(directory, started.job.id)?.status).toBe("cancelling");
        expect(repository.getProcessState()?.status).toBe("running");
        release();
        await stopping;
        expect(fs.existsSync(staging)).toBe(false);
        expect(jobs.get(directory, started.job.id)?.status).toBe("cancelled");
        expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
    });

    it("lists only the active project's durable common records", async () => {
        let nextId = 0;
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")), () => 100, () => `job-${++nextId}`);
        const started = jobs.start({projectId: "/project-a", operation: "certification-validate", request: {bundleDir: "bundle"}, conflictKey: "validation:/project-a/bundle"});
        if (started.status !== "created") throw new Error("expected a common Studio job");
        jobs.complete(started.job.id, {summary: "validated"});
        jobs.start({projectId: "/project-b", operation: "certification-validate", request: {bundleDir: "bundle"}, conflictKey: "validation:/project-b/bundle"});

        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: directory,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot: "/project-a"},
            jobService: jobs,
        });
        const address = await server.start();

        await expect(get(`http://${address.host}:${address.port}/api/project/jobs`)).resolves.toEqual({
            status: 200,
            body: {projectRoot: "/project-a", projectId: "/project-a", jobs: [expect.objectContaining({id: "job-1", projectId: "/project-a", status: "completed"})]},
        });
    });

    it("rejects common-job detail and cancellation across project identities", async () => {
        const projectA = path.join(directory, "project-a");
        const projectB = path.join(directory, "project-b");
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")), () => 100, () => "project-a-job");
        const started = jobs.start({projectId: projectA, operation: "certification-build", request: {bundleDir: "bundle"}, conflictKey: "certification:project-a"});
        if (started.status !== "created") throw new Error("expected a common Studio job");

        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
            homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot: projectB}, jobService: jobs,
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        await expect(get(`${baseUrl}/api/project/jobs/project-a-job`)).resolves.toEqual({status: 404, body: {error: "Studio job not found."}});
        await expect(post(`${baseUrl}/api/project/jobs/project-a-job/cancel`, {})).resolves.toEqual({status: 404, body: {error: "Studio job not found."}});
        expect(jobs.get(projectA, "project-a-job")).toEqual(expect.objectContaining({status: "queued"}));
    });

    it("keeps a Home Design job source-discoverable and names it before another project can open", async () => {
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")), () => 100, () => "design-job");
        const sourcePath = path.join(directory, "draft.json");
        const started = jobs.start({
            projectId: `design:${sourcePath}`,
            operation: "design-build",
            request: {sourcePath},
            conflictKey: `design-build:${sourcePath}`,
        });
        if (started.status !== "created") throw new Error("expected a Design job");

        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: directory,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            jobService: jobs,
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

        await expect(get(`${baseUrl}/api/home/jobs?sourcePath=${encodeURIComponent(sourcePath)}`)).resolves.toEqual({
            status: 200,
            body: {jobs: [expect.objectContaining({id: "design-job", operation: "design-build", projectId: `design:${sourcePath}`})]},
        });
        await expect(get(`${baseUrl}/api/home/jobs`)).resolves.toEqual({
            status: 200,
            body: {jobs: [expect.objectContaining({id: "design-job", operation: "design-build", projectId: `design:${sourcePath}`})]},
        });
        await expect(post(`${baseUrl}/api/home/projects/open`, {projectRoot: path.join(directory, "other-project")})).resolves.toEqual({
            status: 409,
            body: expect.objectContaining({code: "active-jobs-require-confirmation", operations: ["design-build"]}),
        });
    });
});
