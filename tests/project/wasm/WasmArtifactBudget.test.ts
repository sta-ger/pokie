import fs from "fs";
import os from "os";
import path from "path";
import {WasmArtifactBuilder} from "../../../src/project/WasmArtifactBuilder.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../../src/project/ProjectCapabilities.js";

const MAX_CANONICAL_WASM_BYTES = 64 * 1024;
const blueprint = {
    manifest: {id: "budget", name: "Budget", version: "1.0.0"}, reels: 3, rows: 1,
    symbols: ["A", "B", "C"], reelStrips: [["A", "B", "C"], ["B", "C", "A"], ["C", "A", "B"]], paytable: {A: {3: 2}},
};

describe("canonical WASM artifact budget", () => {
    it("keeps the raw executable module below the checked-in portable budget", async () => {
        const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-budget-")));
        try {
            const source = path.join(directory, "game.blueprint.json");
            const output = path.join(directory, "game.wasm");
            fs.writeFileSync(source, JSON.stringify(blueprint));
            await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "budget fixture"}, output);
            expect(fs.statSync(output).size).toBeLessThanOrEqual(MAX_CANONICAL_WASM_BYTES);
            expect(fs.statSync(`${output}.pokie-wasm.json`).size).toBeGreaterThan(0);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });
});
