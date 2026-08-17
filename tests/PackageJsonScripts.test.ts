import fs from "fs";
import path from "path";

describe("package.json scripts", () => {
    it("rebuilds dist via prepack, so npm pack/publish never ships a stale or missing dist", () => {
        const packageJsonPath = path.join(__dirname, "..", "package.json");
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {scripts?: Record<string, string>};

        expect(pkg.scripts?.prepack).toBe("npm run build");
    });

    it("runs every full-gate lane even when an earlier lane fails", () => {
        const packageJsonPath = path.join(__dirname, "..", "package.json");
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {scripts?: Record<string, string>};
        const runner = fs.readFileSync(path.join(__dirname, "..", "scripts", "run-full-check.mjs"), "utf-8");
        const workflowRunner = fs.readFileSync(
            path.join(__dirname, "..", "scripts", "run-studio-workflow-tests.mjs"),
            "utf-8",
        );

        expect(pkg.scripts?.["check:full"]).toBe("node scripts/run-full-check.mjs");
        expect(pkg.scripts?.["test:targeted"]).toContain("--runInBand --runTestsByPath");
        expect(runner).toContain('{name: "unit", arguments: ["test"]}');
        expect(runner).toContain('{name: "typecheck", arguments: ["run", "typecheck"]}');
        expect(runner).toContain('{name: "integration", arguments: ["run", "test:integration"]}');
        expect(runner).toContain('{name: "workflows", arguments: ["run", "test:workflows"]}');
        expect(runner).toContain("for (const stage of stages)");
        expect(workflowRunner).toContain("failedTestPaths.push(relativePath)");
        expect(workflowRunner).toContain("POKIE_FAILING_TEST_FILE");
    });
});
