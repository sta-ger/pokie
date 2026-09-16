import fs from "fs";
import os from "os";
import path from "path";
import {RunWasmCommand} from "../../cli/commands/RunWasmCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {dispatch} from "../../cli/dispatch.js";
import {registerCliCommands} from "../../cli/registerCliCommands.js";
import {WasmArtifactBuilder} from "../../src/project/WasmArtifactBuilder.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";

const blueprint = {
    manifest: {id: "cli-wasm", name: "CLI WASM", version: "1.0.0"}, reels: 3, rows: 1,
    symbols: ["A", "B", "C"], reelStrips: [["A", "B", "C"], ["B", "C", "A"], ["C", "A", "B"]], paytable: {A: {3: 2}},
};

describe("canonical WASM CLI workflow", () => {
    let directory: string;
    let artifact: string;

    beforeEach(async () => {
        directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-cli-")));
        const source = path.join(directory, "game.blueprint.json");
        artifact = path.join(directory, "game.wasm");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "CLI fixture"}, artifact);
    });

    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it("starts a canonical artifact from its bytes with no package-local runtime", async () => {
        const output: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation((line: string) => output.push(line));
        try {
            await expect(new RunWasmCommand().run([artifact, "--seed", "first-run"])).resolves.toBe(0);
        } finally {
            log.mockRestore();
        }
        expect(output).toEqual([expect.stringMatching(/^POKIE WASM round 1: draw=0\.\d+ seed=first-run$/)]);
    });

    it("fails before running a swapped artifact", async () => {
        fs.writeFileSync(artifact, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x00]));
        await expect(new RunWasmCommand().run([artifact])).rejects.toThrow(/does not match its manifest/);
    });

    it("inspects and validates runnable metadata before the canonical run", async () => {
        const output: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation((line: string) => output.push(line));
        try {
            await expect(new InspectCommand().run([artifact])).resolves.toBe(0);
            expect(output.join("\n")).toContain("canonical runnable ABI");
            expect(output.join("\n")).toContain("compatibility    compatible");
            expect(output.join("\n")).toContain("host bindings");
            expect(output.join("\n")).toContain("capabilities");
            output.length = 0;
            await expect(new ValidateCommand().run([artifact, "--format", "json"])).resolves.toBe(0);
        } finally {
            log.mockRestore();
        }
        const report = JSON.parse(output.join("\n"));
        expect(report).toMatchObject({valid: true, wasm: {abiVersion: "1.0.0", compatibility: "compatible", hostRequirements: {rng: "pokie.rng.v1"}}});
        expect(report.wasm.integrity).toMatch(/^sha256:[a-f0-9]{64}/);
    });

    it("routes an implicit artifact path through the public dispatcher to inspect guidance", async () => {
        const output: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation((line: string) => output.push(line));
        try {
            await expect(dispatch(registerCliCommands({
                version: "1.3.0",
                pokiePackageRoot: directory,
                clientRoot: directory,
                studioRoot: directory,
            }), ["node", "pokie", artifact])).resolves.toBe(0);
        } finally {
            log.mockRestore();
        }
        expect(output.join("\n")).toContain("Available next actions:");
        expect(output.join("\n")).toContain(`pokie run "${artifact}" --seed demo`);
    });
});
