import type {ScreenProjectionDescribing} from "./ScreenProjectionDescribing.js";
import type {ScreenCoordinateSpace, ScreenGeometry, ScreenPosition} from "./ScreenGeometry.js";

/** Validated, detached geometry and reversible discrete mappings; null denotes an unmapped cell. */
export class ScreenProjection implements ScreenProjectionDescribing {
    private readonly geometry: ScreenGeometry;

    constructor(geometry: ScreenGeometry) {
        const g = geometry;
        if (!g || g.paylineSpace !== "evaluated" || !g.generated || !g.visible || !g.evaluated ||
            !Number.isSafeInteger(g.generated.reels) || g.generated.reels < 1 ||
            !Number.isSafeInteger(g.generated.rows) || g.generated.rows < 1) {
            throw new Error("Invalid screen coordinate geometry: positive generated dimensions and evaluated paylines are required.");
        }
        for (const [name, window] of [["visible", g.visible], ["evaluated", g.evaluated]] as const) {
            if (!Number.isFinite(window.rowOffset) || !Number.isFinite(window.rows) || window.rowOffset < 0 || window.rows <= 0 ||
                window.rowOffset + window.rows > g.generated.rows ||
                (name === "evaluated" && (!Number.isSafeInteger(window.rowOffset) || !Number.isSafeInteger(window.rows)))) {
                throw new Error(`Invalid ${name} screen window: offsets/extents must be within generated bounds; evaluation cells must be integers.`);
            }
        }
        for (const [value, keys] of [[g, ["generated", "visible", "evaluated", "paylineSpace"]],
            [g.generated, ["reels", "rows"]], [g.visible, ["rowOffset", "rows"]], [g.evaluated, ["rowOffset", "rows"]]] as const) {
            if (Object.keys(value).some(key => !(keys as readonly string[]).includes(key))) throw new Error("Unsupported or ambiguous screen geometry fields (per-reel offsets are not supported).");
        }
        this.geometry = {generated: {...g.generated}, visible: {...g.visible}, evaluated: {...g.evaluated}, paylineSpace: "evaluated"};
    }

    public getGeometry(): ScreenGeometry {
        return {generated: {...this.geometry.generated}, visible: {...this.geometry.visible}, evaluated: {...this.geometry.evaluated}, paylineSpace: "evaluated"};
    }

    public isIdentity(): boolean {
        const g = this.geometry;
        return g.visible.rowOffset === 0 && g.evaluated.rowOffset === 0 &&
            g.visible.rows === g.generated.rows && g.evaluated.rows === g.generated.rows;
    }

    public getRows(space: ScreenCoordinateSpace): number {
        if (!["generated", "visible", "evaluated"].includes(space)) throw new Error("Unknown screen coordinate space.");
        if (space === "generated") return this.geometry.generated.rows;
        if (space === "evaluated") return this.geometry.evaluated.rows;
        return Math.ceil(this.geometry.visible.rowOffset + this.geometry.visible.rows) - Math.floor(this.geometry.visible.rowOffset);
    }

    public map(position: readonly number[], from: ScreenCoordinateSpace, to: ScreenCoordinateSpace): ScreenPosition | null {
        if (!Array.isArray(position) || position.length !== 2 || !Number.isSafeInteger(position[0]) || !Number.isSafeInteger(position[1])) throw new Error("Screen positions require integer [reel, row] indexes.");
        const sourceRows = this.getRows(from);
        const targetRows = this.getRows(to);
        const [reel, row] = position;
        if (reel < 0 || reel >= this.geometry.generated.reels || row < 0 || row >= sourceRows) return null;
        const target = row + this.offset(from) - this.offset(to);
        return target < 0 || target >= targetRows ? null : [reel, target];
    }

    public getVisibleCoverage(): number[] {
        const {rowOffset, rows} = this.geometry.visible;
        return Array.from({length: this.getRows("visible")}, (_, row) => {
            const generatedRow = Math.floor(rowOffset) + row;
            return Math.min(generatedRow + 1, rowOffset + rows) - Math.max(generatedRow, rowOffset);
        });
    }

    public assertMatrix(matrix: readonly (readonly unknown[])[], space: ScreenCoordinateSpace): void {
        if (!Array.isArray(matrix) || matrix.length !== this.geometry.generated.reels ||
            !Array.from({length: matrix.length}, (_, reel) => matrix[reel]).every(reel => Array.isArray(reel) && reel.length === this.getRows(space) &&
                Array.from({length: reel.length}, (_, row) => row in reel && reel[row] !== undefined).every(Boolean))) {
            throw new Error(`Screen matrix does not match declared ${space} dimensions.`);
        }
    }

    public project<T>(matrix: readonly (readonly T[])[], space: "visible" | "evaluated"): T[][] {
        this.assertMatrix(matrix, "generated");
        const offset = this.offset(space);
        return matrix.map(reel => reel.slice(offset, offset + this.getRows(space)));
    }

    private offset(space: ScreenCoordinateSpace): number {
        if (space === "generated") return 0;
        if (space === "visible") return Math.floor(this.geometry.visible.rowOffset);
        return this.geometry.evaluated.rowOffset;
    }
}
