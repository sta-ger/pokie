import {HorizontalLines} from "../session/videoslot/linesdefinitions/HorizontalLines.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import {lowerSharedSlotMath, SHARED_SLOT_DEFAULT_BETS, type SharedSlotMathModel} from "../wasm/math/SharedSlotMath.js";
/** Requires already-materialized strips; never guesses custom or feature semantics. */
export function resolveSharedSlotMathModel(blueprint: GameBlueprint): SharedSlotMathModel {
    if (blueprint.screenGeometry || blueprint.reelSequences || blueprint.betModes?.length ||
        (blueprint.mechanics && Object.values(blueprint.mechanics).some(value => value !== undefined))) throw new Error("This model requires nonportable mechanics; shared math supports ordinary lines, ways and clusters.");
    const defaultLines = new HorizontalLines(blueprint.reels, blueprint.rows);
    const model: SharedSlotMathModel = {
        schemaVersion: "pokie.game.v2", mathVersion: "pokie.math.v2",
        reels: blueprint.reels, rows: blueprint.rows, symbols: blueprint.symbols,
        winModel: blueprint.winModel ?? {type: "lines"},
        reelStrips: blueprint.reelStrips ?? [],
        paylines: blueprint.paylines ?? defaultLines.getLinesIds().map(id => defaultLines.getLineDefinition(id)),
        paytable: blueprint.paytable,
        availableBets: blueprint.availableBets ?? SHARED_SLOT_DEFAULT_BETS,
        wilds: blueprint.wilds ?? [], scatters: blueprint.scatters ?? [],
    };
    lowerSharedSlotMath(model);
    return model;
}
