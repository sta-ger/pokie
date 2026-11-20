import type {ExternalFileGenerator} from "./ExternalFileGenerator.js";
import type {ExternalFileValidator} from "./ExternalFileValidator.js";
import type {ExternalExportCapability} from "./ExternalExportCapability.js";
import type {ExternalExportDiagnostic} from "./ExternalExportDiagnostic.js";
import type {ExternalExportRequirements} from "./ExternalExportRequirements.js";
import type {ExternalExportRuntimeConnector} from "./ExternalExportRuntimeConnector.js";
import type {ExternalRoundProjector} from "./ExternalRoundProjector.js";

// One external deployment integration point — a specific external format/RGS-style consumer POKIE content can
// be deployed to. Bundles a target's own identity ("id"/"version") and declared contract
// ("requirements"/"capabilities", checked by ExternalExportCompatibilityValidator before generation) with
// the collaborators that actually do the work ("roundProjector"/"fileGenerator", plus the optional
// "fileValidator"/"runtimeConnector"/"diagnostic"). A target is a plain, stateless bundle of these — not
// itself required to be a class — so the simplest way to define one is a factory function returning an object
// literal (see local/createLocalJsonExternalExportTarget.ts for a worked example) rather than a subclass.
//
// "id" is this target's own stable identifier (e.g. "acme-rgs-v2") — what ExternalExportTargetRegistry
// keys registration on, and what it refuses to register twice, exactly or case-insensitively (see
// ExternalExportTargetRegistry's own doc comment). "version" is this target integration's own version (its
// format/connector version — independent of both "id" and the deployed content's own origin.pokieVersion),
// surfaced for diagnostics/logging; POKIE places no constraint on its shape.
// "fileGenerator" is deliberately not generic over T (unlike "roundProjector") — see
// ExternalFileGenerator's own doc comment: generation only ever runs after ExternalExportService has
// already projected every RoundRecord<T> into plain JSON, so nothing generic-over-T ever reaches it.
export interface ExternalExportTarget<T extends string | number = string> {
    readonly id: string;
    readonly version: string;
    readonly requirements: ExternalExportRequirements;
    readonly capabilities: readonly ExternalExportCapability[];
    readonly roundProjector: ExternalRoundProjector<T>;
    readonly fileGenerator: ExternalFileGenerator;
    readonly fileValidator?: ExternalFileValidator;
    readonly runtimeConnector?: ExternalExportRuntimeConnector;
    readonly diagnostic?: ExternalExportDiagnostic;
}
