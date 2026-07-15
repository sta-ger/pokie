import type {JsonObject} from "../json/JsonValue.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";

// What one ExternalDeploymentRuntimeAdapter.deliver() call reports back. "details" is an open, target-specific
// bag (a written path, a remote response id, ...) — never interpreted by the SDK itself, only surfaced to the
// caller. "issues" is for a delivery that still succeeded overall but hit a purely cosmetic problem along the
// way (e.g. LocalFileExternalDeploymentRuntimeAdapter's own stale-backup cleanup failing after an otherwise
// successful atomic publish — see atomicallyWriteExternalDeploymentArtifactsToDirectory) — never for anything
// that would mean delivery itself failed; a hard failure is still a rejected Promise, not a "delivered: true"
// with error-severity issues attached.
export type ExternalDeploymentDeliveryResult = {
    readonly delivered: boolean;
    readonly details?: JsonObject;
    readonly issues?: readonly ValidationIssue[];
};
