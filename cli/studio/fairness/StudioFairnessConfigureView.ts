import type {FairnessCommitment, FairnessServerSeedCommitment} from "pokie";

// The Provably Fair tab's "Configure" step -- computes both commit-reveal artifacts a real round would
// publish in sequence (server seed commitment first, before clientSeed/nonce are even solicited; the
// full commitment next, before the outcome is drawn), so the user can inspect both at once rather than
// running two separate requests. Never a live negotiation -- an honest, side-by-side preview of what
// each step of the real protocol would publish (see docs/provably-fair.md).
export type StudioFairnessConfigureView =
    | {readonly status: "ok"; readonly serverSeedCommitment: FairnessServerSeedCommitment; readonly commitment: FairnessCommitment}
    | {readonly status: "invalid"; readonly message: string}
    | {readonly status: "load-error"; readonly error: string};
