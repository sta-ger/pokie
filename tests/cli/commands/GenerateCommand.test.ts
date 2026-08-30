import {GenerateCommand} from "../../../cli/commands/GenerateCommand.js";
import {OutcomeLibraryCommand} from "../../../cli/commands/OutcomeLibraryCommand.js";
import {EventEmitter} from "events";
import fs from "fs";
import os from "os";
import path from "path";
import {GenerateExactWeightedOutcomeLibraryResult, OutcomeLibraryGenerationRequest, OutcomeSpaceEstimate, POKIE_WASM_CONTRACT_VERSION, PokieGame} from "pokie";

describe("GenerateCommand", () => {
    it("renders public help without its private implementation namespace", async () => {
        const command = new GenerateCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        expect(command.getName()).toBe("generate");
        expect(command.getCommanderCommand().name()).toBe("generate");
        expect(await command.run(["--help"])).toBe(0);

        const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
        expect(help).toContain("Usage: generate");
        expect(help).not.toMatch(/\b(?:outcomelibrary|outcomesource|stakeengine)\b/);

        logSpy.mockRestore();
    });

    it("translates delegated invalid input to the public command", async () => {
        const command = new GenerateCommand("1.3.0");
        const error = await command.run([]).then(
            () => new Error("Expected generate to reject missing input."),
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Usage: pokie generate <packageRoot>");
        expect((error as Error).message).not.toMatch(/\bpokie (?:outcomelibrary|outcomesource|stakeengine)\b/);
    });

    it("keeps every WASM sidecar state on the public alias's inspection-only boundary", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generate-alias-wasm-"));
        const wasmPath = path.join(workDir, "component.wasm");
        try {
            fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
            const compatibleManifest = {
                schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                component: {id: "component", version: "1.0.0"},
                serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                host: {rng: "pokie.rng.v1", services: []},
                capabilities: [],
            };
            fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify(compatibleManifest));

            await expect(new GenerateCommand("1.3.0").run([wasmPath, "--estimate"])).rejects.toThrow("This POKIE WASM component cannot generate an Outcome Library");
            fs.rmSync(`${wasmPath}.pokie-wasm.json`);
            await expect(new GenerateCommand("1.3.0").run([wasmPath, "--estimate"])).rejects.toThrow("no compatible PokieWasmComponentManifest sidecar");
            fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, "{");
            await expect(new GenerateCommand("1.3.0").run([wasmPath, "--estimate"])).rejects.toThrow("sidecar at");
            fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify({...compatibleManifest, schemaVersion: "2.0.0"}));
            await expect(new GenerateCommand("1.3.0").run([wasmPath, "--estimate"])).rejects.toThrow("not compatible with this POKIE build");
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("rejects package-to-WASM replacement through the public alias before rebind loading, generation, checkpoint, or publication", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generate-alias-rebind-wasm-"));
        const source = path.join(workDir, "source.wasm");
        const output = path.join(workDir, "library.json");
        const checkpoint = path.join(workDir, "checkpoint.json");
        const game = {
            getManifest: () => ({id: "slot-1", name: "Slot 1", version: "1.0.0"}),
            getConfigHash: () => "sha256:abc",
            createSession: () => {
                throw new Error("generation must reject before creating a session");
            },
        } as unknown as PokieGame;
        const loadGame = jest.fn(() => {
            if (loadGame.mock.calls.length === 1) {
                fs.rmSync(source, {recursive: true, force: true});
                fs.writeFileSync(source, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
                fs.writeFileSync(`${source}.pokie-wasm.json`, JSON.stringify({
                    schemaVersion: POKIE_WASM_CONTRACT_VERSION,
                    component: {id: "replaced", version: "1.0.0"},
                    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                    host: {rng: "pokie.rng.v1", services: []}, capabilities: [],
                }));
            }
            return Promise.resolve(game);
        });
        const generate = jest.fn<Promise<GenerateExactWeightedOutcomeLibraryResult>, [OutcomeLibraryGenerationRequest]>();
        const writeFile = jest.fn();
        const removeFile = jest.fn();
        const estimateSpace = jest.fn<OutcomeSpaceEstimate, [PokieGame]>(() => ({reelsNumber: 2, reelsSymbolsNumber: 1, reelSizes: [3, 2], totalOutcomeSpaceSize: BigInt(6)}));
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({pokie: {entry: "./index.js"}}));
        try {
            const delegate = new OutcomeLibraryCommand(
                "1.3.0", undefined, undefined, () => {
                    throw new Error("no JSON input is expected");
                }, undefined, loadGame, generate, estimateSpace, writeFile,
                (filePath) => fs.existsSync(filePath), removeFile, new EventEmitter() as unknown as NodeJS.Process,
            );
            await expect(new GenerateCommand("1.3.0", delegate).run([source, "--out", output, "--resume", checkpoint]))
                .rejects.toThrow("This POKIE WASM component cannot generate an Outcome Library");
            expect(loadGame).toHaveBeenCalledTimes(1);
            expect(generate).not.toHaveBeenCalled();
            expect(writeFile).not.toHaveBeenCalled();
            expect(removeFile).not.toHaveBeenCalled();
            expect(fs.existsSync(output)).toBe(false);
            expect(fs.existsSync(checkpoint)).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
