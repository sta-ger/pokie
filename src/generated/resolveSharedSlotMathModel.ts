import {validateAuthoredMechanics} from "./validateAuthoredMechanics.js";
import {HorizontalLines} from "../session/videoslot/linesdefinitions/HorizontalLines.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import {lowerSharedSlotMath, SHARED_SLOT_DEFAULT_BETS, type SharedSlotMathModel} from "../wasm/math/SharedSlotMath.js";
/** Structural lowering only: Node's evaluation pipeline owns validation and its explicit opt-out. */
export function resolveSharedSlotMathModel(blueprint: GameBlueprint): SharedSlotMathModel {
    const issues = validateAuthoredMechanics(blueprint as unknown as Record<string, unknown>);
    if (issues.length) throw new Error(issues.map(issue => `${issue.code} at ${issue.path}: ${issue.message}`).join("; "));
    const defaultLines = new HorizontalLines(blueprint.reels, blueprint.screenGeometry?.evaluated.rows ?? blueprint.rows);
    const model: SharedSlotMathModel = {
        schemaVersion: "pokie.game.v2", mathVersion: "pokie.math.v2",
        reels: blueprint.reels, rows: blueprint.screenGeometry?.evaluated.rows ?? blueprint.rows, symbols: blueprint.symbols,
        winModel: blueprint.winModel ?? {type: "lines"},
        reelStrips: blueprint.reelSequences?.map(reel => reel.type === "exact" ? reel.symbols : reel.variants[0].symbols) ?? blueprint.reelStrips ?? [],
        paylines: blueprint.paylines ?? (blueprint.screenGeometry
            ? Array.from({length: blueprint.screenGeometry.evaluated.rows}, (_, row) => Array.from({length: blueprint.reels}, () => row))
            : defaultLines.getLinesIds().map(id => defaultLines.getLineDefinition(id))),
        paytable: blueprint.paytable,
        availableBets: blueprint.availableBets ?? SHARED_SLOT_DEFAULT_BETS,
        wilds: blueprint.wilds ?? [], scatters: blueprint.scatters ?? [],
        ...(blueprint.mechanics?.modifiers ? {wildSubstitutions: Object.fromEntries(blueprint.mechanics.modifiers.wilds.filter(wild => wild.substitutes !== undefined).map(wild => [wild.symbol, wild.substitutes!]))} : {}),
    };
    lowerSharedSlotMath(model);
    return model;
}
