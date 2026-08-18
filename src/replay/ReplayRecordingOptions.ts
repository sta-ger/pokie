import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";
import type {PreGeneratedRoundReplayDescriptor} from "../pregenerated/PreGeneratedRoundReplayDescriptor.js";

export type ReplayRecordingOptions = {
    game: PokieGame;
    seed?: string;
    round: number;
};

// The canonical recorder input for an outcome-library round that was selected and settled by the
// pre-generated serving path.  It intentionally carries the settled provenance rather than a PokieGame:
// native libraries have no game-model session to replay, and creating one here would regenerate math.
export type PreGeneratedReplayRecordingOptions = {
    sessionId: string;
    game: PokieGameManifest;
    replay: PreGeneratedRoundReplayDescriptor;
    totalBet: number;
    credits?: number;
    screen: unknown[][] | null;
};
