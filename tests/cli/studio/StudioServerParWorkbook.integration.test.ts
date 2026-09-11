import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

describe("Studio PAR workbook source dispatch", () => {
    let studioRoot: string;
    let workRoot: string;
    let server: StudioServer | undefined;

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
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            initialContext: {mode: "project", projectRoot: workbookPath},
        });
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;

        const inspection = await get(`${base}/api/project/inspect`);
        const validation = await get(`${base}/api/project/validate`);
        const gameModel = await get(`${base}/api/project/gameModel`);

        expect(inspection.status).toBe(200);
        expect(inspection.body).toMatchObject({packageRoot: workbookPath, valid: true});
        expect(JSON.stringify(inspection.body)).not.toContain("package.json");
        expect(validation.status).toBe(200);
        expect(validation.body).toMatchObject({packageRoot: workbookPath, valid: true, game: {id: expect.any(String), name: expect.any(String), version: expect.any(String)}});
        expect(JSON.stringify(validation.body)).not.toContain("package.json");
        expect(gameModel.status).toBe(200);
        expect(gameModel.body).toMatchObject({
            basics: {status: "available", data: {id: expect.any(String), name: expect.any(String), version: expect.any(String)}},
            layout: {status: "available", data: {reels: expect.any(Number), rows: expect.any(Number)}},
        });
    });
});
