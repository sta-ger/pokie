import fs from "fs";
import os from "os";
import path from "path";
import {ensureCompiledTestOutput} from "./ensureCompiledTestOutput.js";

describe("ensureCompiledTestOutput", () => {
    let repositoryRoot: string;
    let outputPath: string;
    let commandLogPath: string;

    beforeEach(() => {
        repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-test-build-"));
        outputPath = path.join(repositoryRoot, "dist", "compiled", "entry.js");
        commandLogPath = path.join(repositoryRoot, "build-count.log");
    });

    afterEach(() => {
        fs.rmSync(repositoryRoot, {recursive: true, force: true});
    });

    function buildOptions() {
        // Keep this a real child command: the production helper's important contract is that only
        // one worker gets to execute an external compiler, not merely a callback in this process.
        const script = [
            "const fs = require('fs');",
            "const path = require('path');",
            "fs.mkdirSync(path.dirname(process.argv[1]), {recursive: true});",
            "fs.writeFileSync(process.argv[1], 'compiled');",
            "fs.appendFileSync(process.argv[2], 'build\\n');",
        ].join("");
        return {
            repositoryRoot,
            outputPaths: [outputPath],
            lockName: "test-output",
            command: [process.execPath, "-e", script, outputPath, commandLogPath],
        };
    }

    it("builds a missing output once and reuses it without rerunning the compiler", () => {
        ensureCompiledTestOutput(buildOptions());
        ensureCompiledTestOutput(buildOptions());

        expect(fs.readFileSync(outputPath, "utf8")).toBe("compiled");
        expect(fs.readFileSync(commandLogPath, "utf8")).toBe("build\n");
        expect(fs.existsSync(path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", "test-output.lock"))).toBe(false);
    });

    it("reclaims an abandoned compiler lock after its creation grace period", () => {
        const lockDirectory = path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", "test-output.lock");
        fs.mkdirSync(lockDirectory, {recursive: true});
        fs.writeFileSync(path.join(lockDirectory, "owner.json"), JSON.stringify({pid: 999_999_999}));
        const old = new Date(Date.now() - 31_000);
        fs.utimesSync(lockDirectory, old, old);

        ensureCompiledTestOutput(buildOptions());

        expect(fs.readFileSync(outputPath, "utf8")).toBe("compiled");
        expect(fs.readFileSync(commandLogPath, "utf8")).toBe("build\n");
    });

    it("reports a compiler failure once and releases its lock without claiming missing output", () => {
        const options = buildOptions();
        const script = "const fs=require('fs'); fs.mkdirSync(require('path').dirname(process.argv[1]),{recursive:true}); fs.writeFileSync(process.argv[1],'partial'); process.exit(7);";
        expect(() => ensureCompiledTestOutput({...options, command: [process.execPath, "-e", script, outputPath]})).toThrow(/exit 7/);
        expect(fs.existsSync(outputPath)).toBe(false);
        expect(fs.existsSync(path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", "test-output.lock"))).toBe(false);
        ensureCompiledTestOutput(options);
        expect(fs.readFileSync(commandLogPath, "utf8")).toBe("build\n");
    });

    it("preserves an earlier output when a forced compiler run fails", () => {
        ensureCompiledTestOutput(buildOptions());
        expect(() => ensureCompiledTestOutput({
            ...buildOptions(), forceRebuild: true, command: [process.execPath, "-e", "process.exit(7)"],
        })).toThrow(/exit 7/);
        expect(fs.readFileSync(outputPath, "utf8")).toBe("compiled");
    });

    it("preserves a missing compiler's spawn error without signalling the caller's process group", () => {
        expect(() => ensureCompiledTestOutput({
            ...buildOptions(), command: [path.join(repositoryRoot, "missing-compiler")],
        })).toThrow(/ENOENT/);
        expect(fs.existsSync(outputPath)).toBe(false);
        expect(fs.existsSync(path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", "test-output.lock"))).toBe(false);
        ensureCompiledTestOutput(buildOptions());
        expect(fs.readFileSync(commandLogPath, "utf8")).toBe("build\n");
    });

    it("bounds a hung compiler and kills its owned child before releasing the lock", async () => {
        const lateOutput = path.join(repositoryRoot, "late-output");
        const childScript = `setTimeout(() => require('fs').writeFileSync(process.argv[1], 'late'), 800);`;
        const script = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}, process.argv[1]], {stdio: 'inherit'}); setInterval(() => {}, 1000);`;
        const started = Date.now();
        expect(() => ensureCompiledTestOutput({
            ...buildOptions(),
            command: [process.execPath, "-e", script, lateOutput],
            executionTimeoutMs: 200,
        })).toThrow(/ETIMEDOUT/);
        expect(Date.now() - started).toBeLessThan(3000);
        expect(fs.existsSync(outputPath)).toBe(false);
        expect(fs.existsSync(path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", "test-output.lock"))).toBe(false);
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
        expect(fs.existsSync(lateOutput)).toBe(false);
        ensureCompiledTestOutput(buildOptions());
        expect(fs.readFileSync(commandLogPath, "utf8")).toBe("build\n");
    });
});
