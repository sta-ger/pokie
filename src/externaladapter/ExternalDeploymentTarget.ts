import type {ExternalArtifactGenerator} from "./ExternalArtifactGenerator.js";
import type {ExternalArtifactValidator} from "./ExternalArtifactValidator.js";
import type {ExternalDeploymentCapability} from "./ExternalDeploymentCapability.js";
import type {ExternalDeploymentDiagnostic} from "./ExternalDeploymentDiagnostic.js";
import type {ExternalDeploymentRequirements} from "./ExternalDeploymentRequirements.js";
import type {ExternalDeploymentRuntimeAdapter} from "./ExternalDeploymentRuntimeAdapter.js";
import type {ExternalRoundProjector} from "./ExternalRoundProjector.js";

// One external deployment integration point — a specific external format/RGS-style consumer POKIE content can
// be deployed to. Bundles a target's own identity ("id"/"version") and declared contract
// ("requirements"/"capabilities", checked by ExternalDeploymentCompatibilityValidator before generation) with
// the collaborators that actually do the work ("roundProjector"/"artifactGenerator", plus the optional
// "artifactValidator"/"runtimeAdapter"/"diagnostic"). A target is a plain, stateless bundle of these — not
// itself required to be a class — so the simplest way to define one is a factory function returning an object
// literal (see local/createLocalJsonExternalDeploymentTarget.ts for a worked example) rather than a subclass.
//
// "id" is this target's own stable identifier (e.g. "acme-rgs-v2") — what ExternalDeploymentTargetRegistry
// keys registration on, and what it refuses to register twice, exactly or case-insensitively (see
// ExternalDeploymentTargetRegistry's own doc comment). "version" is this target integration's own version (its
// format/adapter version — independent of both "id" and the deployed content's own provenance.pokieVersion),
// surfaced for diagnostics/logging; POKIE places no constraint on its shape.
export interface ExternalDeploymentTarget<T extends string | number = string> {
    readonly id: string;
    readonly version: string;
    readonly requirements: ExternalDeploymentRequirements;
    readonly capabilities: readonly ExternalDeploymentCapability[];
    readonly roundProjector: ExternalRoundProjector<T>;
    readonly artifactGenerator: ExternalArtifactGenerator<T>;
    readonly artifactValidator?: ExternalArtifactValidator;
    readonly runtimeAdapter?: ExternalDeploymentRuntimeAdapter;
    readonly diagnostic?: ExternalDeploymentDiagnostic;
}
