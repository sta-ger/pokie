import fs from "fs";
import os from "os";
import path from "path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

import {
    ArtifactTargetType,
    BUILD_PRODUCT_MATRIX,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    ProjectTargetResolver,
    ProjectType,
} from "@fromstan/pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../v2/fixtures/PackageExtractionFixture.js";

type SupportedCell = {readonly source: ProjectType; readonly target: ArtifactTargetType};

const SUPPORTED_CELLS: readonly SupportedCell[] = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
    BUILD_PRODUCT_MATRIX_TARGETS.map((target) => BUILD_PRODUCT_MATRIX[source][target]).filter((cell) => cell.state === "supported"),
);

const BLUEPRINT = {
    manifest: {id: "pc17-parity", name: "PC-17 Parity", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["A", "B"]],
    availableBets: [1],
};

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

async function post(baseUrl: string, route: string, body: unknown): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(`${baseUrl}${route}`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json() as Record<string, unknown>};
}

async function waitForJob(baseUrl: string, id: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + PACKAGE_EXTRACTION_TEST_TIMEOUT - 10_000;
    while (Date.now() < deadline) {
        const response = await fetch(`${baseUrl}/api/project/artifacts/build/${id}`);
        expect(response.status).toBe(200);
        const job = await response.json() as Record<string, unknown>;
        // Cancellation is an asynchronous cleanup boundary: a poll immediately
        // after the cancel request truthfully observes `cancelling` until the
        // builder has removed its staging output and persisted `cancelled`.
        if (job.status !== "queued" && job.status !== "running" && job.status !== "cancelling") return job;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
    throw new Error(`Artifact build job ${id} did not finish.`);
}

async function buildCli(source: string, target: ArtifactTargetType, destination: string): Promise<void> {
    expect(await new BuildCommand("1.3.0").run([source, "--target", target, "--out", destination])).toBe(0);
}

async function createSource(workDir: string, source: ProjectType): Promise<string> {
    const sourceDir = path.join(workDir, source);
    fs.mkdirSync(sourceDir, {recursive: true});
    const blueprint = path.join(sourceDir, "source.blueprint.json");
    fs.writeFileSync(blueprint, JSON.stringify(BLUEPRINT));
    if (source === "blueprint") return blueprint;
    if (source === "tsPackage") {
        const result = path.join(sourceDir, "source-package");
        await buildCli(blueprint, "tsPackage", result);
        return result;
    }
    if (source === "outcomeLibrary") {
        const result = path.join(sourceDir, "source-outcomes");
        await buildCli(blueprint, "outcomeLibrary", result);
        return result;
    }
    if (source === "stakeAdapter") {
        const result = path.join(sourceDir, "source-stake");
        await buildCli(blueprint, "stakeAdapter", result);
        return result;
    }
    if (source === "parWorkbook") {
        const result = path.join(sourceDir, "source-par.xlsx");
        await buildCli(blueprint, "parWorkbook", result);
        return result;
    }
    throw new Error(`Unsupported PC-17 fixture source: ${source}`);
}

function extensionFor(target: ArtifactTargetType): string {
    if (target === "parWorkbook") return ".xlsx";
    if (target === "blueprint") return ".json";
    return target === "wasm" ? ".wasm" : "";
}

describe("PC-17 public CLI and Studio HTTP parity", () => {
    let restoreTemporaryDirectory: () => void;
    let studioRoot: string;
    let workDir: string;
    let servers: StudioServer[];
    let logSpy: jest.SpyInstance;

    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });

    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(() => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc17-studio-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc17-cli-studio-"));
        servers = [];
        writeStudioAssets(studioRoot);
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(async () => {
        await Promise.all(servers.map((server) => server.stop()));
        logSpy.mockRestore();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it.each(SUPPORTED_CELLS)("executes $source -> $target through public CLI and retained Studio HTTP", async ({source, target}) => {
        const sourcePath = await createSource(path.join(workDir, `${source}-${target}`), source);
        const extension = extensionFor(target);
        const cliOutput = path.join(workDir, `${source}-${target}-cli${extension}`);
        await buildCli(sourcePath, target, cliOutput);
        if (target !== "blueprint") {
            await expect(new ProjectTargetResolver().resolve(cliOutput)).resolves.toMatchObject({type: target, rootPath: cliOutput});
        }

        const homeService = new StudioHomeService("1.3.0");
        const server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, homeService,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, homeService),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workDir, "jobs", String(servers.length)))),
            initialContext: {mode: "project", projectRoot: sourcePath},
        });
        servers.push(server);
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;
        const studioOutput = path.join(workDir, `${source}-${target}-studio${extension}`);
        const preview = await post(baseUrl, "/api/project/artifacts/preview", {target, outDir: studioOutput});
        expect(preview.status).toBe(200);
        expect(preview.body).toMatchObject({status: "ok", target, sourceType: source});
        if (source === "tsPackage" && target === "blueprint") {
            const rejected = await post(baseUrl, "/api/project/artifacts/build", {target, outDir: studioOutput});
            expect(rejected).toMatchObject({status: 409, body: {error: expect.stringContaining("current preparedOperationId")}});
            expect(fs.existsSync(studioOutput)).toBe(false);
            expect(preview.body.preparedOperationId).toEqual(expect.any(String));
        }
        const build = await post(baseUrl, "/api/project/artifacts/build", {
            target, outDir: studioOutput, ...(preview.body.preparedOperationId === undefined ? {} : {preparedOperationId: preview.body.preparedOperationId}),
        });
        expect(build.status).toBe(202);
        const job = build.body.job as {id: string};
        const terminal = await waitForJob(baseUrl, job.id);
        expect(terminal).toMatchObject({status: "completed", result: {status: "ok", target, sourceType: source, outputPath: studioOutput}});
        expect(fs.existsSync(studioOutput)).toBe(true);
        await server.stop();
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("preserves authenticated handoffs across the complete saved five-file gate repair", () => {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {execFileSync} from "node:child_process";
            import {mkdir, readFile, writeFile} from "node:fs/promises";
            import path from "node:path";
            import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911Candidate, readP911SmokeCandidateFromEnvironment, sha256} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(workDir)});
            const correction = [
                "tests/cli/PC17CliStudioParity.integration.test.ts",
                "tests/cli/StudioFullWorkflow.integration.test.ts",
                "tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx",
                "tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx",
                "tests/cli/studio/StudioServerParWorkbook.integration.test.ts",
                "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs",
                "tests/testUtils/createP911CandidateFixture.mjs",
            ];
            for (const file of correction) assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing gate correction path: " + file);
            const reviewed = await commitP911ToolingDescendant(fixture);
            const selected = await readP911Candidate(fixture.reference, {repository: fixture.repository});
            assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
            const smoke = await readP911SmokeCandidateFromEnvironment({
                POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path,
                POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256,
            }, {repository: fixture.repository});
            assert.equal(smoke.archivePath, selected.archivePath);
            assert.equal(selected.packageRoot, path.join(fixture.handoff.installationRoot, "node_modules/@fromstan/pokie"));
            assert.equal(selected.archiveSha256, sha256(await readFile(fixture.handoff.archivePath)));
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8"}).trim();
            git(["reset", "--hard", fixture.handoff.candidateId]);
            for (const file of correction) await writeFile(path.join(fixture.repository, file), "// Bounded gate fixture repair.");
            const commit = () => {
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "fixture gate correction"]);
                return git(["rev-parse", "HEAD"]);
            };
            const repaired = commit();
            assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId, repaired, fixture.repository).changedToolingAndEvidencePaths, [...correction].sort());
            for (const file of ["cli/studio-client/src/wasm/BrowserWasmStudioApi.ts", "tsconfig.prod.json", "tests/cli/unnamed.test.ts"]) {
                await mkdir(path.dirname(path.join(fixture.repository, file)), {recursive: true});
                await writeFile(path.join(fixture.repository, file), "protected product/build/unnamed input");
                commit();
                assert.throws(() => authenticateP805ProductTree(fixture.handoff.candidateId, git(["rev-parse", "HEAD"]), fixture.repository), /product or build inputs/);
                await assert.rejects(readP911Candidate(fixture.reference, {repository: fixture.repository}), /product.*build inputs/);
                git(["reset", "--hard", repaired]);
            }
            git(["reset", "--hard", reviewed]);
            await assert.rejects(readP911Candidate({...fixture.reference, sha256: "b".repeat(64)}, {repository: fixture.repository}), /receipt digest mismatch/);
            await writeFile(fixture.handoff.browserDriver.path, "changed external driver");
            await assert.rejects(readP911Candidate(fixture.reference, {repository: fixture.repository}), /authenticated controller browser driver required/);
        `], {stdio: "pipe", timeout: 20_000});
    });

    it("keeps an HTTP conflict caller-owned and cancellation free of partial output", async () => {
        const blueprint = await createSource(workDir, "blueprint");
        const destination = path.join(workDir, "occupied-package");
        fs.mkdirSync(destination);
        fs.writeFileSync(path.join(destination, "preserve.txt"), "caller-owned");
        const homeService = new StudioHomeService("1.3.0");
        const conflictServer = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, homeService,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, homeService),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workDir, "jobs", String(servers.length)))),
            initialContext: {mode: "project", projectRoot: blueprint},
        });
        servers.push(conflictServer);
        const address = await conflictServer.start();
        const baseUrl = `http://${address.host}:${address.port}`;
        const conflict = await post(baseUrl, "/api/project/artifacts/preview", {target: "tsPackage", outDir: destination});
        expect(conflict).toMatchObject({status: 409, body: {status: "conflict", target: "tsPackage"}});
        expect(fs.readFileSync(path.join(destination, "preserve.txt"), "utf8")).toBe("caller-owned");

        await conflictServer.stop();
        const cancellableBlueprint = path.join(workDir, "cancellable.blueprint.json");
        fs.writeFileSync(cancellableBlueprint, JSON.stringify({
            ...BLUEPRINT,
            manifest: {id: "pc17-cancellable", name: "PC-17 Cancellable", version: "1.0.0"},
            reels: 3, symbols: ["A", "B", "C", "D", "E", "F", "G"], paytable: {A: {3: 1}},
            reelStrips: Array.from({length: 3}, () => ["A", "B", "C", "D", "E", "F", "G"]),
        }));
        const cancellationServer = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, homeService,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, homeService),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workDir, "jobs", String(servers.length)))),
            initialContext: {mode: "project", projectRoot: cancellableBlueprint},
        });
        servers.push(cancellationServer);
        const cancellationAddress = await cancellationServer.start();
        const cancellationBaseUrl = `http://${cancellationAddress.host}:${cancellationAddress.port}`;
        const cancellationOutput = path.join(workDir, "cancelled-outcomes");
        const started = await post(cancellationBaseUrl, "/api/project/artifacts/build", {target: "outcomeLibrary", outDir: cancellationOutput});
        expect(started.status).toBe(202);
        const job = started.body.job as {id: string};
        for (let attempt = 0; attempt < 1200; attempt += 1) {
            const response = await fetch(`${cancellationBaseUrl}/api/project/artifacts/build/${job.id}`);
            const current = await response.json() as {status: string; progress?: {message?: string}};
            if (current.progress?.message?.startsWith("Writing Outcome mode")) break;
            expect(["queued", "running"]).toContain(current.status);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 10);
            });
        }
        const cancelled = await post(cancellationBaseUrl, `/api/project/artifacts/build/${job.id}/cancel`, {});
        expect(cancelled.status).toBe(200);
        const terminal = await waitForJob(cancellationBaseUrl, job.id);
        expect(terminal).toMatchObject({status: "cancelled", result: {status: "cancelled"}});
        expect(fs.existsSync(cancellationOutput)).toBe(false);
    });
});
