export type PaytableRow = {readonly symbolId: string; readonly matchCount: number; readonly payout: number};
export type PaytableData = Record<string, Record<string, number>>;

/** Collapses the Game Model's flat paytable rows back into the player-table shape. */
export function paytableDataFromRows(rows: readonly PaytableRow[]): PaytableData {
    const paytable: PaytableData = {};
    for (const row of rows) {
        paytable[row.symbolId] ??= {};
        paytable[row.symbolId][String(row.matchCount)] = row.payout;
    }
    return paytable;
}
