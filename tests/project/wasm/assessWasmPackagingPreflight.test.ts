import fs from "fs";
import os from "os";
import path from "path";
import type {PokieProject} from "../../../src/project/PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../../src/project/ProjectCapabilities.js";
import type {ProjectType} from "../../../src/project/ProjectType.js";
import {assessWasmPackagingPreflight} from "../../../src/project/wasm/assessWasmPackagingPreflight.js";

function projectOf(type: ProjectType, rootPath: string): PokieProject {
    return {type, rootPath, capabilities: PROJECT_TYPE_CAPABILITIES[type], provenance: "test fixture"} as PokieProject;
}

describe("assessWasmPackagingPreflight", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-preflight-test-")));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("reports unsupported for a project type that isn't a tsPackage", () => {
        const result = assessWasmPackagingPreflight(projectOf("blueprint", workDir));

        expect(result.supported).toBe(false);
        if (!result.supported) {
            expect(result.diagnostic.missingCapability).toBe("runtime.execute");
        }
    });

    it("names every Node built-in module imported/required by a tsPackage project's own source", () => {
        fs.mkdirSync(path.join(workDir, "src"), {recursive: true});
        fs.writeFileSync(path.join(workDir, "src", "index.ts"), 'import fs from "fs";\nimport path from "node:path";\nconst x = require("child_process");\n');
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            const modules = result.report.blockingApiUsages.map((usage) => usage.module).sort();
            expect(modules).toEqual(["child_process", "fs", "path"]);
            expect(result.report.blockingApiUsages[0]?.filePath).toBe(path.join("src", "index.ts"));
        }
    });

    it("never flags a non-specifier string that merely shares a line with an import-related word", () => {
        fs.mkdirSync(path.join(workDir, "src"), {recursive: true});
        fs.writeFileSync(
            path.join(workDir, "src", "index.ts"),
            'import {loadPreset} from "./presets"; // comment mentions "fs" but does not import it\n' +
                'const cmd = require("child_process"); // not "fs"\n'
        );
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            const modules = result.report.blockingApiUsages.map((usage) => usage.module).sort();
            expect(modules).toEqual(["child_process"]);
        }
    });

    it("never flags a commented-out import", () => {
        fs.mkdirSync(path.join(workDir, "src"), {recursive: true});
        fs.writeFileSync(
            path.join(workDir, "src", "index.ts"),
            '// import fs from "fs";\n' + '/* const cmd = require("child_process"); */\n' + 'export const noop = () => undefined;\n'
        );
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.blockingApiUsages).toEqual([]);
        }
    });

    it("never flags import-like syntax that only exists inside a quoted string", () => {
        fs.mkdirSync(path.join(workDir, "src"), {recursive: true});
        fs.writeFileSync(path.join(workDir, "src", "index.ts"), "const snippet = \"import fs from 'fs';\";\n");
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.blockingApiUsages).toEqual([]);
        }
    });

    it("never flags an npm package whose name merely looks like a Node builtin", () => {
        fs.mkdirSync(path.join(workDir, "src"), {recursive: true});
        fs.writeFileSync(path.join(workDir, "src", "index.ts"), 'import fsExtra from "fs-extra";\n');
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {"fs-extra": "^1.0.0"}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.blockingApiUsages).toEqual([]);
        }
    });

    it("lists a tsPackage's own declared runtime dependencies, sorted", () => {
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game", dependencies: {zeta: "1.0.0", alpha: "1.0.0"}}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.declaredDependencies).toEqual(["alpha", "zeta"]);
        }
    });

    it("never claims arbitrary package-to-WASM compilation works -- notes always carry ArtifactBuilderRegistry's own wasm disclaimer", () => {
        fs.writeFileSync(path.join(workDir, "package.json"), JSON.stringify({name: "game"}));

        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.notes.join(" ")).toMatch(/no arbitrary package-to-WASM compiler/);
        }
    });

    it("reports no declared dependencies for a missing/unreadable package.json, without throwing", () => {
        const result = assessWasmPackagingPreflight(projectOf("tsPackage", workDir));

        expect(result.supported).toBe(true);
        if (result.supported) {
            expect(result.report.declaredDependencies).toEqual([]);
        }
    });
});
