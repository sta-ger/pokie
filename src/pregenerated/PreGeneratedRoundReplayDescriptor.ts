// The pre-generated counterpart to replay/ReplayDescriptor: what PreGeneratedRoundReplayer reproduces
// for a given (library, seed, round) — deliberately narrower than a full PreGeneratedRoundResult (no
// runtime/wallet/session facts to reproduce, since none of those participate in the deterministic
// selection itself).
import type {RoundArtifact} from "../artifact/RoundArtifact.js";

// `selectionAlgorithm` is durable provenance, rather than an implementation detail.  In particular,
// a seeded stream and a seed derived per round are both deterministic, but they are not interchangeable.
export type PreGeneratedRoundReplayDescriptor = {
    // The bundle manifest identity is additive so older portable descriptors remain inspectable.
    // When supplied, exact replay verifies it before claiming reproduction.
    readonly game?: {id: string; name: string; version: string};
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly modeName: string;
    readonly selectionAlgorithm: "derived-round-seed-v1";
    readonly seed: string;
    readonly round: number;
    readonly outcomeId: string;
    readonly weight: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number;
    // Current producers always persist these fields. They remain optional only so an older saved
    // descriptor can be inspected; absence is not an exact-comparison success.
    readonly stake?: number;
    readonly screen?: unknown[][];
    readonly artifact?: RoundArtifact<string | number>;
    readonly timestamp: number;
    readonly durationMs: number;
};
