import type {WinningLineDescribing} from "../WinningLineDescribing.js";
import type {WinningScatterDescribing} from "../WinningScatterDescribing.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";

// A snapshot of everything the wrapped session's own paytable evaluation reported for the spin that just
// played — captured once, by VideoSlotWithHoldAndWinSession's own play(), directly off baseSession (never
// through this decorator's own overridden getters, which would answer with the *previous* round's outcome —
// see HoldAndWinRoundHandling.afterRoundPlayed's own doc comment). This is the "base result context"
// HoldAndWinRoundHandler needs to decide, per round, whether the wrapped session's own result still applies
// (a genuine paid spin) or must be entirely suppressed (any respin, whose own result is always discarded —
// see HoldAndWinRoundHandler's own class doc comment). Bundled as one object, rather than one parameter per
// legacy accessor, both because it's always captured/consumed as a unit and because it keeps
// HoldAndWinRoundHandling.afterRoundPlayed's own signature stable as a single additional, optional parameter
// regardless of how many individual result surfaces this ends up covering.
export type HoldAndWinBaseRoundResult<T extends string | number | symbol = string> = {
    readonly winEvaluationResult: WinEvaluationResult<T>;
    readonly winningLines: Record<string, WinningLineDescribing<T>>;
    readonly winningScatters: Record<T, WinningScatterDescribing<T>>;
    readonly linesWinning: number;
    readonly scattersWinning: number;
};

// The safe fallback used whenever no HoldAndWinBaseRoundResult is available — either because a caller
// invoked HoldAndWinRoundHandling.afterRoundPlayed() via its legacy 2-argument shape (see that interface's
// own doc comment on why the 3rd parameter is optional, not required), or because a respin's own base
// result is always irrelevant regardless of what was actually passed in. Represents "nothing of the wrapped
// session's own result applies to this round" — never treated as "the wrapped session genuinely reported a
// zero win", which is exactly the same distinction "suppressed" already draws elsewhere in this package.
export function emptyHoldAndWinBaseRoundResult<T extends string | number | symbol = string>(): HoldAndWinBaseRoundResult<T> {
    return {
        winEvaluationResult: new WinEvaluationResult<T>(),
        winningLines: {},
        winningScatters: {} as Record<T, WinningScatterDescribing<T>>,
        linesWinning: 0,
        scattersWinning: 0,
    };
}
