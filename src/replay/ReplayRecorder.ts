import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {ReplayDescriptor} from "./ReplayDescriptor.js";
import type {ReplayRecording} from "./ReplayRecording.js";
import type {ReplayRecordingOptions} from "./ReplayRecordingOptions.js";

type SessionWithSymbolsCombination = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// There is no seek-to-round primitive in GameSessionHandling, so this replays a round best-effort by
// playing a fresh session forward from round 1 up to the requested round. Reproducibility for a given
// seed depends entirely on the game package actually threading context.seed into a deterministic setup.
export class ReplayRecorder implements ReplayRecording {
    public record(options: ReplayRecordingOptions): ReplayDescriptor {
        const {game, seed, round} = options;
        if (!Number.isInteger(round) || round < 1) {
            throw new Error(`round must be a positive integer, got ${round}.`);
        }

        const manifest = game.getManifest();
        const session = game.createSession(seed === undefined ? undefined : {seed});
        // A replay reconstructs a specific round, not risk of ruin — give the session a bankroll large
        // enough that reaching `round` is never cut short by running out of credits mid-replay.
        session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        const startedAt = Date.now();
        let totalBet = 0;
        let totalWin = 0;
        for (let played = 0; played < round; played++) {
            totalBet += session.getBet();
            session.play();
            totalWin += session.getWinAmount();
        }
        const durationMs = Date.now() - startedAt;

        return {
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            seed: seed ?? null,
            round,
            totalBet,
            totalWin,
            screen: this.captureScreen(session),
            timestamp: startedAt,
            durationMs,
        };
    }

    private captureScreen(session: GameSessionHandling): unknown[][] | null {
        if (!this.hasSymbolsCombination(session)) {
            return null;
        }
        return session.getSymbolsCombination().toMatrix();
    }

    private hasSymbolsCombination(session: GameSessionHandling): session is SessionWithSymbolsCombination {
        return typeof (session as Partial<SessionWithSymbolsCombination>).getSymbolsCombination === "function";
    }
}
