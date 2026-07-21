import type {StakeEngineEvent} from "../StakeEngineEvent.js";

// One event's classification for standalone analysis purposes -- deliberately just an advisory "category" tag,
// not a structural role. Unlike StakeEngineRoundEventsImporting (which reconstructs POKIE's own reveal/win/
// finalWin step model and *requires* that exact vocabulary, failing the whole outcome otherwise), a foreign Stake
// Engine export can use any event vocabulary its own game defines -- categorization here only ever feeds
// StakeEngineStandaloneAnalyzer's eventClassificationBreakdown, never gates whether an outcome parses
// successfully, and never rejects an event it doesn't recognize.
export type StakeEngineEventClassification = {
    readonly category: string;
};

// Pluggable per-event classifier for standalone (no-manifest) Stake Engine analysis. Implement this directly for
// a foreign export's own mechanic-specific event vocabulary (e.g. "anticipation"/"tumble"/"multiplierApplied");
// StakeEngineStandardEventClassifier is only a reasonable default for a directory that happens to already speak
// POKIE's own reveal/win/finalWin convention (e.g. re-analyzing "pokie stakeengine export"'s own output through
// this standalone pipeline), never assumed for a genuinely foreign export.
export interface StakeEngineEventClassifying {
    classify(event: StakeEngineEvent): StakeEngineEventClassification;
}
