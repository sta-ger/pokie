import type {ExternalFileGenerationResult} from "./ExternalFileGenerationResult.js";
import type {ExternalExportDeliveryResult} from "./ExternalExportDeliveryResult.js";

// Optional transport contract: how an already-generated, already-validated ExternalFileGenerationResult
// actually reaches a target — local disk (see LocalFileExternalExportRuntimeConnector), an HTTP push, a
// message queue, or anything else. Deliberately separate from ExternalFileGenerator (which only ever
// produces artifacts in memory, see that interface's own doc comment) so the same generator can be reused
// unmodified across targets that differ only in how they publish the result.
//
// This package ships no runtime adapter beyond the local-filesystem example (see
// docs/external-adapter-sdk.md) — a live push to any specific RGS/aggregator is deliberately out of scope here;
// implement this interface directly for a real transport.
export interface ExternalExportRuntimeConnector {
    deliver(result: ExternalFileGenerationResult): Promise<ExternalExportDeliveryResult>;
}
