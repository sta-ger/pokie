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

    it("reports valid with the parsed package.json identity", () => {
        fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({name: "hand-written", version: "1.0.0"}));
        const inspector = new GamePackageInspector();

        const report = inspector.inspect(cwd);

        expect(report.valid).toBe(true);
        expect(report.packageJson).toEqual({name: "hand-written", version: "1.0.0", description: undefined});
    });
});
