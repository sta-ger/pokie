import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {createProductionParityFixture} from "../fixtures/wasm/createProductionParityFixture.js";
import {ReplayRecorder} from "../../src/replay/ReplayRecorder.js";
import {loadPokieWasmFileRuntime} from "../../src/wasm/node/PokieWasmFileRuntimeAdapter.js";
import {SeededPokieWasmHost} from "../../src/wasm/PokieWasmRuntime.js";
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
import {createCanonicalWasmFixture} from "../fixtures/wasm/createCanonicalWasmFixture.js";

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

    it("runs, simulates, and downloads first/later replay continuations for the generated Node string-zero sequence", async () => {
        const fixture = await createProductionParityFixture(directory);
        const expected = new ReplayRecorder().record({game: fixture.game, seed: "0", round: 4});
        const output: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation((line: string) => output.push(line));
        try {
            const runtime = await loadPokieWasmFileRuntime(fixture.artifact, new SeededPokieWasmHost("0"));
            const session = runtime.createSession("0");
            const initial = session.serialize();
            const first = await session.play({bet: 1});
            const nodeFirst = new ReplayRecorder().record({game: fixture.game, seed: "0", round: 1});
            expect(first).toMatchObject({draw: 0.0144703749101609, screen: nodeFirst.screen, stake: nodeFirst.totalBet, payout: nodeFirst.totalWin});
            runtime.dispose();
            expect(await new RunWasmCommand().run([fixture.artifact, "--seed", "0"])).toBe(0);
            expect(output.join("\n")).toBe(`POKIE WASM round 1: draw=${first.draw} seed=0`);
            output.length = 0;
            const reportPath = path.join(directory, "simulation.json");
            await new SimCommand().run([fixture.artifact, "--rounds", "4", "--seed", "0", "--format", "json", "--out", reportPath]);
            const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
            expect(report).toMatchObject({totalBet: expected.totalBet, totalWin: expected.totalWin});
            expect(JSON.parse(output.join("\n"))).toEqual(report);
            for (const round of [1, 4]) {
                output.length = 0;
                const descriptorPath = path.join(directory, `round-${round}.json`);
                await new ReplayCommand().run([fixture.artifact, "--round", String(round), "--seed", "0", "--format", "json", "--out", descriptorPath]);
                const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
                const node = new ReplayRecorder().record({game: fixture.game, seed: "0", round});
                expect(JSON.parse(output[0])).toEqual(descriptor);
                expect(descriptor).toMatchObject({round, totalBet: node.totalBet, totalWin: node.totalWin, screen: node.screen});
                expect(descriptor.stateBefore).toMatchObject({sequence: round - 1, rngState: expect.any(Number)});
                expect(descriptor.stateAfter).toMatchObject({sequence: round, rngState: expect.any(Number)});
                if (round === 1) expect(descriptor.stateBefore).toEqual(initial);
                const fresh = await loadPokieWasmFileRuntime(fixture.artifact, new SeededPokieWasmHost("advanced"));
                try {
                    await fresh.createSession("advanced").play();
                    expect((await fresh.replay(descriptor.stateBefore, [{}])).stateAfter).toEqual(descriptor.stateAfter);
                } finally {
                    fresh.dispose();
                }
            }
        } finally {
            log.mockRestore();
            await fixture.release();
        }
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
            expect(output.join("\n")).toContain("canonical ABI");
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
        expect(output.join("\n")).toContain(`pokie sim "${artifact}" --rounds 10000 --seed demo`);
        expect(output.join("\n")).toContain(`pokie replay "${artifact}" --round 1 --seed demo`);
    });

    it("derives explicit and implicit guidance from each canonical component's declared operations", async () => {
        const playOnly = createCanonicalWasmFixture({id: "play-only", capabilities: ["runtime.play", "runtime.serialize"]});
        const metadataOnly = createCanonicalWasmFixture({id: "metadata-only", capabilities: ["runtime.serialize"]});
        const playOnlyPath = path.join(directory, "play-only.wasm");
        const metadataOnlyPath = path.join(directory, "metadata-only.wasm");
        fs.writeFileSync(playOnlyPath, playOnly.bytes);
        fs.writeFileSync(`${playOnlyPath}.pokie-wasm.json`, JSON.stringify(playOnly.manifest));
        fs.writeFileSync(metadataOnlyPath, metadataOnly.bytes);
        fs.writeFileSync(`${metadataOnlyPath}.pokie-wasm.json`, JSON.stringify(metadataOnly.manifest));

        const output: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation((line: string) => output.push(line));
        try {
            await expect(new InspectCommand().run([playOnlyPath])).resolves.toBe(0);
            const explicit = output.join("\n");
            expect(explicit).toContain(`pokie validate "${playOnlyPath}"`);
            expect(explicit).toContain(`pokie run "${playOnlyPath}" --seed demo`);
            expect(explicit).toContain(`pokie sim "${playOnlyPath}" --rounds 10000 --seed demo`);
            expect(explicit).not.toContain("pokie replay");
            expect(explicit).not.toContain("runnable");

            output.length = 0;
            await expect(dispatch(registerCliCommands({
                version: "1.3.0",
                pokiePackageRoot: directory,
                clientRoot: directory,
                studioRoot: directory,
            }), ["node", "pokie", metadataOnlyPath])).resolves.toBe(0);
        } finally {
            log.mockRestore();
        }

        const implicit = output.join("\n");
        expect(implicit).toContain(`pokie validate "${metadataOnlyPath}"`);
        expect(implicit).not.toContain("pokie run");
        expect(implicit).not.toContain("pokie sim");
        expect(implicit).not.toContain("pokie replay");
        expect(implicit).not.toContain("runnable");
        expect(implicit).toContain("does not declare runtime.play");
    });
});
