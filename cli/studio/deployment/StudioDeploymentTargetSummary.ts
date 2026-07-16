import type {ExternalDeploymentCapability, ExternalDeploymentRequirements} from "pokie";

// GET /api/project/deployment/targets' own DTO — one row per registered ExternalDeploymentTarget.
// Deliberately omits roundProjector/artifactGenerator/artifactValidator/runtimeAdapter/diagnostic:
// those are live collaborator instances (functions), never JSON-safe and never meaningful to a
// browser client — only a target's own declared identity/contract is ever surfaced here.
export type StudioDeploymentTargetSummary = {
    readonly id: string;
    readonly version: string;
    readonly requirements: ExternalDeploymentRequirements;
    readonly capabilities: readonly ExternalDeploymentCapability[];
};
