import fs from "fs";
import os from "os";
import path from "path";
import {createCanonicalWasmFixture} from "../../fixtures/wasm/createCanonicalWasmFixture.js";
import {RunWasmCommand} from "../../../cli/commands/RunWasmCommand.js";

describe("RunWasmCommand", () => {
    let directory: string;
    let wasmPath: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-run-wasm-"));
        wasmPath = path.join(directory, "game.wasm");
        const fixture = createCanonicalWasmFixture();
        fs.writeFileSync(wasmPath, fixture.bytes);
        fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("prints the played round's actual numeric payout, never an undefined property", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await new RunWasmCommand().run([wasmPath, "--seed", "demo"]);
            const output = log.mock.calls.map((call) => String(call[0])).join("\n");
            expect(output).toMatch(/POKIE WASM round 1:/);
            expect(output).toMatch(/payout=\d+(\.\d+)?/);
            expect(output).not.toContain("undefined");
        } finally {
            log.mockRestore();
        }
    });

    it("keeps the same round and payout in JSON output", async () => {
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            await new RunWasmCommand().run([wasmPath, "--seed", "demo", "--format", "json"]);
            const body = JSON.parse(String(log.mock.calls[0][0])) as {round: {payout: number; winMultiplier: number}};
            expect(body.round.payout).toEqual(expect.any(Number));
            expect(body.round.winMultiplier).toEqual(expect.any(Number));
        } finally {
            log.mockRestore();
        }
    });

    it("rejects an empty --round-id instead of silently dropping it", async () => {
        await expect(new RunWasmCommand().run([wasmPath, "--round-id", ""])).rejects.toThrow(/--round-id must be a non-empty string/);
    });

    it("rejects excess positional arguments with the command usage", async () => {
        await expect(new RunWasmCommand().run([wasmPath, "extra"])).rejects.toThrow(/Unknown option "extra"\. Usage: pokie run/);
    });
});
