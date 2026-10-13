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

/** Compare upcoming contracts; absent metadata denotes ordinary identity coordinates.
 * Owners must also validate their reel/row dimensions against the configuration.
 */
export function areScreenGeometriesCompatible(first?: ScreenGeometry, second?: ScreenGeometry): boolean {
    const a = first && new ScreenProjection(first);
    const b = second && new ScreenProjection(second);
    if (!a || !b) return (a ?? b)?.isIdentity() ?? true;
    return JSON.stringify(a.getGeometry()) === JSON.stringify(b.getGeometry());
}

/** Reconcile a newly generated result with the contract resolved before that generation.
 * An authoritative ordinary contract rejects overscan tags; absent legacy declarations may
 * learn a contract from the new tag. Older settled tags are never consulted here.
 */
export function resolveGeneratedScreenGeometry<T extends string | number | symbol>(
    combination: SymbolsCombinationDescribing<T>, geometry?: ScreenGeometry, authoritative = false,
): ScreenGeometry | undefined {
    if (combination.getCoordinateSpace && combination.getCoordinateSpace() !== "generated") {
        throw new Error("A session generator must supply the generated coordinate space.");
    }
    const attached = combination.getScreenGeometry?.();
    if (attached && (geometry || authoritative) && !areScreenGeometriesCompatible(geometry, attached)) {
        throw new Error("Generated combination geometry differs from the upcoming coordinate contract.");
    }
    const resolved = geometry ?? attached;
    const projection = resolved && new ScreenProjection(resolved);
    return projection?.getGeometry();
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

export function validateEvaluationPaylines<T extends string | number | symbol>(config: VideoSlotConfigDescribing<T>, combination?: SymbolsCombinationDescribing<T>, resolvedProjection?: ScreenProjection): LinesDefinitionsDescribing {
    const attached = combination?.getScreenGeometry?.();
    const projection = resolvedProjection ?? resolveScreenProjection(config) ?? (attached ? new ScreenProjection(attached) : undefined);
    const matrix = combination?.toMatrix();
    const definitions = config.getLinesDefinitions();
    for (const id of definitions.getLinesIds()) {
        const line = definitions.getLineDefinition(id);
        if (!Array.isArray(line) || line.length !== config.getReelsNumber() || Array.from(line).some(row => !Number.isSafeInteger(row) || row < 0)) {
            throw new Error(`Payline "${id}" references cells outside the evaluation domain.`);
        }
        // Ordinary default lines retain pattern-level matching on ragged grids: missing trailing
        // cells do not invalidate a three-symbol award on the reels that contain the row.
        const ordinaryDefault = !projection && definitions.allowsInactiveVariableRows?.();
        const outside = line.some((row, reel) => {
            // Viewport height is not an evaluation bound for an undeclared generator. Preflight
            // checks structure and known windows; newly generated matrices supply ordinary bounds.
            const rows = projection?.getRows("evaluated") ??
                (matrix && !ordinaryDefault ? matrix[reel]?.length ?? 0 : undefined);
            return rows !== undefined && row >= rows;
        });
        if (outside) {
            throw new Error(`Payline "${id}" references cells outside the evaluation domain.`);
        }
    }
    return definitions;
}

export function rejectScreenGeometry(source: {getScreenGeometry?: () => ScreenGeometry | undefined}, adapter: string): void {
    const geometry = source.getScreenGeometry?.();
    if (geometry && !new ScreenProjection(geometry).isIdentity()) throw new Error(`${adapter} does not support overscan screen coordinates.`);
}
