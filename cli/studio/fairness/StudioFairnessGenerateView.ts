import type {FairnessRoundProof} from "pokie";

// FairnessRoundProofBuilder.build's own two failure classes, kept distinct rather than collapsed into
// one "error" status: a "build-error" is a genuine domain-level rejection (revealed seed doesn't match
// its own commitment, or the live bundle drifted from what the commitment pinned) and carries the
// builder's own error code, the same code a certifier would see from `pokie fairness verify`-adjacent
// tooling; a "load-error" is Studio-local plumbing (an unreadable/out-of-project bundle path).
export type StudioFairnessGenerateView =
    | {readonly status: "ok"; readonly proof: FairnessRoundProof}
    | {readonly status: "build-error"; readonly code: string; readonly message: string}
    | {readonly status: "load-error"; readonly error: string};
