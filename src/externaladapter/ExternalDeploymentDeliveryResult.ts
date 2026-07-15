import type {JsonObject} from "../json/JsonValue.js";

// What one ExternalDeploymentRuntimeAdapter.deliver() call reports back. "details" is an open, target-specific
// bag (a written path, a remote response id, ...) — never interpreted by the SDK itself, only surfaced to the
// caller.
export type ExternalDeploymentDeliveryResult = {
    readonly delivered: boolean;
    readonly details?: JsonObject;
};
