import type {StudioDeploymentTargetSummary, StudioProjectCapability} from "../../api/types";
import {describeTargetCapability, describeTargetRequirements, LOCAL_JSON_EXAMPLE_TARGET_ID} from "./Deployment";
import {BLUEPRINT_BUILD_CAPABILITY, RUNTIME_EXECUTE_CAPABILITY} from "./ProjectDashboard";

// Pure view-model for the shared Build/Export shell (see ExportDeployTab) -- the sole Studio surface a
// project's outputs are built/published from. It classifies, but never merges, the three backend
// pipelines this Studio actually has (Stake Engine Export's own static exporter, the outcome-library
// generator/registry, and the External Adapter SDK's own registered-target pipeline). Stake Engine
// Export still runs through StudioStakeEngineExportService/the StakeEngineExportTab unchanged, outcome-
// library generation still runs through StudioOutcomeLibraryGenerateService/the OutcomeLibrariesTab
// unchanged, and every registered ExternalDeploymentTarget still runs through useDeploymentManager/the
// DeploymentTab unchanged. See docs/external-adapter-sdk.md's own "Why Stake Engine Export isn't an
// ExternalDeploymentTarget" -- that split is confirmed structural, not an oversight this shell should
// paper over, so this module only ever *describes* those pipelines' existing targets side by side, it
// never routes one through another's registry.
export type ExportDeployTargetKind = "staticExport" | "outcomeLibrary" | "localAdapter" | "remoteDeployment";

export type ExportDeployTargetCard = {
    readonly kind: ExportDeployTargetKind;
    readonly id: string;
    readonly label: string;
    readonly adapter: string;
    readonly version: string;
    readonly purpose: string;
    readonly destination: string;
    readonly writePublishBehavior: string;
    readonly capabilities: readonly string[];
    readonly limits: readonly string[];
    readonly prerequisites: readonly string[];
    readonly locality: "local" | "remote";
    readonly compatibility: string;
    // The registered ExternalDeploymentTarget this card describes -- present only for "localAdapter"/
    // "remoteDeployment" cards, so ExportDeployTab can pre-select it (useDeploymentManager.selectTarget)
    // before navigating to the Deployment tab. "staticExport"'s own Stake Engine Export tab has no
    // registry-backed selection to make -- it's reached directly, with nothing to pre-select.
    readonly deploymentTarget?: StudioDeploymentTargetSummary;
};

// Mirrors STAKE_ENGINE_MANIFEST_SCHEMA_VERSION (src/stakeengine/StakeEngineManifest.ts) as a plain literal
// -- studio-client never imports the pokie package directly (unlike the Studio server), and Stake Engine
// Export's own format/version is fixed and known before any run, unlike a registered
// ExternalDeploymentTarget's own (dynamic, server-reported) version below.
const STAKE_ENGINE_MANIFEST_SCHEMA_VERSION = 1;

const STAKE_ENGINE_EXPORT_CARD: ExportDeployTargetCard = {
    kind: "staticExport",
    id: "stakeengine-export",
    label: "Stake Engine Export",
    adapter: "Stake Engine math-sdk static file format",
    version: `manifest schema v${STAKE_ENGINE_MANIFEST_SCHEMA_VERSION}`,
    purpose:
        "Exports one or more bet modes' canonical outcome libraries to the real Stake Engine math-sdk static file format -- the first static export target POKIE ships.",
    destination: "A local output directory: index.json, a per-mode lookup CSV, per-mode zstd-compressed books, and a sibling pokie-manifest.json.",
    writePublishBehavior:
        "Export writes the whole bundle to disk in one atomic swap (an existing directory is only replaced once every file has been generated); Validate diagnostics runs the same checks first without writing anything.",
    capabilities: [
        "Multiple bet modes, each with its own cost, published together as one atomic bundle",
        "Feature events and debug metadata carried through from the source outcome library",
        "A pokie-manifest.json provenance file alongside Stake's own strict index.json",
    ],
    limits: [
        "Every outcome id must already be a valid Stake Engine integer id",
        "Every mode in one export must come from the same game build (id, version, config)",
        "Every payout amount must be exactly representable in Stake's integer unit convention",
    ],
    prerequisites: ["A canonical outcome library file per mode", "A positive cost for every mode", "An output directory to write to"],
    locality: "local",
    compatibility:
        "A deliberately separate, sibling pipeline to the External Adapter SDK -- not built on the ExternalDeploymentTarget contract, so it never competes with (or is limited by) a registered adapter's own requirements.",
};

// The outcome-library generator/registry, described as a build target in its own right -- generating (or
// selecting) a canonical outcome library is the one build step every other target on this page ultimately
// reads from (a Deployment mode, a Stake Engine Export mode, and this card's own Registry all discover
// against the same bundle), so it belongs in this list rather than only being reachable as a side-effect
// of configuring one of the others.
const OUTCOME_LIBRARY_CARD: ExportDeployTargetCard = {
    kind: "outcomeLibrary",
    id: "outcome-library",
    label: "Outcome library generator",
    adapter: "pokie's own weighted-outcome-library generator",
    version: "--",
    purpose:
        "Generates (or selects) a canonical outcome library from this project's own current build -- the source content every other target on this page deploys/exports from.",
    destination: "A local bundle directory registered for this project (outcomelibrary by default, or a custom directory) -- nothing is deployed or exported externally.",
    writePublishBehavior: "Generate writes the bundle to disk and registers it for discovery; Select/Validate/Inspect never write anything.",
    capabilities: ["Exact or bounded-sample generation, whichever the game's own mechanic supports", "Registry discovery by mode name for every other target on this page"],
    limits: [],
    prerequisites: ["A built, runnable package for this project"],
    locality: "local",
    compatibility: "Read by Deployment and Stake Engine Export alike -- generating or fixing a library here is reflected the next time either target's own Configure step looks it up.",
};

