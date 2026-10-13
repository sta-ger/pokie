/** Reel-major cells [reel, row], zero-based from the generated matrix's top-left.
 * Windows span every reel. Per-reel offsets and fractional evaluation cells are unsupported.
 * Visible geometry is continuous: every intersected cell is retained, with separate coverage.
 * Paylines and all calculation positions are evaluation-local discrete cell coordinates.
 */
export type ScreenGeometry = {
    readonly generated: {readonly reels: number; readonly rows: number};
    readonly visible: {readonly rowOffset: number; readonly rows: number};
    readonly evaluated: {readonly rowOffset: number; readonly rows: number};
    readonly paylineSpace: "evaluated";
};
export type ScreenCoordinateSpace = "generated" | "visible" | "evaluated";
export type ScreenPosition = readonly [number, number];
