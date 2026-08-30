import {GenerateCommand} from "../../../cli/commands/GenerateCommand.js";
import fs from "fs";
import os from "os";
import path from "path";
import {POKIE_WASM_CONTRACT_VERSION} from "pokie";

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
});