function describeExternalAdapterTargetCard(target: StudioDeploymentTargetSummary): ExportDeployTargetCard {
    const isLocalExample = target.id === LOCAL_JSON_EXAMPLE_TARGET_ID;
    return {
        kind: isLocalExample ? "localAdapter" : "remoteDeployment",
        id: target.id,
        label: `External Adapter: ${target.id}`,
        adapter: isLocalExample ? "External Adapter SDK local-filesystem example target" : "External Adapter SDK registered target",
        version: target.version,
        purpose: isLocalExample
            ? "The External Adapter SDK's own ready-to-run example target -- exercises registration, compatibility checking, generation, and delivery end to end against a real local directory."
            : "A registered ExternalDeploymentTarget -- deploys a canonical outcome library to this external format/RGS-style consumer via pokie's own External Adapter SDK.",
        destination: isLocalExample
            ? `A local directory under this project's own deployment/${target.id} output folder`
            : "Wherever this target's own runtime adapter delivers to -- not necessarily local to this machine.",
        writePublishBehavior:
            "Preview runs the full pipeline (compatibility check, projection, generation, artifact validation, target diagnostic) without writing; Deploy additionally publishes the generated artifacts to the target's own output location.",
        capabilities: target.capabilities.length > 0 ? target.capabilities.map(describeTargetCapability) : ["No optional capabilities declared."],
        limits: describeTargetRequirements(target.requirements),
        prerequisites: ["One canonical outcome library file per deployment mode", "A reachable target diagnostic before Deploy is offered"],
        locality: isLocalExample ? "local" : "remote",
        compatibility:
            "Checked by ExternalDeploymentCompatibilityValidator before any artifact is generated -- an incompatible mode is rejected up front, never partially deployed.",
        deploymentTarget: target,
    };
}

// One future-extension-point placeholder shown whenever no registered target classifies as "remote" --
// keeps the Remote deployment group visible (and honest that it's currently empty) instead of omitting
// it, since this shell's own contract is to classify Static export, Local adapter *and* Remote
// deployment even before a real remote adapter is registered.
const REMOTE_DEPLOYMENT_PLACEHOLDER_CARD: ExportDeployTargetCard = {
    kind: "remoteDeployment",
    id: "remote-deployment-placeholder",
    label: "Remote deployment (none registered yet)",
    adapter: "External Adapter SDK",
    version: "--",
    purpose: "Reserved for a real remote RGS/aggregator integration -- register an ExternalDeploymentTarget with a remote runtimeAdapter to add one.",
    destination: "Not yet registered.",
    writePublishBehavior: "Not applicable until a remote target is registered.",
    capabilities: [],
    limits: [],
    prerequisites: ["Register an ExternalDeploymentTarget for this project's deployment registry (see docs/external-adapter-sdk.md)."],
    locality: "remote",
    compatibility: "Once registered, goes through the same ExternalDeploymentCompatibilityValidator contract every other target already does.",
};

// Every builder on this page ultimately runs against this project's own current build (see
// OUTCOME_LIBRARY_CARD/STAKE_ENGINE_EXPORT_CARD/describeExternalAdapterTargetCard's own doc comments) --
// the same RUNTIME_CAPABLE_CAPABILITIES gate ProjectDashboardPage already applies to the whole "Build/
// Export" tab, duplicated here (rather than trusted implicitly) so this module's own card list is
// self-consistent even if a future caller ever renders it without that outer gate.
function canBuildFromCurrentProject(capabilities: readonly StudioProjectCapability[]): boolean {
    return capabilities.includes(BLUEPRINT_BUILD_CAPABILITY) || capabilities.includes(RUNTIME_EXECUTE_CAPABILITY);
}

// Builds the shell's own card list from the live registered-target list (StudioDeploymentTargetSummary[],
// exactly what useDeploymentManager.targetsView already carries) and the resolved project's own
// capabilities -- Outcome libraries and Stake Engine Export's cards, plus every adapter-backed card
// (registered target or the remote-deployment placeholder), are only ever shown for a project this Studio
// can actually build/run (see canBuildFromCurrentProject above); one card per registered target classifies
// as "localAdapter" (the SDK's own local-json-example) or "remoteDeployment" (anything else -- a future
// adapter's extension point), and the placeholder above fills the "Remote deployment" group only while it
// would otherwise be empty.
export function describeExportDeployTargetCards(
    deploymentTargets: readonly StudioDeploymentTargetSummary[],
    capabilities: readonly StudioProjectCapability[],
): ExportDeployTargetCard[] {
    if (!canBuildFromCurrentProject(capabilities)) {
        return [];
    }
    const adapterCards = deploymentTargets.map(describeExternalAdapterTargetCard);
    const hasRemoteTarget = adapterCards.some((card) => card.kind === "remoteDeployment");
    return [OUTCOME_LIBRARY_CARD, STAKE_ENGINE_EXPORT_CARD, ...adapterCards, ...(hasRemoteTarget ? [] : [REMOTE_DEPLOYMENT_PLACEHOLDER_CARD])];
}
