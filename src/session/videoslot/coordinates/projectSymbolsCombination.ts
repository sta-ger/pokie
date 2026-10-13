import type {LinesDefinitionsDescribing} from "../linesdefinitions/LinesDefinitionsDescribing.js";
import {SymbolsCombination} from "../combinations/SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import type {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";
import type {ScreenGeometry} from "./ScreenGeometry.js";
import {ScreenProjection} from "./ScreenProjection.js";

export function resolveScreenProjection(config: Pick<VideoSlotConfigDescribing, "getScreenGeometry" | "getReelsNumber" | "getReelsSymbolsNumber">): ScreenProjection | undefined {
    const geometry = config.getScreenGeometry?.();
    if (geometry === undefined) return undefined;
    const projection = new ScreenProjection(geometry);
    if (geometry.generated.reels !== config.getReelsNumber() || projection.getRows("visible") !== config.getReelsSymbolsNumber()) {
        throw new Error("Screen geometry does not match configured reels and visible symbol rows.");
    }
    return projection;
}

/** Safety boundary also used by directly invoked calculators. Never infers overscan from shape. */
export function projectEvaluationSymbols<T extends string | number | symbol>(
    combination: SymbolsCombinationDescribing<T>, config?: VideoSlotConfigDescribing<T>,
): SymbolsCombinationDescribing<T> {
    const configured = config?.getScreenGeometry?.();
    const attached = combination.getScreenGeometry?.();
    if (configured && attached && JSON.stringify(new ScreenProjection(configured).getGeometry()) !== JSON.stringify(new ScreenProjection(attached).getGeometry())) {
        throw new Error("Combination geometry differs from evaluation configuration.");
    }
    const geometry = configured ?? attached;
    if (!geometry) return combination;
    const projection = config && configured ? resolveScreenProjection(config)! : new ScreenProjection(geometry);
    const space = combination.getCoordinateSpace?.() ?? "generated";
    if (space === "visible") throw new Error("A visible screen cannot be used as an evaluation matrix.");
    projection.assertMatrix(combination.toMatrix(), space);
    if (space === "evaluated") return combination;
    return new SymbolsCombination<T>().fromMatrix(projection.project(combination.toMatrix(), "evaluated")).withCoordinates(geometry, "evaluated");
}

export function validateEvaluationPaylines<T extends string | number | symbol>(config: VideoSlotConfigDescribing<T>, combination?: SymbolsCombinationDescribing<T>): LinesDefinitionsDescribing {
    const projection = resolveScreenProjection(config);
    const matrix = combination?.toMatrix();
    const definitions = config.getLinesDefinitions();
    const activeIds: string[] = [];
    for (const id of definitions.getLinesIds()) {
        const line = definitions.getLineDefinition(id);
        if (!Array.isArray(line) || line.length !== config.getReelsNumber() || line.some(row => !Number.isSafeInteger(row) || row < 0)) {
            throw new Error(`Payline "${id}" references cells outside the evaluation domain.`);
        }
        const outside = line.some((row, reel) => row >= (projection?.getRows("evaluated") ?? matrix?.[reel]?.length ?? config.getReelsSymbolsNumber()));
        if (outside) {
            if (!projection && combination?.hasVariableReelHeights?.() && definitions.allowsInactiveVariableRows?.()) continue;
            throw new Error(`Payline "${id}" references cells outside the evaluation domain.`);
        }
        activeIds.push(id);
    }
    return {getLinesIds: () => [...activeIds], getLineDefinition: id => definitions.getLineDefinition(id)};
}

export function rejectScreenGeometry(source: {getScreenGeometry?: () => ScreenGeometry | undefined}, adapter: string): void {
    const geometry = source.getScreenGeometry?.();
    if (geometry && !new ScreenProjection(geometry).isIdentity()) throw new Error(`${adapter} does not support overscan screen coordinates.`);
}
