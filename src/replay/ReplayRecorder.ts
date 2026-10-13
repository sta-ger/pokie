import {buildRoundArtifactFromSession} from "../artifact/buildRoundArtifactFromSession.js";
import {PokieJsonRoundArtifactProjector} from "../artifact/PokieJsonRoundArtifactProjector.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import {captureScreen} from "../server/session/captureScreen.js";
import {executeSessionCommand} from "../runtime/SessionRuntime.js";
import crypto from "crypto";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {ReplayDescriptor} from "./ReplayDescriptor.js";
import type {PreGeneratedReplayRecording, ReplayRecording} from "./ReplayRecording.js";
import type {PreGeneratedReplayRecordingOptions, ReplayRecordingOptions} from "./ReplayRecordingOptions.js";

type SessionWithSymbolsCombination = GameSessionHandling & {
    getSymbolsCombination(): {toMatrix(transposed?: boolean): unknown[][]};
};

// There is no seek-to-round primitive in GameSessionHandling, so this replays a round best-effort by
// playing a fresh session forward from round 1 up to the requested round. Reproducibility for a given
// seed depends entirely on the game package actually threading context.seed into a deterministic setup.
export class ReplayRecorder implements ReplayRecording, PreGeneratedReplayRecording {
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
            if (!session.canPlayNextGame()) {
                throw new Error(`Replay target round ${round} is unreachable: session stopped after ${played} round(s).`);
            }
            const result = executeSessionCommand(session);
            totalBet += result.stake;
            totalWin += result.win;
        }
        const durationMs = Date.now() - startedAt;
        const slot = session as Partial<VideoSlotSessionHandling>;
        const artifact = slot.getScreenGeometry?.() && slot.getWinEvaluationResult
            ? new PokieJsonRoundArtifactProjector().project(buildRoundArtifactFromSession(slot as VideoSlotSessionHandling, {
                roundId: `replay:${seed ?? "no-seed"}:${round}`, provenance: {game: manifest, pokieVersion: "1.3.0", ...(game.getConfigHash ? {configHash: game.getConfigHash()} : {})},
            })) : undefined;

        return {
            sessionId: crypto.randomUUID(),
            game: {id: manifest.id, name: manifest.name, version: manifest.version},
            seed: seed ?? null,
            round,
            totalBet,
            totalWin,
            screen: this.captureScreen(session),
            ...(artifact ? {artifact} : {}),
            timestamp: startedAt,
            durationMs,
        };
    }

    // Records an already-settled native Outcome Library round in the standard ReplayDescriptor shape.
    // Unlike record(), this never creates a game session or calls play(): the supplied artifact/provenance
    // is the authoritative math result and the outcomeSource field preserves how it was selected.
    public recordPreGenerated(options: PreGeneratedReplayRecordingOptions): ReplayDescriptor {
        const {sessionId, game, replay, totalBet, credits, screen} = options;
        return {
            sessionId,
            game,
            seed: replay.seed,
            round: replay.round,
            totalBet,
            totalWin: replay.totalWin,
            ...(credits === undefined ? {} : {credits}),
            screen,
            timestamp: replay.timestamp,
            durationMs: replay.durationMs,
            outcomeSource: replay,
        };
    }

    private captureScreen(session: GameSessionHandling): unknown[][] | null {
        if (!this.hasSymbolsCombination(session)) {
            return null;
        }
        return captureScreen(session);
    }

    private hasSymbolsCombination(session: GameSessionHandling): session is SessionWithSymbolsCombination {
        return typeof (session as Partial<SessionWithSymbolsCombination>).getSymbolsCombination === "function";
    }
}
