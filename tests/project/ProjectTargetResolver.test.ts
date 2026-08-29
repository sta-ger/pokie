import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {ProjectTargetAmbiguousError} from "../../src/project/ProjectTargetAmbiguousError.js";
import {ProjectTargetMalformedError} from "../../src/project/ProjectTargetMalformedError.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import type {ProjectTargetTypeAdapter} from "../../src/project/ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "../../src/project/ProjectTargetUnsupportedError.js";
import {POKIE_WASM_CONTRACT_VERSION} from "../../src/project/wasm/PokieWasmComponentManifest.js";

const SAMPLE_BLUEPRINT = {
    manifest: {id: "sample", name: "Sample", version: "1.0.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "B", "C"],
    paytable: {A: {3: 5}},
};

const SAMPLE_OUTCOME_LIBRARY_MANIFEST = {
    schemaVersion: 1,
    generatedBy: "pokie outcomelibrary build",
    pokieVersion: "1.3.0",
    generatedAt: new Date(0).toISOString(),
    game: {id: "sample", name: "Sample", version: "1.0.0"},
    artifactPokieVersion: "1.3.0",
    modes: [],
    files: ["manifest.json"],
};

const SAMPLE_STAKE_ENGINE_MANIFEST = {
    generatedBy: "pokie stakeengine export",
    generatedAt: new Date(0).toISOString(),
};

const SAMPLE_WASM_COMPONENT_MANIFEST = {
    schemaVersion: POKIE_WASM_CONTRACT_VERSION,
    component: {id: "sample-component", version: "0.1.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []},
    capabilities: [],
};

async function writeSampleParWorkbook(filePath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Manifest");
    workbook.addWorksheet("Symbols");
    workbook.addWorksheet("Paytable");
    await workbook.xlsx.writeFile(filePath);
}

describe("ProjectTargetResolver", () => {
    const resolver = new ProjectTargetResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-project-target-resolver-test-")));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("resolves a directory with a \"pokie.entry\" package.json as a tsPackage project", async () => {
        const projectRoot = path.join(workDir, "game");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(
            path.join(projectRoot, "package.json"),
            JSON.stringify({name: "game", pokie: {entry: "./src/generated/index.js"}}),
        );

        const project = await resolver.resolve(projectRoot);

        expect(project).toEqual({
            type: "tsPackage",
            rootPath: projectRoot,
            capabilities: ["runtime.execute", "outcomeLibrary.generate", "stakeAdapter.export"],
            provenance: expect.stringContaining("pokie.entry"),
        });
    });

    it("resolves a recognized Stake Engine export directory as a stakeAdapter project", async () => {
        const stakeDir = path.join(workDir, "stake-export");
        fs.mkdirSync(stakeDir, {recursive: true});
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify(SAMPLE_STAKE_ENGINE_MANIFEST));

        const project = await resolver.resolve(stakeDir);

        expect(project).toEqual({
            type: "stakeAdapter",
            rootPath: stakeDir,
            capabilities: ["stakeAdapter.exchange", "stakeAdapter.export", "outcomeSource.read"],
            provenance: expect.stringContaining("pokie-manifest.json"),
        });
    });

    it("resolves a recognized outcome-library bundle directory as an outcomeLibrary project", async () => {
        const bundleDir = path.join(workDir, "outcome-bundle");
        fs.mkdirSync(bundleDir, {recursive: true});
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), JSON.stringify(SAMPLE_OUTCOME_LIBRARY_MANIFEST));

        const project = await resolver.resolve(bundleDir);

        expect(project).toEqual({
            type: "outcomeLibrary",
            rootPath: bundleDir,
            capabilities: ["outcomeLibrary.read", "outcomeLibrary.generate", "outcomeSource.read", "outcomeSource.sample", "stakeAdapter.export"],
            provenance: expect.stringContaining("manifest.json"),
        });
    });

    it("returns undefined for a directory with an ordinary package.json that never mentions \"pokie\"", async () => {
        const projectRoot = path.join(workDir, "ordinary-package");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({name: "ordinary", version: "1.0.0"}));

        expect(await resolver.resolve(projectRoot)).toBeUndefined();
    });

    it("throws ProjectTargetMalformedError for a directory whose package.json isn't valid JSON", async () => {
        const projectRoot = path.join(workDir, "broken-package-json");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "package.json"), "{not valid json");

        await expect(resolver.resolve(projectRoot)).rejects.toThrow(ProjectTargetMalformedError);
    });

    it("throws ProjectTargetMalformedError for a directory whose package.json declares \"pokie\" but is missing \"pokie.entry\"", async () => {
        const projectRoot = path.join(workDir, "incomplete-pokie-package");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({name: "game", pokie: {}}));

        await expect(resolver.resolve(projectRoot)).rejects.toThrow(ProjectTargetMalformedError);
        await expect(resolver.resolve(projectRoot)).rejects.toThrow(/pokie\.entry/);
    });

    it("returns undefined for a directory with a manifest.json that never mentions \"schemaVersion\"", async () => {
        const bundleDir = path.join(workDir, "unrelated-manifest");
        fs.mkdirSync(bundleDir, {recursive: true});
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), JSON.stringify({manifestVersion: 3, name: "some-extension"}));

        expect(await resolver.resolve(bundleDir)).toBeUndefined();
    });

    it("throws ProjectTargetMalformedError for an outcome-library bundle directory whose manifest.json isn't valid JSON", async () => {
        const bundleDir = path.join(workDir, "broken-outcome-manifest");
        fs.mkdirSync(bundleDir, {recursive: true});
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), "{not valid json");

        await expect(resolver.resolve(bundleDir)).rejects.toThrow(ProjectTargetMalformedError);
    });

    it("throws ProjectTargetMalformedError for an outcome-library bundle directory whose manifest.json declares \"schemaVersion\" but the wrong shape", async () => {
        const bundleDir = path.join(workDir, "invalid-shape-outcome-manifest");
        fs.mkdirSync(bundleDir, {recursive: true});
        fs.writeFileSync(
            path.join(bundleDir, "manifest.json"),
            JSON.stringify({...SAMPLE_OUTCOME_LIBRARY_MANIFEST, modes: "not-an-array"}),
        );

        await expect(resolver.resolve(bundleDir)).rejects.toThrow(ProjectTargetMalformedError);
    });

    it("resolves a blueprint-shaped .json file as a blueprint project", async () => {
        const blueprintFile = path.join(workDir, "sample.blueprint.json");
        fs.writeFileSync(blueprintFile, JSON.stringify(SAMPLE_BLUEPRINT));

        const project = await resolver.resolve(blueprintFile);

        expect(project).toEqual({
            type: "blueprint",
            rootPath: blueprintFile,
            capabilities: ["blueprint.build", "outcomeLibrary.generate", "stakeAdapter.export"],
            provenance: expect.stringContaining("manifest"),
        });
    });

    it("resolves a .xlsx file with the required PAR sheets as a parWorkbook project", async () => {
        const workbookFile = path.join(workDir, "sheet.xlsx");
        await writeSampleParWorkbook(workbookFile);

        const project = await resolver.resolve(workbookFile);

        expect(project).toEqual({
            type: "parWorkbook",
            rootPath: workbookFile,
            capabilities: ["parWorkbook.exchange"],
            provenance: expect.stringContaining("Manifest"),
        });
        expect(project?.configurationProvenance).toEqual({configurationHash: expect.stringMatching(/^sha256:/)});
    });

    it("returns undefined for a .json file that isn't blueprint-shaped", async () => {
        const plainJsonFile = path.join(workDir, "not-a-blueprint.json");
        fs.writeFileSync(plainJsonFile, JSON.stringify({hello: "world"}));

        expect(await resolver.resolve(plainJsonFile)).toBeUndefined();
    });

    it("identifies a corrupt .xlsx as a failed PAR workbook recognition", async () => {
        const workbookFile = path.join(workDir, "fake.xlsx");
        fs.writeFileSync(workbookFile, "not a real workbook, extension only");

        await expect(resolver.resolve(workbookFile)).rejects.toMatchObject({
            name: "ProjectTargetMalformedError",
            targetType: "parWorkbook",
            stage: "PAR workbook recognition",
        });
        await expect(resolver.resolve(workbookFile)).rejects.toThrow(/could not read/);
    });

    it("identifies a readable .xlsx with PAR sheets missing from its required set as incomplete", async () => {
        const workbookFile = path.join(workDir, "incomplete.xlsx");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Manifest");
        await workbook.xlsx.writeFile(workbookFile);

        await expect(resolver.resolve(workbookFile)).rejects.toMatchObject({
            name: "ProjectTargetMalformedError",
            targetType: "parWorkbook",
            stage: "PAR workbook recognition",
        });
        await expect(resolver.resolve(workbookFile)).rejects.toThrow(/missing required sheets: "Symbols", "Paytable"/);
    });

    it("keeps an unrelated readable spreadsheet outside PAR recognition", async () => {
        const workbookFile = path.join(workDir, "budget.xlsx");
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet("Budget");
        await workbook.xlsx.writeFile(workbookFile);

        expect(await resolver.resolve(workbookFile)).toBeUndefined();
    });

    it("rejects an ordinary .wasm file with no PokieWasmComponentManifest sidecar as unsupported", async () => {
        const wasmFile = path.join(workDir, "game.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");

        await expect(resolver.resolve(wasmFile)).rejects.toThrow(ProjectTargetUnsupportedError);
        await expect(resolver.resolve(wasmFile)).rejects.toThrow(/no compatible PokieWasmComponentManifest sidecar/);
    });

    it("resolves a .wasm file with a compatible PokieWasmComponentManifest sidecar as a wasm project, read-only", async () => {
        const wasmFile = path.join(workDir, "game.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify(SAMPLE_WASM_COMPONENT_MANIFEST));

        const project = await resolver.resolve(wasmFile);

        expect(project).toEqual({
            type: "wasm",
            rootPath: wasmFile,
            capabilities: ["wasm.manifest.read"],
            provenance: expect.stringContaining("sample-component"),
        });
    });

    it("throws ProjectTargetMalformedError for a .wasm file whose manifest sidecar isn't valid JSON", async () => {
        const wasmFile = path.join(workDir, "broken.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, "{not valid json");

        await expect(resolver.resolve(wasmFile)).rejects.toThrow(ProjectTargetMalformedError);
    });

    it("throws ProjectTargetMalformedError for a .wasm file whose manifest sidecar fails shape validation", async () => {
        const wasmFile = path.join(workDir, "malshaped.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify({...SAMPLE_WASM_COMPONENT_MANIFEST, host: undefined}));

        await expect(resolver.resolve(wasmFile)).rejects.toThrow(ProjectTargetMalformedError);
        await expect(resolver.resolve(wasmFile)).rejects.toThrow(/does not satisfy PokieWasmComponentManifest's own shape/);
    });

    it("throws ProjectTargetUnsupportedError for a well-shaped but schemaVersion-incompatible manifest sidecar", async () => {
        const wasmFile = path.join(workDir, "incompatible.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");
        fs.writeFileSync(`${wasmFile}.pokie-wasm.json`, JSON.stringify({...SAMPLE_WASM_COMPONENT_MANIFEST, schemaVersion: "2.0.0"}));

        await expect(resolver.resolve(wasmFile)).rejects.toThrow(ProjectTargetUnsupportedError);
        await expect(resolver.resolve(wasmFile)).rejects.toThrow(/not compatible with this POKIE build/);
    });

    it("returns undefined for a file with an unrecognized extension that isn't a WASM target", async () => {
        const unknownFile = path.join(workDir, "notes.txt");
        fs.writeFileSync(unknownFile, "just some text");

        expect(await resolver.resolve(unknownFile)).toBeUndefined();
    });

    it("returns undefined for a plain directory that matches none of the known project shapes", async () => {
        const plainDir = path.join(workDir, "plain");
        fs.mkdirSync(plainDir, {recursive: true});

        expect(await resolver.resolve(plainDir)).toBeUndefined();
    });

    it("returns undefined for a path that doesn't exist", async () => {
        expect(await resolver.resolve(path.join(workDir, "does-not-exist"))).toBeUndefined();
    });

    it("resolves a relative path", async () => {
        const projectRoot = path.join(workDir, "game");
        fs.mkdirSync(projectRoot, {recursive: true});
        fs.writeFileSync(
            path.join(projectRoot, "package.json"),
            JSON.stringify({name: "game", pokie: {entry: "./src/generated/index.js"}}),
        );

        const project = await resolver.resolve(path.relative(process.cwd(), projectRoot));

        expect(project?.rootPath).toBe(projectRoot);
        expect(project?.type).toBe("tsPackage");
    });

    it("throws ProjectTargetAmbiguousError when more than one adapter recognizes the same target", async () => {
        const fakeAdapterA: ProjectTargetTypeAdapter = {
            type: "tsPackage",
            targetKind: "directory",
            recognize: () => Promise.resolve("fake match A"),
        };
        const fakeAdapterB: ProjectTargetTypeAdapter = {
            type: "stakeAdapter",
            targetKind: "directory",
            recognize: () => Promise.resolve("fake match B"),
        };
        const ambiguousResolver = new ProjectTargetResolver([fakeAdapterA, fakeAdapterB]);
        const ambiguousDir = path.join(workDir, "ambiguous");
        fs.mkdirSync(ambiguousDir, {recursive: true});

        await expect(ambiguousResolver.resolve(ambiguousDir)).rejects.toThrow(ProjectTargetAmbiguousError);
    });

    it("throws at construction time when given more than one adapter for the same project type", () => {
        const duplicateA: ProjectTargetTypeAdapter = {
            type: "blueprint",
            targetKind: "file",
            recognize: () => Promise.resolve(undefined),
        };
        const duplicateB: ProjectTargetTypeAdapter = {
            type: "blueprint",
            targetKind: "file",
            recognize: () => Promise.resolve(undefined),
        };

        expect(() => new ProjectTargetResolver([duplicateA, duplicateB])).toThrow(/more than one adapter/);
    });
});
