import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

const blueprint = {
    manifest: {id: "destination-workflow", name: "Destination Workflow", version: "1.0.0"},
    reels: 3, rows: 1, symbols: ["A", "B"],
    reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]], paytable: {A: {3: 2}},
};

describe("Studio destination HTTP workflow", () => {
    let workspace: string;
    let directory: string;
    let originalCwd: string;
    let server: StudioServer;
    let origin: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-destination-workflow-"));
        directory = path.join(workspace, "working");
        fs.mkdirSync(directory);
        process.chdir(directory);
        const studioRoot = path.join(directory, "studio");
        fs.mkdirSync(studioRoot);
        const registration = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry());
        const home = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository(), undefined, undefined, undefined, (location) => registration.describeLocation(location));
        server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService: home, blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            projectRegistrationService: registration,
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs"))),
        });
        const address = await server.start();
        origin = `http://${address.host}:${address.port}`;
    });

    afterEach(async () => {
        await server.stop();
        process.chdir(originalCwd);
        fs.rmSync(workspace, {recursive: true, force: true});
    });

    async function post(route: string, body: unknown) {
        const response = await fetch(`${origin}${route}`, {method: "POST", headers: {"Content-Type": "application/json", Origin: origin}, body: JSON.stringify(body)});
        return {status: response.status, body: await response.json() as Record<string, unknown>};
    }

    it("refuses an occupied destination unchanged, publishes changed empty output, and refuses a preview-to-build occupancy race", async () => {
        const occupied = path.join(directory, "occupied");
        fs.mkdirSync(occupied);
        const sentinel = path.join(occupied, "sentinel.bin");
        const bytes = Buffer.from([0, 255, 37, 10]);
        fs.writeFileSync(sentinel, bytes);
        expect((await post("/api/home/blueprints/build-preview", {blueprint, outDir: occupied})).body).toMatchObject({status: "ok", destinationState: "occupied", destinationHasContent: true, createFiles: []});
        expect((await post("/api/home/blueprints/build", {blueprint, outDir: occupied})).body).toMatchObject({status: "error", error: expect.stringContaining("choose a different --out path")});
        expect(fs.readFileSync(sentinel)).toEqual(bytes);
        expect(fs.readdirSync(occupied)).toEqual(["sentinel.bin"]);

        const empty = path.join(directory, "empty");
        fs.mkdirSync(empty);
        expect((await post("/api/home/blueprints/build-preview", {blueprint, outDir: "empty"})).body).toMatchObject({projectRoot: empty, destinationState: "empty", destinationHasContent: false});
        expect(await post("/api/home/blueprints/build", {blueprint, outDir: "empty"})).toMatchObject({status: 201, body: {status: "ok", projectRoot: empty}});
        const artifactBytes = fs.readFileSync(path.join(empty, "dist/index.js"));
        expect((await post("/api/home/blueprints/build", {blueprint, outDir: "empty"})).body.status).toBe("error");
        expect(fs.readFileSync(path.join(empty, "dist/index.js"))).toEqual(artifactBytes);
        expect(fs.readFileSync(sentinel)).toEqual(bytes);

        const raced = path.join(directory, "raced");
        expect((await post("/api/home/blueprints/build-preview", {blueprint, outDir: raced})).body).toMatchObject({destinationState: "missing", destinationHasContent: false});
        fs.mkdirSync(raced);
        fs.writeFileSync(path.join(raced, "sentinel.bin"), bytes);
        expect((await post("/api/home/blueprints/build", {blueprint, outDir: raced})).body.status).toBe("error");
        expect(fs.readdirSync(raced)).toEqual(["sentinel.bin"]);
        expect(fs.readFileSync(path.join(raced, "sentinel.bin"))).toEqual(bytes);
        expect((await post("/api/home/blueprints/build", {blueprint, outDir: "recovered"})).body).toMatchObject({status: "ok", projectRoot: path.join(directory, "recovered")});
    });

    it.each(["../escape", "nested/slot", "nested\\slot", ".", "..", "/absolute-slot"])("rejects omitted-output path-shaped ID %s over HTTP without publication and allows explicit recovery", async (id) => {
        const manifestId = id.startsWith("/") ? path.join(workspace, "absolute-slot") : id;
        const draft = {...blueprint, manifest: {...blueprint.manifest, id: manifestId}};
        const entries = fs.readdirSync(directory).sort();
        const sentinel = path.join(directory, "sentinel.bin");
        const bytes = Buffer.from([0, 255, 37, 10]);
        fs.writeFileSync(sentinel, bytes);
        expect((await post("/api/home/blueprints/build-preview", {blueprint: draft})).body).toMatchObject({
            status: "ok", destinationState: "unsafe", destinationHasContent: true,
            destinationError: expect.stringMatching(/not a valid directory name.*plain name.*--out/), createFiles: [],
        });
        expect((await post("/api/home/blueprints/build", {blueprint: draft})).body).toMatchObject({
            status: "error", error: expect.stringMatching(/not a valid directory name.*plain name.*--out/),
        });
        expect(fs.readdirSync(workspace)).toEqual(["working"]);
        expect(fs.readdirSync(directory).sort()).toEqual([...entries, "sentinel.bin"].sort());
        expect(fs.readFileSync(sentinel)).toEqual(bytes);
        for (const output of ["chosen-new", "chosen-empty"]) {
            if (output === "chosen-empty") fs.mkdirSync(path.join(directory, output));
            expect((await post("/api/home/blueprints/build-preview", {blueprint: draft, outDir: output})).body).toMatchObject({destinationHasContent: false});
            expect(await post("/api/home/blueprints/build", {blueprint: draft, outDir: output})).toMatchObject({status: 201, body: {status: "ok", projectRoot: path.join(directory, output)}});
            expect(fs.existsSync(path.join(directory, output, "dist/index.js"))).toBe(true);
        }
        expect(fs.readFileSync(sentinel)).toEqual(bytes);
    });

    it("uses the manifest-id default in HTTP preview and build, including a repeat with blank output omitted", async () => {
        const destination = path.join(directory, blueprint.manifest.id);
        expect((await post("/api/home/blueprints/build-preview", {blueprint})).body).toMatchObject({projectRoot: destination, destinationState: "missing"});
        expect((await post("/api/home/blueprints/build", {blueprint})).body).toMatchObject({status: "ok", projectRoot: destination});
        const contents = fs.readFileSync(path.join(destination, "package.json"));
        expect((await post("/api/home/blueprints/build-preview", {blueprint})).body).toMatchObject({projectRoot: destination, destinationState: "occupied"});
        expect((await post("/api/home/blueprints/build", {blueprint})).body.status).toBe("error");
        expect(fs.readFileSync(path.join(destination, "package.json"))).toEqual(contents);
    });

    it("refuses file targets, legacy PAR overwrite, and WASM sidecar/companion conflicts", async () => {
        const source = path.join(directory, "blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        const workbook = path.join(directory, "existing.xlsx");
        fs.writeFileSync(workbook, "");
        expect(await post("/api/home/blueprints/par-export", {blueprint, path: workbook, sourcePath: source, overwrite: true})).toMatchObject({status: 409, body: {status: "conflict"}});
        expect(fs.readFileSync(workbook)).toEqual(Buffer.alloc(0));
        const freshWorkbook = path.join(directory, "fresh.xlsx");
        expect((await post("/api/home/blueprints/par-export", {blueprint, path: freshWorkbook, sourcePath: source, overwrite: false})).body.status).toBe("ok");
        const artifacts = new StudioArtifactBuildService("1.3.0");
        for (const [destination, conflictPath] of [
            [path.join(directory, "file.wasm"), path.join(directory, "file.wasm")],
            [path.join(directory, "sidecar.wasm"), path.join(directory, "sidecar.wasm.pokie-wasm.json")],
        ]) {
            fs.writeFileSync(conflictPath, "");
            expect(await artifacts.preview(source, "wasm", destination)).toMatchObject({status: "conflict"});
            expect(await artifacts.build(source, "wasm", destination)).toMatchObject({status: "conflict"});
            expect(fs.readFileSync(conflictPath)).toEqual(Buffer.alloc(0));
        }
        const destination = path.join(directory, "companion.wasm");
        fs.mkdirSync(`${destination}.pokie`);
        fs.writeFileSync(path.join(`${destination}.pokie`, "sentinel"), "keep");
        expect(await artifacts.preview(freshWorkbook, "wasm", destination)).toMatchObject({status: "conflict"});
        expect(await artifacts.build(freshWorkbook, "wasm", destination)).toMatchObject({status: "conflict"});
        expect(fs.readFileSync(path.join(`${destination}.pokie`, "sentinel"), "utf8")).toBe("keep");
        expect(fs.existsSync(destination)).toBe(false);
    });
});
