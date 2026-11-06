import {STUDIO_OPERATION} from "@fromstan/pokie";
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
import {createPackageExtractionTestEnvironment} from "../../v2/fixtures/PackageExtractionFixture.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

describe("Studio PAR workbook source dispatch", () => {
    let restoreTemporaryDirectory: () => void;
    let studioRoot: string;
    let workRoot: string;
    let server: StudioServer | undefined;

    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });

    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(() => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-par-dispatch-assets-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "");
        workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-par-dispatch-work-"));
    });

    afterEach(async () => {
        await server?.stop();
        fs.rmSync(studioRoot, {recursive: true, force: true});
        fs.rmSync(workRoot, {recursive: true, force: true});
    });

    it("routes a real starter.par.xlsx through read-only Overview validation and Game Model projection", async () => {
        const workbookPath = path.join(workRoot, "starter.par.xlsx");
        fs.copyFileSync(path.join(process.cwd(), "examples", "parsheets", "starter.par.xlsx"), workbookPath);
        const home = new StudioHomeService("1.3.0");
        const runtimeRoot = path.join(os.tmpdir(), "node_modules/@fromstan/pokie");
        const resolveRuntimePackageRoot = createMaterializingRuntimePackageResolver("1.3.0", STUDIO_OPERATION, runtimeRoot, {
            materializer: new BlueprintProjectMaterializer("1.3.0", undefined, undefined, undefined,
                withLinkedLocalPokieRuntime(runtimeRoot), undefined, path.join(workRoot, "runtime-cache")),
        });
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: home,
            resolveRuntimePackageRoot,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workRoot, "jobs"))),
            initialContext: {mode: "project", projectRoot: workbookPath},
        });
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;

        // Initial project entry owns a real asynchronous PAR materialization.
        // Observe its terminal before stop() can cancel it during teardown.
        const deadline = Date.now() + 30_000;
        let dashboard;
        do {
            const response = await get(`${base}/api/project/context`);
            expect(response.status).toBe(200);
            dashboard = response.body as {status: string};
            if (dashboard.status !== "loading") break;
            await new Promise<void>(resolve => {
                setTimeout(resolve, 10);
            });
        } while (Date.now() < deadline);
        expect(dashboard).toMatchObject({status: "loaded", projectRoot: workbookPath});

        const inspection = await get(`${base}/api/project/inspect`);
        const validation = await get(`${base}/api/project/validate`);
        const gameModel = await get(`${base}/api/project/gameModel`);

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
    });
});
