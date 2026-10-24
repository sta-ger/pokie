import fs from "fs";
import os from "os";
import path from "path";
import {BUILT_PACKAGE_FILES, GamePackageGenerator, type GameBlueprint} from "@fromstan/pokie";

function buildBlueprint(): GameBlueprint {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3, rows: 3, symbols: ["A", "B"], paytable: {A: {3: 5}, B: {3: 2}},
    };
}

describe("GamePackageGenerator runtime dependency", () => {
    let cwd: string;
    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-dependency-"));
    });
    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
    });

    it("binds manifests and the atomic runtime link to the supplied installation without retaining it on the next call", () => {
        const generator = new GamePackageGenerator("2.0.0");
        const runtimeRoot = path.join(cwd, "installed runtime з прабелам");
        fs.mkdirSync(runtimeRoot);
        const local = generator.generate(buildBlueprint(), cwd, "local", undefined, {runtimePackageRoot: runtimeRoot});
        const pkg = JSON.parse(fs.readFileSync(path.join(local.projectRoot, "package.json"), "utf8"));
        const lock = JSON.parse(fs.readFileSync(path.join(local.projectRoot, "package-lock.json"), "utf8"));
        expect(pkg.dependencies["@fromstan/pokie"]).toBe(`file:${runtimeRoot}`);
        expect(lock.packages[""].dependencies["@fromstan/pokie"]).toBe(`file:${runtimeRoot}`);
        expect(fs.readlinkSync(path.join(local.projectRoot, "node_modules/@fromstan/pokie"))).toBe(runtimeRoot);
        expect(local.createdFiles).toContain("node_modules/@fromstan/pokie");
        const readme = fs.readFileSync(path.join(local.projectRoot, "README.md"), "utf8");
        expect(readme).toContain("unpublished candidate");
        expect(readme).toContain("original POKIE installation");
        expect(readme).not.toContain("npx --package @fromstan/pokie");

        const portable = generator.generate(buildBlueprint(), cwd, "registry");
        expect(JSON.parse(fs.readFileSync(path.join(portable.projectRoot, "package.json"), "utf8")).dependencies["@fromstan/pokie"]).toBe("^2.0.0");
        expect(fs.existsSync(path.join(portable.projectRoot, "node_modules"))).toBe(false);
        expect(portable.createdFiles).toEqual([...BUILT_PACKAGE_FILES]);
        expect(fs.readFileSync(path.join(portable.projectRoot, "README.md"), "utf8")).toContain("available registry");
    });

});
