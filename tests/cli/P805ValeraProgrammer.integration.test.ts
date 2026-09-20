import {existsSync, mkdtempSync, readFileSync, rmSync} from "fs";
import {execFileSync} from "child_process";
import {tmpdir} from "os";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";

describe("P8-05 Valera Programmer public path", () => {
    it("preserves installed/npx entry points and exposes the readiness and one-shot release validators", () => {
        const packageJson = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")) as {bin: Record<string, string>; scripts: Record<string, string>; exports: Record<string, unknown>};
        const commands = registerCliCommands({version: "1.3.0", pokiePackageRoot: "/packed/pokie", clientRoot: "/packed/pokie/dist/cli/client", studioRoot: "/packed/pokie/dist/cli/studio-client"});

        expect(packageJson.bin.pokie).toBe("./dist/cli/pokie.js");
        expect(packageJson.scripts["audit:product-readiness"]).toContain("p8-05-product-readiness-campaign.mjs");
        expect(packageJson.scripts["release:p8-05"]).toContain("p8-05-release-completion.mjs");
        expect(Object.keys(packageJson.exports)).toEqual(expect.arrayContaining([".", "./browser", "./wasm", "./client/player"]));
        expect(commands.find((command) => command.getName() === "__studio")?.getCommanderCommand().helpInformation()).toContain("Usage: pokie");
        for (const command of ["build", "diff", "replay", "report", "serve", "sim", "validate"]) expect(commands.find((item) => item.getName() === command)?.getCommanderCommand().helpInformation()).toContain(`Usage: ${command}`);
    });

    it("executes the public built launcher through a real WASM create/build/inspect/validate/run path", () => {
        const workspace = mkdtempSync(path.join(tmpdir(), "pokie-p8-05-programmer-"));
        const launcher = path.join(process.cwd(), "dist", "cli", "pokie.js");
        const blueprint = path.join(workspace, "Valera spaced blueprint.json");
        const wasm = path.join(workspace, "Valera artifact.wasm");
        const run = (...args: string[]) => execFileSync(process.execPath, [launcher, ...args], {encoding: "utf8"});
        try {
            expect(existsSync(launcher)).toBe(true);
            for (const args of [["--help"], ["build", "--help"], ["certification", "--help"], ["fairness", "--help"], ["par", "--help"], ["reel", "--help"], ["serve", "--help"]]) {
                expect(run(...args)).toContain("Usage:");
            }
            expect(run("create", "Valera Programmer", "--random", "--seed", "805", "--out", blueprint)).toContain("created");
            expect(run("build", blueprint, "--target", "wasm", "--out", wasm)).toContain("Artifact \"wasm\" built");
            expect(existsSync(wasm)).toBe(true);
            expect(run("inspect", wasm)).toContain("POKIE WASM component");
            expect(run("validate", wasm)).toContain("valid           yes");
            expect(run("run", wasm, "--seed", "p8-05-programmer")).toContain("POKIE WASM round");
            expect(() => run("validate", path.join(workspace, "missing blueprint.json"))).toThrow();
        } finally {
            rmSync(workspace, {recursive: true, force: true});
        }
    }, 90_000);
});
