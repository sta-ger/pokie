import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import {resolveBetModeCodegenWiring} from "../generated/resolveBetModeCodegenWiring.js";
import {resolveSharedSlotMathModel} from "../generated/resolveSharedSlotMathModel.js";
import {assertPlayableSharedSlotMathModel, compileSharedSlotMath, sharedSlotCustomSection, stableSlotMathJson, type SharedSlotMathModel} from "./math/SharedSlotMath.js";

/** ABI 3 binds the complete resolved declarative model, including progression owners.
 * Arithmetic stays in pokie.math.v2; the portable session decorators own progression.
 */
export type DeclarativeWasmModel = SharedSlotMathModel & {
    readonly features: {readonly schemaVersion: "pokie.features.v1"; readonly blueprint: GameBlueprint};
};
export type CanonicalWasmGameModel = SharedSlotMathModel & {readonly features?: DeclarativeWasmModel["features"]};

/** Discard only the documented authoring distribution shadowed by resolved strips. */
export function normalizeResolvedWasmBlueprint(blueprint: GameBlueprint): GameBlueprint {
    const errors = new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error");
    if (errors.length) throw new Error(errors.map(issue => `${issue.code} at ${issue.path ?? "$"}: ${issue.message}`).join("; "));
    if (blueprint.reelStrips === undefined || blueprint.symbolWeights === undefined) return blueprint;
    const resolved = {...blueprint};
    Reflect.deleteProperty(resolved, "symbolWeights");
    return resolved;
}

export function assertDeclarativeWasmBlueprint(value: unknown): asserts value is GameBlueprint {
    const errors = new GameBlueprintValidator().validate(value).filter(issue => issue.severity === "error");
    if (errors.length) throw new Error(errors.map(issue => `${issue.code} at ${issue.path ?? "$"}: ${issue.message}`).join("; "));
    const blueprint = value as GameBlueprint;
    const allowed = ["manifest", "reels", "rows", "symbols", "wilds", "scatters", "paylines", "paytable", "reelStrips", "reelSequences", "availableBets", "winModel", "mechanics", "betModes", "screenGeometry"];
    for (const key of Object.keys(blueprint)) if (!allowed.includes(key)) throw new Error(`wasm-unsupported-field at ${key}: only resolved declarative data is executable; build a TypeScript package for custom code or services.`);
    const fields = (item: object | undefined, keys: string[], location: string): void => {
        for (const key of Object.keys(item ?? {})) if (!keys.includes(key)) throw new Error(`wasm-unsupported-field at ${location}.${key}: custom code and services require a TypeScript package.`);
    };
    fields(blueprint.manifest, ["id", "name", "version", "description", "author"], "manifest");
    fields(blueprint.winModel, ["type", "minimumClusterSize"], "winModel");
    blueprint.betModes?.forEach((mode, index) => fields(mode, ["id", "label", "costMultiplier", "runtimeType", "isDefault", "forcedFreeGames", "targetRtp"], `betModes[${index}]`));
    const visit = (item: unknown, location: string): void => {
        if (item === undefined || item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
        if (Array.isArray(item)) {
            item.forEach((child, index) => visit(child, `${location}[${index}]`));
            return;
        }
        if (typeof item !== "object" || ![Object.prototype, null].includes(Reflect.getPrototypeOf(item) as object | null)) throw new Error(`wasm-custom-code at ${location}: expected plain declarative data.`);
        for (const [key, child] of Object.entries(item)) visit(child, `${location}.${key}`);
    };
    visit(blueprint, "$");
    if (!blueprint.reelStrips && !blueprint.reelSequences) throw new Error("wasm-unresolved-reels at reelStrips: materialize reels before lowering.");
    if (blueprint.betModes?.length && !resolveBetModeCodegenWiring(blueprint)) throw new Error("wasm-mode-semantics at betModes: runtimeType is required for every portable mode.");
    assertPlayableSharedSlotMathModel(resolveSharedSlotMathModel(blueprint));
}

export function assertCanonicalWasmGameModel(value: unknown): asserts value is CanonicalWasmGameModel {
    const model = value as CanonicalWasmGameModel;
    if (model?.features !== undefined) {
        if (model.features?.schemaVersion !== "pokie.features.v1" || Object.keys(model.features).some(key => !["schemaVersion", "blueprint"].includes(key))) throw new Error("Unsupported declarative WASM feature schema.");
        assertDeclarativeWasmBlueprint(model.features.blueprint);
        const {features, ...math} = model;
        if (stableSlotMathJson(math) !== stableSlotMathJson(resolveSharedSlotMathModel(features.blueprint))) throw new Error("WASM feature model differs from its arithmetic model.");
    } else assertPlayableSharedSlotMathModel(value);
}

export function canonicalWasmBlueprint(model: CanonicalWasmGameModel): GameBlueprint {
    if (model.features) return model.features.blueprint;
    return {manifest: {id: "portable", name: "Portable", version: "1"}, reels: model.reels, rows: model.rows, symbols: [...model.symbols],
        winModel: model.winModel as GameBlueprint["winModel"], reelStrips: model.reelStrips.map(strip => [...strip]), paylines: model.paylines.map(line => [...line]),
        paytable: JSON.parse(JSON.stringify(model.paytable)) as GameBlueprint["paytable"], availableBets: [...model.availableBets], wilds: [...model.wilds ?? []], scatters: [...model.scatters ?? []]};
}

export function canonicalWasmMath(model: CanonicalWasmGameModel): SharedSlotMathModel {
    return model.features ? resolveSharedSlotMathModel(model.features.blueprint) : model;
}

export function compileCanonicalWasmArtifact(model: CanonicalWasmGameModel, descriptor: unknown): Uint8Array<ArrayBuffer> {
    assertCanonicalWasmGameModel(model);
    const sections = [compileSharedSlotMath(canonicalWasmMath(model)), sharedSlotCustomSection("pokie.game.v2", stableSlotMathJson(model)), sharedSlotCustomSection("pokie.component.v2", stableSlotMathJson(descriptor))];
    const bytes = new Uint8Array(sections.reduce((length, part) => length + part.length, 0));
    let cursor = 0;
    for (const part of sections) {
        bytes.set(part, cursor);
        cursor += part.length;
    }
    return bytes;
}
