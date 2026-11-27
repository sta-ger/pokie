import fs from "fs";
import os from "os";
import path from "path";
import {renderEntryModule} from "../../cli/scaffold/renderEntryModule.js";
import {GamePackageMerger} from "../../cli/scaffold/GamePackageMerger.js";
import {renderTsconfig} from "../../src/gamepackage/renderTsconfig.js";

const manifest = {id: "esm-slot", name: "ESM Slot", version: "0.1.0"};

function temporaryDirectory(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "pokie-esm-init-"));
}

describe("ESM-aware package scaffolding", () => {
    it("renders NodeNext tsconfig and a default export for an ESM package", () => {
        const tsconfig = JSON.parse(renderTsconfig("esm")) as {compilerOptions: {module: string; moduleResolution: string}};
        expect(tsconfig.compilerOptions).toMatchObject({module: "NodeNext", moduleResolution: "NodeNext"});
        const source = renderEntryModule({...manifest}, "esm");
        expect(source).toContain("export default game;");
        expect(source).not.toContain("export = game;");
    });

    it("scaffolds an ESM package without changing its package type", () => {
        const root = temporaryDirectory();
        try {
            fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "esm-slot", version: "0.1.0", type: "module"}));
            const result = new GamePackageMerger("2.0.0").merge(root);
            expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))).toMatchObject({type: "module"});
            expect(JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf-8"))).toMatchObject({
                compilerOptions: {module: "NodeNext", moduleResolution: "NodeNext"},
            });
            const source = fs.readFileSync(path.join(root, "src", "index.ts"), "utf-8");
            expect(source).toContain("export default game;");
            expect(source).not.toContain("export = game;");
            expect(result.info).toEqual({id: "esm-slot", name: "Esm Slot", version: "0.1.0"});
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("refuses an ESM package with an existing CommonJS entry module before touching package.json", () => {
        const root = temporaryDirectory();
        try {
            const pkg = JSON.stringify({name: "esm-slot", version: "0.1.0", type: "module"});
            fs.writeFileSync(path.join(root, "package.json"), pkg);
            fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {module: "NodeNext", moduleResolution: "NodeNext"}}));
            fs.mkdirSync(path.join(root, "src"));
            fs.writeFileSync(path.join(root, "src", "index.ts"), "const game = {};\nexport = game;\n");
            expect(() => new GamePackageMerger("2.0.0").merge(root)).toThrow(/export = game/);
            expect(fs.readFileSync(path.join(root, "package.json"), "utf-8")).toBe(pkg);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("refuses an ESM package with a CommonJS tsconfig before touching package.json", () => {
        const root = temporaryDirectory();
        try {
            const pkg = JSON.stringify({name: "esm-slot", version: "0.1.0", type: "module"});
            fs.writeFileSync(path.join(root, "package.json"), pkg);
            fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {module: "CommonJS"}}));
            expect(() => new GamePackageMerger("2.0.0").merge(root)).toThrow(/type.*module.*module.*commonjs/i);
            expect(fs.readFileSync(path.join(root, "package.json"), "utf-8")).toBe(pkg);
            expect(fs.existsSync(path.join(root, "src"))).toBe(false);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});
