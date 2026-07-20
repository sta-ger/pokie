import type {SimulationReport} from "./SimulationReport.js";

// The result of "pokie sim --mode all": one independent SimulationReport per bet mode the game
// declares (see PokieGame.getBetModes()), each built through the exact same pipeline as
// "pokie sim --mode <id>" -- no math is duplicated here, this is purely a bundle.
//
// Deliberately carries NO blended/combined RTP, totalBet, totalWin, or any other "overall across
// modes" figure: without knowing real traffic/player-selection weights (what share of players actually
// pick each mode), any single blended number would be a made-up average, not a real statistic — see
// docs/cli.md. Compare modes side by side instead (see the comparison table pokie report renders for
// this shape), or compute a real weighted figure yourself once you have real weights.
export type SimulationReportSet = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    seed: string | null;
    workers?: number;
    // Keyed by bet mode id, in the same order PokieGame.getBetModes() declared them.
    modes: Record<string, SimulationReport>;
};
