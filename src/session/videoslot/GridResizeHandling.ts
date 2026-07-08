import {VideoSlotSessionHandling} from "pokie";

// What "the grid resizes" means for a given game — grow every round, grow only after a loss,
// shrink back after a bonus, resize based on a collected token count, stay fixed, etc. — is a
// strategy, not a fixed rule, so this has no default implementation in pokie (unlike free games'
// near-universal bank-and-retrigger behavior). Returning currentHeights unchanged is a no-op.
export interface GridResizeHandling<T extends string | number | symbol = string> {
    getNextReelsHeights(session: VideoSlotSessionHandling<T>, currentHeights: number[]): number[];
}
