import fs from "fs";
import os from "os";
import path from "path";
import {PokieProjectResolver} from "../../src/project/PokieProjectResolver.js";

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

describe("PokieProjectResolver", () => {
    const resolver = new PokieProjectResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-project-resolver-test-")));
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

        expect(project).toEqual({type: "tsPackage", rootPath: projectRoot, capabilities: ["runtime.execute"]});
    });

    it("resolves a recognized Stake Engine export directory as a stakeAdapter project", async () => {
        const stakeDir = path.join(workDir, "stake-export");
        fs.mkdirSync(stakeDir, {recursive: true});
        fs.writeFileSync(path.join(stakeDir, "pokie-manifest.json"), JSON.stringify(SAMPLE_STAKE_ENGINE_MANIFEST));

        const project = await resolver.resolve(stakeDir);

        expect(project).toEqual({type: "stakeAdapter", rootPath: stakeDir, capabilities: ["stakeAdapter.exchange"]});
    });

    it("resolves a recognized outcome-library bundle directory as an outcomeLibrary project", async () => {
        const bundleDir = path.join(workDir, "outcome-bundle");
        fs.mkdirSync(bundleDir, {recursive: true});
        fs.writeFileSync(path.join(bundleDir, "manifest.json"), JSON.stringify(SAMPLE_OUTCOME_LIBRARY_MANIFEST));

        const project = await resolver.resolve(bundleDir);

        expect(project).toEqual({type: "outcomeLibrary", rootPath: bundleDir, capabilities: ["outcomeLibrary.read"]});
    });

    it("resolves a blueprint-shaped .json file as a blueprint project", async () => {
        const blueprintFile = path.join(workDir, "sample.blueprint.json");
        fs.writeFileSync(blueprintFile, JSON.stringify(SAMPLE_BLUEPRINT));

        const project = await resolver.resolve(blueprintFile);

        expect(project).toEqual({type: "blueprint", rootPath: blueprintFile, capabilities: ["blueprint.build"]});
    });

    it("resolves a .xlsx file as a parWorkbook project", async () => {
        const workbookFile = path.join(workDir, "sheet.xlsx");
        fs.writeFileSync(workbookFile, "not a real workbook, extension only");

        const project = await resolver.resolve(workbookFile);

        expect(project).toEqual({type: "parWorkbook", rootPath: workbookFile, capabilities: ["parWorkbook.exchange"]});
    });

    it("resolves a .wasm file as a wasm project with no capabilities", async () => {
        const wasmFile = path.join(workDir, "game.wasm");
        fs.writeFileSync(wasmFile, "not real wasm bytes, extension only");

        const project = await resolver.resolve(wasmFile);

        expect(project).toEqual({type: "wasm", rootPath: wasmFile, capabilities: []});
    });

    it("returns undefined for a .json file that isn't blueprint-shaped", async () => {
        const plainJsonFile = path.join(workDir, "not-a-blueprint.json");
        fs.writeFileSync(plainJsonFile, JSON.stringify({hello: "world"}));

        expect(await resolver.resolve(plainJsonFile)).toBeUndefined();
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

        expect(project).toEqual({type: "tsPackage", rootPath: projectRoot, capabilities: ["runtime.execute"]});
    });
});
