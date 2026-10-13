import type {ScreenCoordinateSpace, ScreenGeometry, ScreenPosition} from "./ScreenGeometry.js";

export interface ScreenProjectionDescribing {
    getGeometry(): ScreenGeometry;
    isIdentity(): boolean;
    getRows(space: ScreenCoordinateSpace): number;
    map(position: readonly number[], from: ScreenCoordinateSpace, to: ScreenCoordinateSpace): ScreenPosition | null;
    getVisibleCoverage(): number[];
    assertMatrix(matrix: readonly (readonly unknown[])[], space: ScreenCoordinateSpace): void;
    project<T>(matrix: readonly (readonly T[])[], space: "visible" | "evaluated"): T[][];
}
