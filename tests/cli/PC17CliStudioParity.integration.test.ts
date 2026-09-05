import fs from "fs";
import os from "os";
import path from "path";

import {
    ArtifactTargetType,
    BUILD_PRODUCT_MATRIX,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    ProjectTargetResolver,
    ProjectType,
} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";

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
    for (let attempt = 0; attempt < 1200; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/project/artifacts/build/${id}`);
        expect(response.status).toBe(200);
        const job = await response.json() as Record<string, unknown>;
        if (job.status !== "queued" && job.status !== "running") return job;
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
    return target === "blueprint" ? ".json" : "";
}

describe("PC-17 public CLI and Studio HTTP parity", () => {
    let studioRoot: string;
    let workDir: string;
    let servers: StudioServer[];
    let logSpy: jest.SpyInstance;

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
            initialContext: {mode: "project", projectRoot: sourcePath},
        });
        servers.push(server);
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;
        const studioOutput = path.join(workDir, `${source}-${target}-studio${extension}`);
        const preview = await post(baseUrl, "/api/project/artifacts/preview", {target, outDir: studioOutput});
        expect(preview.status).toBe(200);
        expect(preview.body).toMatchObject({status: "ok", target, sourceType: source});
        const build = await post(baseUrl, "/api/project/artifacts/build", {
            target, outDir: studioOutput, ...(target === "stakeAdapter" ? {preparedOperationId: preview.body.preparedOperationId} : {}),
        });
        expect(build.status).toBe(202);
        const job = build.body.job as {id: string};
        const terminal = await waitForJob(baseUrl, job.id);
        expect(terminal).toMatchObject({status: "completed", result: {status: "ok", target, sourceType: source, outputPath: studioOutput}});
        expect(fs.existsSync(studioOutput)).toBe(true);
        await server.stop();
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
