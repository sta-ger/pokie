import type {PreGeneratedRoundInternalView} from "../../pregenerated/PreGeneratedRoundInternalView.js";
import type {PreGeneratedRoundPublicView} from "../../pregenerated/PreGeneratedRoundPublicView.js";
import type {PreGeneratedRoundReplayDescriptor} from "../../pregenerated/PreGeneratedRoundReplayDescriptor.js";
import type {SessionCapturePolicy} from "../session/SessionCapturePolicy.js";

// The persisted/audit representation of a served outcome-library round.  It deliberately keeps the
// client-safe projection and deterministic replay descriptor even under the production "partial"
// policy, while the complete canonical artifact/runtime provenance is retained only by "full" capture.
// Nothing here is reconstructed from game math: every field is projected directly from the selected
// PreGeneratedRoundResult that PreGeneratedSpinCommandHandler has already settled.
export type PreGeneratedRoundRecord<T extends string | number = string> = {
    readonly sessionId: string;
    readonly roundId: string;
    readonly round: number;
    readonly publicView: PreGeneratedRoundPublicView<T>;
    readonly stake: number;
    readonly replay: PreGeneratedRoundReplayDescriptor;
    readonly capturePolicy: SessionCapturePolicy;
    readonly internal?: PreGeneratedRoundInternalView<T>;
};
