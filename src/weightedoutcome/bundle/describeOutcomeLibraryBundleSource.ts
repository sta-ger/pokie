import type {CanonicalOutcomeSourceDescriptor} from "../../pregenerated/CanonicalOutcomeSourceDescriptor.js";

// The canonical-outcome-source metadata for a POKIE-built outcome-library bundle — see
// CanonicalOutcomeSourceDescriptor's own doc comment for why this exists as an explicit, machine-readable fact
// rather than something a caller infers from OutcomeLibraryBundleReading's own method list. `streaming: true`
// because OutcomeLibraryBundleReading's own readOutcomeById/drawOutcome serve exactly one outcome via a small
// per-mode index plus a single byte-range read (see internal/readOutcomeAtByteRange.ts) — never every other
// outcome in the same mode. A plain function, not a class, since this fact never varies per bundle/mode: every
// native outcome-library bundle's own reader makes the identical promise.
export function describeOutcomeLibraryBundleSource(): CanonicalOutcomeSourceDescriptor {
    return {
        kind: "native",
        streaming: true,
        limitations: [
            "Serves already-computed outcomes exactly as built -- never re-derives or recovers the game model/blueprint that produced them.",
            "Draws are only ever atomic against this bundle's own current on-disk content -- a rebuild mid-read surfaces as a PreGeneratedOutcomeSourceConflictError, never a silently stale result.",
        ],
    };
}
