import {loadPokieGame, PokieGamePackageValidator, STUDIO_OPERATION} from "@fromstan/pokie";
import {BlueprintProjectMaterializer} from "../../../cli/materialize/BlueprintProjectMaterializer.js";
import {createMaterializingRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {withLinkedLocalPokieRuntime} from "../../../cli/prepare/PackageCommandRunner.js";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../../v2/fixtures/PackageExtractionFixture.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url, {headers: {Connection: "close"}, signal: AbortSignal.timeout(PACKAGE_EXTRACTION_TEST_TIMEOUT)});
    return {status: response.status, body: await response.json()};
}

describe("Studio PAR workbook source dispatch", () => {
    let restoreTemporaryDirectory: () => void;
    let studioRoot: string;
    let workRoot: string;
    let server: StudioServer | undefined;
    let timings: Array<{phase: string; elapsedMs: number; outcome: string}>;
    async function timed<T>(phase: string, operation: () => Promise<T>): Promise<T> {
        const started = performance.now();
        let outcome = "completed";
        try {
            return await operation();
        } catch (error) {
            outcome = String(error);
            throw error;
        } finally {
            timings.push({phase, elapsedMs: Math.round(performance.now() - started), outcome});
        }
    }

    beforeAll(() => {
        // Both verification and dashboard loading acquire a real private snapshot.
        // This suite executes JS but never compiles a consumer: declarations/maps
        // only multiply copying and release work under the concurrent gate.
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment({runtimeFilesOnly: true});
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    afterAll(() => {
        restoreTemporaryDirectory?.();
    });

    beforeEach(() => {
        timings = [];
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-par-dispatch-assets-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "");
        workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-par-dispatch-work-"));
    });

    afterEach(async () => {
        try {
            await timed("server-stop", () => server?.stop() ?? Promise.resolve());
            // Check before removing the fixture root; deletion cannot prove a lease drained.
            expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-runtime-"))).toEqual([]);
        } finally {
            console.info(`PAR dispatch phases: ${JSON.stringify(timings)}`);
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("routes a real starter.par.xlsx through read-only Overview validation and Game Model projection", async () => {
        const workbookPath = path.join(workRoot, "starter.par.xlsx");
        fs.copyFileSync(path.join(process.cwd(), "examples", "parsheets", "starter.par.xlsx"), workbookPath);
        const workbookBytes = fs.readFileSync(workbookPath);
        const home = new StudioHomeService("1.3.0");
        const runtimeRoot = path.join(os.tmpdir(), "node_modules/@fromstan/pokie");
        const packageValidator = new PokieGamePackageValidator();
        const resolveRuntime = createMaterializingRuntimePackageResolver("1.3.0", STUDIO_OPERATION, runtimeRoot, {
            materializer: new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined,
                withLinkedLocalPokieRuntime(runtimeRoot), {
                    validate: root => timed("materialization-verify", () => packageValidator.validate(root)),
                }, path.join(workRoot, "runtime-cache")),
        });
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: home,
            resolveRuntimePackageRoot: (root, options) => timed("runtime-resolve", () => resolveRuntime(root, options)),
            loadGame: root => timed("dashboard-load", () => loadPokieGame(root)),
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workRoot, "jobs"))),
            initialContext: {mode: "project", projectRoot: workbookPath},
        });
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;

        // Initial project entry owns a real asynchronous PAR materialization.
        // Observe both snapshot acquisitions and their releases before stop() can
        // cancel them. Use the same bounded extraction budget as sibling callers,
        // rather than a route-only 30s budget for this nested runtime operation.
        const deadline = Date.now() + PACKAGE_EXTRACTION_TEST_TIMEOUT;
        const started = performance.now();
        let polls = 0;
        let dashboard;
        do {
            const response = await get(`${base}/api/project/context`);
            polls++;
            expect(response.status).toBe(200);
            dashboard = response.body as {status: string};
            if (dashboard.status !== "loading") break;
            await new Promise<void>(resolve => {
                setTimeout(resolve, 50);
            });
        } while (Date.now() < deadline);
        timings.push({phase: `dashboard-terminal (${polls} HTTP responses)`, elapsedMs: Math.round(performance.now() - started), outcome: dashboard.status});
        expect(dashboard).toMatchObject({status: "loaded", projectRoot: workbookPath});

        const inspection = await timed("inspect", () => get(`${base}/api/project/inspect`));
        const validation = await timed("validate", () => get(`${base}/api/project/validate`));
        const gameModel = await timed("game-model", () => get(`${base}/api/project/gameModel`));

        expect(inspection.status).toBe(200);
        expect(inspection.body).toMatchObject({packageRoot: workbookPath, valid: true});
        expect(JSON.stringify(inspection.body)).not.toContain("package.json");
        expect(validation.status).toBe(200);
        expect(validation.body).toMatchObject({
            packageRoot: workbookPath,
            valid: true,
            game: {id: expect.any(String), name: expect.any(String), version: expect.any(String)},
            information: [expect.objectContaining({code: "parsheet-provenance-present", severity: "info"})],
        });
        expect((validation.body as {warnings: Array<{code: string}>}).warnings).not.toContainEqual(expect.objectContaining({code: "parsheet-provenance-present"}));
        expect(JSON.stringify(validation.body)).not.toContain("package.json");
        expect(gameModel.status).toBe(200);
        expect(gameModel.body).toMatchObject({
            basics: {status: "available", data: {id: expect.any(String), name: expect.any(String), version: expect.any(String)}},
            layout: {status: "available", data: {reels: expect.any(Number), rows: expect.any(Number)}},
        });
        expect(fs.readFileSync(workbookPath)).toEqual(workbookBytes);
        // Read-only routes consume PAR directly, without preparing another runtime.
        for (const phase of ["runtime-resolve", "materialization-verify", "dashboard-load"]) {
            expect(timings.filter(timing => timing.phase === phase)).toHaveLength(1);
        }
    }, 2 * PACKAGE_EXTRACTION_TEST_TIMEOUT);
});
