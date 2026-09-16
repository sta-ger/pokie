export const POKIE_WASM_IMPORT_MODULE = "pokie";
export const POKIE_WASM_RANDOM_IMPORT = "next_random";
export const POKIE_WASM_PLAY_EXPORT = "play";
export const POKIE_WASM_GAME_MODEL_SECTION = "pokie.game.v1";

export type PokieWasmGameModel = {
    readonly schemaVersion: "pokie.game.v1";
    readonly reels: number;
    readonly rows: number;
    readonly reelStrips: readonly (readonly string[])[];
    readonly paylines: readonly (readonly number[])[];
    readonly paytable: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly stopWidths: readonly number[];
};

export type CanonicalPokieWasmModule = {
    readonly module: WebAssembly.Module;
    readonly model: PokieWasmGameModel;
    readonly modelBytes: Uint8Array;
};

function isPositiveSafeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isGameModel(value: unknown): value is PokieWasmGameModel {
    if (typeof value !== "object" || value === null) return false;
    const model = value as Partial<PokieWasmGameModel>;
    if (model.schemaVersion !== "pokie.game.v1" || !isPositiveSafeInteger(model.reels) || !isPositiveSafeInteger(model.rows) ||
        !Array.isArray(model.reelStrips) || model.reelStrips.length !== model.reels || !Array.isArray(model.paylines) ||
        !Array.isArray(model.stopWidths) || model.stopWidths.length !== model.reels) return false;
    if (!model.reelStrips.every((strip) => Array.isArray(strip) && strip.length > 0 && strip.every((symbol) => typeof symbol === "string" && symbol.length > 0))) return false;
    if (!model.stopWidths.every((width, index) => isPositiveSafeInteger(width) && width <= 30 && model.reelStrips![index].length <= (1 << width))) return false;
    if (!model.paylines.every((line) => Array.isArray(line) && line.length === model.reels && line.every((row) => Number.isSafeInteger(row) && row >= 0 && row < model.rows!))) return false;
    if (typeof model.paytable !== "object" || model.paytable === null) return false;
    return Object.values(model.paytable).every((wins) => typeof wins === "object" && wins !== null && Object.values(wins).every((multiplier) => typeof multiplier === "number" && Number.isFinite(multiplier)));
}

/** Validates the executable ABI shared by resolution, readback, and runtime instantiation. */
export function readCanonicalPokieWasmModule(bytes: BufferSource): CanonicalPokieWasmModule {
    if (!WebAssembly.validate(bytes)) throw new Error("The WASM module is malformed or is not a WebAssembly binary.");
    const module = new WebAssembly.Module(bytes);
    const imports = WebAssembly.Module.imports(module);
    if (imports.length !== 1 || imports[0].module !== POKIE_WASM_IMPORT_MODULE || imports[0].name !== POKIE_WASM_RANDOM_IMPORT || imports[0].kind !== "function") {
        throw new Error(`POKIE WASM artifact has unsupported host imports; canonical artifacts require ${POKIE_WASM_IMPORT_MODULE}.${POKIE_WASM_RANDOM_IMPORT} only.`);
    }
    if (!WebAssembly.Module.exports(module).some((entry) => entry.name === POKIE_WASM_PLAY_EXPORT && entry.kind === "function")) {
        throw new Error(`POKIE WASM artifact is missing its canonical ${POKIE_WASM_PLAY_EXPORT} export.`);
    }
    const sections = WebAssembly.Module.customSections(module, POKIE_WASM_GAME_MODEL_SECTION);
    if (sections.length !== 1) throw new Error(`POKIE WASM artifact must contain exactly one ${POKIE_WASM_GAME_MODEL_SECTION} game model section.`);
    const modelBytes = new Uint8Array(sections[0]);
    let model: unknown;
    try {
        model = JSON.parse(new TextDecoder().decode(modelBytes));
    } catch {
        throw new Error("POKIE WASM artifact has a malformed game model section.");
    }
    if (!isGameModel(model)) throw new Error("POKIE WASM artifact has an unsupported game model section.");
    return {module, model, modelBytes};
}
