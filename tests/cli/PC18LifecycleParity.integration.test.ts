import fs from "fs";
import os from "os";
import path from "path";
import {ProjectTargetResolver} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";

const POKIE_VERSION = "1.3.0";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "");
    fs.writeFileSync(path.join(root, "style.css"), "");
}

async function request(baseUrl: string, route: string, body: unknown): Promise<{status: number; body: Record<string, unknown>}> {
    const response = await fetch(`${baseUrl}${route}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json() as Record<string, unknown>};
}

async function waitForBuild(baseUrl: string, id: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 600; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/project/artifacts/build/${id}`);
        const job = await response.json() as Record<string, unknown>;
        if (job.status !== "queued" && job.status !== "running") return job;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
    throw new Error("PC-18 Studio build did not finish.");
}

describe("PC-18 CLI/Studio lifecycle parity", () => {
    let workDir: string;
    let studioRoot: string;
    let server: StudioServer;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-lifecycle-"));
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-studio-"));
        writeStudioAssets(studioRoot);
    });

    afterEach(async () => {
        await server?.stop();
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
        server = new StudioServer({
            pokieVersion: POKIE_VERSION, host: "127.0.0.1", port: 0, studioRoot, homeService: home,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, home), initialContext: {mode: "project", projectRoot: blueprint},
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;

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
    });
});
