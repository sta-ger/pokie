import {WinComponent} from "../../session/videoslot/winevaluation/WinComponent.js";

// The metadata key StakeEngineImportSyntheticWinComponent stamps onto every win it produces — the public,
// documented way to tell a reconstructed win apart from a real one downstream (see docs/stake-engine-import.md).
export const STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY = "stakeEngineImportSynthetic";

// Stake Engine's own export format only ever preserves one aggregate win amount per step (see
// StakeEngineRoundEventsProjector) — the real per-round win breakdown (individual line/cluster wins, positions,
// multiplier breakdowns) is discarded by design and can never be recovered on import. But RoundArtifactValidator/
// buildRoundStepArtifact both require totalWin to exactly equal the sum of wins[].winAmount (confirmed: there is
// no way to construct a valid step with totalWin > 0 and empty wins) — so reconstructing an artifact from Stake
// data needs exactly one placeholder win component per step carrying just the recovered amount.
//
// Neither buildRoundStepArtifact nor RoundArtifactValidator cross-check winningPositions/symbolId against the
// step's own screen (confirmed) — so winningPositions is deliberately left empty here rather than inventing
// positions that were never real, and symbolId is whatever the caller supplies (StakeEngineImporter passes the
// reconstructed screen's own first symbol, since it's always a valid, defined T). This is never mistaken for a
// real win: metadata always carries `{[STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY]: true}`.
export class StakeEngineImportSyntheticWinComponent<T extends string | number = string> extends WinComponent<T> {
    constructor(symbolId: T, winAmount: number) {
        super("value", "stakeEngineImportSynthetic", symbolId, winAmount, [], [], {[STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY]: true});
    }
}
