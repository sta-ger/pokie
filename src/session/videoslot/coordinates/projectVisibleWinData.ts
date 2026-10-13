import type {ScreenProjection} from "./ScreenProjection.js";

export function projectVisiblePositions(positions: readonly (readonly number[])[], projection: ScreenProjection): number[][] {
    return positions.flatMap(position => {
        const mapped = projection.map(position, "evaluated", "visible");
        return mapped === null ? [] : [[...mapped]];
    });
}

/** A full payline needs every reel; a line outside the viewport has no public drawing definition. */
export function projectVisiblePayline(definition: readonly number[], projection: ScreenProjection): number[] | null {
    const mapped = definition.map((row, reel) => projection.map([reel, row], "evaluated", "visible"));
    return mapped.some(position => position === null) ? null : mapped.map(position => position![1]);
}

export function projectVisibleLine<T extends {definition: number[]; symbolsPositions: number[]; wildSymbolsPositions: number[]}>(line: T, projection: ScreenProjection): T & {visiblePositions: number[][]; visibleWildPositions: number[][]} {
    const definition = projectVisiblePayline(line.definition, projection);
    return {...line, definition: definition ?? [],
        visiblePositions: projectVisiblePositions(line.symbolsPositions.map(reel => [reel, line.definition[reel]]), projection),
        visibleWildPositions: projectVisiblePositions(line.wildSymbolsPositions.map(reel => [reel, line.definition[reel]]), projection)};
}
