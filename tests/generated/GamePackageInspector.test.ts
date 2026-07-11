import {GamePackageInspector} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

describe("GamePackageInspector", () => {
    let cwd: string;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-inspect-test-"));
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
    });

    it("reports invalid with a descriptive error when packageRoot does not exist", () => {
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(path.join(cwd, "nope"));

        expect(report.valid).toBe(false);
        expect(report.generated).toBe(false);
        expect(report.error).toContain("does not exist or is not a directory");
    });

    it("reports invalid when packageRoot is a file, not a directory", () => {
        const filePath = path.join(cwd, "not-a-dir");
        fs.writeFileSync(filePath, "hello");
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(filePath);

        expect(report.valid).toBe(false);
        expect(report.error).toContain("does not exist or is not a directory");
    });

    it("reports invalid when package.json is missing", () => {
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(false);
        expect(report.error).toContain("package.json");
        expect(report.error).toContain("does not exist");
    });

    it("reports invalid when package.json is not valid JSON", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), "{not valid json");
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(false);
        expect(report.error).toContain("is not valid JSON");
    });

    it("reports valid but not generated for a plain package.json with no build-info.json", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({name: "hand-written", version: "1.0.0"}));
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(true);
        expect(report.generated).toBe(false);
        expect(report.buildInfo).toBeUndefined();
        expect(report.packageJson).toEqual({name: "hand-written", version: "1.0.0", description: undefined});
    });

    it("reports valid but not generated when build-info.json is corrupt JSON", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({name: "x", version: "1.0.0"}));
        fs.mkdirSync(path.join(cwd, "src", "generated"), {recursive: true});
        fs.writeFileSync(path.join(cwd, "src", "generated", "build-info.json"), "{not valid json");
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(true);
        expect(report.generated).toBe(false);
    });

    it("reports valid but not generated when build-info.json wasn't written by \"pokie build\"", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({name: "x", version: "1.0.0"}));
        fs.mkdirSync(path.join(cwd, "src", "generated"), {recursive: true});
        fs.writeFileSync(path.join(cwd, "src", "generated", "build-info.json"), JSON.stringify({generatedBy: "something-else"}));
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(true);
        expect(report.generated).toBe(false);
    });

    it("reports generated with the full build-info.json when present and written by \"pokie build\"", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({name: "crazy-fruits", version: "0.1.0"}));
        fs.mkdirSync(path.join(cwd, "src", "generated"), {recursive: true});
        const buildInfo = {
            schemaVersion: 1,
            generatedBy: "pokie build",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-02T03:04:05.000Z",
            blueprintHash: "sha256:abc123",
            source: "crazy-fruits.blueprint.json",
            files: ["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"],
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        };
        fs.writeFileSync(path.join(cwd, "src", "generated", "build-info.json"), JSON.stringify(buildInfo));
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(true);
        expect(report.generated).toBe(true);
        expect(report.buildInfo).toEqual(buildInfo);
    });
});
