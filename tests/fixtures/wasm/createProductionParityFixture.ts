import fs from "fs";
import path from "path";
import {GamePackageGenerator, loadPokieGameRuntime, PROJECT_TYPE_CAPABILITIES, WasmArtifactBuilder, type GameBlueprint} from "pokie";

/** The public string-seed reproduction, built from one validated Blueprint. */
export const RNG_PARITY_BLUEPRINT: GameBlueprint = {
    manifest: {id: "rng-parity", name: "RNG parity", version: "1.0.0"},
    reels: 2, rows: 1, symbols: ["A", "B"],
    reelStrips: [["A", "B"], ["A", "B"]], paylines: [[0, 0]],
    availableBets: [1], paytable: {A: {2: 2}, B: {2: 1}},
};

export async function createProductionParityFixture(directory: string, blueprint = RNG_PARITY_BLUEPRINT) {
    const generated = new GamePackageGenerator("1.3.0").generate(blueprint, directory);
    // Jest resolves the generated module's real require("pokie") to this
    // candidate's source, avoiding an installed release or stale dist tree.
    const loaded = await loadPokieGameRuntime(generated.projectRoot, (entry) => require(entry));
    const source = path.join(directory, "parity.blueprint.json");
    const artifact = path.join(directory, "parity.wasm");
    fs.writeFileSync(source, JSON.stringify(blueprint));
    try {
        await new WasmArtifactBuilder("1.3.0").build({type: "blueprint", rootPath: source, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "P9-01"}, artifact);
        return {...loaded, artifact, projectRoot: generated.projectRoot};
    } catch (error) {
        await loaded.release();
        throw error;
    }
}
