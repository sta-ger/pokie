import type {StudioArtifactTargetType, StudioArtifactTargetView, StudioDeploymentTargetSummary, StudioProjectCapability} from "../../api/types";
import {describeTargetCapability, describeTargetRequirements, LOCAL_JSON_EXAMPLE_TARGET_ID} from "./Deployment";
import {BLUEPRINT_BUILD_CAPABILITY, OUTCOME_LIBRARY_READ_CAPABILITY, RUNTIME_EXECUTE_CAPABILITY} from "./ProjectDashboard";

// Pure view-model for the shared Build/Export shell (see ExportDeployTab) -- the sole Studio surface a
// project's outputs are built/published from. It classifies, but never merges, the four backend pipelines
// this Studio actually has (Stake Engine Export's own static exporter, the outcome-library
// generator/registry, ArtifactBuilderRegistry's own "pokie build <project> --target <target>" conversions,
// and the External Adapter SDK's own registered-target pipeline). Stake Engine Export still runs through
// StudioStakeEngineExportService unchanged, outcome-library generation still runs through
// StudioOutcomeLibraryGenerateService unchanged, every "buildArtifact" card runs through
// StudioArtifactBuildService/ArtifactBuilderRegistry directly (see describeArtifactBuildTargetCards below
// and StudioArtifactBuildService's own doc comment for why that's a genuinely separate operation from the
// first two, not a duplicate of either), and every registered ExternalDeploymentTarget still runs through
// useDeploymentManager unchanged -- ExportDeployTab runs each of those pipelines directly (see its own
// doc comment), but this module's own job is unchanged: it only ever *describes* those pipelines' existing
// targets side by side, it never routes one through another's registry. See docs/external-adapter-sdk.md's
// own "Why Stake Engine Export isn't an ExternalDeploymentTarget" -- that split is confirmed structural,
// not an oversight this shell should paper over.
//
// Every card here is only ever offered once this project's own resolved capabilities/ProjectType actually
// grant what it needs -- see canGenerateOutcomeLibrary/canReachCanonicalOutcomeLibrary and
// describeArtifactBuildTargetCards's own `supported` filter below -- rather than one blanket "this Studio
// can build/run something" bit gating the whole page regardless of which pipeline a capability actually
// corresponds to. The External Adapter SDK's own bundled local-json-example demo target is never described
// as a card at all, on any project (see LOCAL_JSON_EXAMPLE_TARGET_ID's own doc comment) -- it exists to
// exercise the SDK end to end, not as a real deployment pipeline this page should ever present alongside
// genuine registered targets.
export type ExportDeployTargetKind = "staticExport" | "outcomeLibrary" | "buildArtifact" | "remoteDeployment";

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
    // The registered ExternalDeploymentTarget this card describes -- present only for "remoteDeployment"
    // cards backed by a real registered target (never the placeholder), so ExportDeployTab can run
    // deployment.run(publish, card.deploymentTarget) directly against it.
    readonly deploymentTarget?: StudioDeploymentTargetSummary;
    // The ArtifactBuilderRegistry target this card describes -- present only for "buildArtifact" cards, so
    // ExportDeployTab can run buildArtifact(fetchImpl, card.artifactTarget) directly against it.
    readonly artifactTarget?: StudioArtifactTargetType;
};

// Short, presentation-only prose per ArtifactBuilderRegistry target -- mirrors the exact same
// tsPackage/outcomeLibrary/stakeAdapter/parWorkbook/wasm vocabulary and semantics
// ArtifactBuilderRegistry.describe() itself already reports (see ArtifactBuilderRegistry.ts's own
// UNSUPPORTED_NOTES), restated here only as a label/one-line purpose for this card -- never a second,
// independently-decided description of what building a target does or doesn't do. "wasm" is never actually
// reachable as a card (ArtifactBuilderRegistry reports it as supported by no ProjectType today -- see
// ArtifactBuilderRegistry's own "wasm" doc comment), but is listed here for the same exhaustiveness reason
// GROUP_LABELS below covers every ExportDeployTargetKind.
const ARTIFACT_TARGET_CARD_INFO: Readonly<Record<StudioArtifactTargetType, {label: string; purpose: string; destination: string}>> = {
    tsPackage: {
        label: "TypeScript Game Package",
        purpose: "Builds a runnable tsPackage from this project's own GameBlueprint source -- the same conversion \"pokie build --target tsPackage\" runs.",
        destination: "A new package directory (default: a \"tsPackage\" sibling of this project).",
    },
    outcomeLibrary: {
        label: "Outcome library (republish)",
        purpose: "Republishes this project's own already-computed outcome library bundle to a new location -- never re-derives it from a game (see the Outcome libraries group above for that).",
        destination: "A new bundle directory (default: an \"outcomeLibrary\" sibling of this project).",
    },
    stakeAdapter: {
        label: "Stake Engine export (republish)",
        purpose: "Republishes this project's own already-exported Stake Engine bundle to a new location -- never re-derives it from an outcome library (see the Static export group above for that).",
        destination: "A new export directory (default: a \"stakeAdapter\" sibling of this project).",
    },
    parWorkbook: {
        label: "PAR sheet (.xlsx)",
        purpose: "Republishes this project's own already-loaded PAR sheet to a new .xlsx workbook file -- never derives one from a package/blueprint.",
        destination: "A new .xlsx file (default: \"parWorkbook.xlsx\" next to this project).",
    },
    wasm: {
        label: "WASM",
        purpose: "No builder is registered for this target today -- no ProjectType grants the capability it requires.",
        destination: "Not available.",
    },
};

// Builds one card per ArtifactBuilderRegistry target the active project's own resolved ProjectType
// actually supports (`supported`, computed server-side by StudioArtifactBuildService.listTargets -- the
// same registry.supportsConversionFrom() check "pokie build" itself runs) -- an unsupported target is
// filtered out entirely rather than rendered disabled, same convention as every other group on this page.
export function describeArtifactBuildTargetCards(targets: readonly StudioArtifactTargetView[]): ExportDeployTargetCard[] {
    return targets
        .filter((entry) => entry.supported)
        .map((entry) => {
            const info = ARTIFACT_TARGET_CARD_INFO[entry.target];
            return {
                kind: "buildArtifact",
                id: `artifact-${entry.target}`,
                label: info.label,
                adapter: 'ArtifactBuilderRegistry ("pokie build")',
                version: "--",
                purpose: info.purpose,
                destination: info.destination,
                writePublishBehavior:
                    "A registry-backed preview reports the resolved destination (and any conflict) before Build is ever clicked; Build itself still writes the artifact to disk in one step, and a destination that already exists and isn't empty is refused untouched.",
                capabilities: [],
                limits: entry.unsupportedNotes,
                prerequisites: [],
                locality: "local",
                compatibility: `The exact same ArtifactBuilderRegistry conversion "pokie build <project> --target ${entry.target}" runs -- CLI and Studio always agree on what's buildable and what it writes.`,
                artifactTarget: entry.target,
            };
        });
}

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
    compatibility:
        "Read by every remote deployment target and Stake Engine Export alike -- generating or fixing a library here is reflected the next time either target's own Configure step looks it up.",
};

// Every registered target still standing once the SDK's own local-json-example demo has been filtered out
// (see describeExportDeployTargetCards below) is inherently "remote" from this Studio's own point of
// view -- its own runtime adapter is what actually delivers it, wherever that turns out to be -- and there
// is no other, non-demo signal in this data model to call one "local" instead.
function describeExternalAdapterTargetCard(target: StudioDeploymentTargetSummary): ExportDeployTargetCard {
    return {
        kind: "remoteDeployment",
        id: target.id,
        label: `External Adapter: ${target.id}`,
        adapter: "External Adapter SDK registered target",
        version: target.version,
        purpose: "A registered ExternalDeploymentTarget -- deploys a canonical outcome library to this external format/RGS-style consumer via pokie's own External Adapter SDK.",
        destination: "Wherever this target's own runtime adapter delivers to -- not necessarily local to this machine.",
        writePublishBehavior:
            "Preview runs the full pipeline (compatibility check, projection, generation, artifact validation, target diagnostic) without writing; Deploy additionally publishes the generated artifacts to the target's own output location.",
        capabilities: target.capabilities.length > 0 ? target.capabilities.map(describeTargetCapability) : ["No optional capabilities declared."],
        limits: describeTargetRequirements(target.requirements),
        prerequisites: ["One canonical outcome library file per deployment mode", "A reachable target diagnostic before Deploy is offered"],
        locality: "remote",
        compatibility:
            "Checked by ExternalDeploymentCompatibilityValidator before any artifact is generated -- an incompatible mode is rejected up front, never partially deployed.",
        deploymentTarget: target,
    };
}

// One future-extension-point placeholder shown whenever no registered (non-demo) target exists yet --
// keeps the Remote deployment group visible (and honest that it's currently empty) instead of omitting
// it, since this shell's own contract is to classify Static export, Outcome library and Remote deployment
// even before a real remote adapter is registered.
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

// Whether this project can generate a brand-new canonical outcome library from its own current build --
// what the outcome-library generator card itself requires. A "blueprint" project never carries
// RUNTIME_EXECUTE_CAPABILITY itself, but Studio always materializes it into a runnable tsPackage before
// ever loading it (see RUNTIME_EXECUTE_CAPABILITY's own doc comment), so BLUEPRINT_BUILD_CAPABILITY is an
// equally sufficient signal here -- mirrors ProjectDashboardPage's own RUNTIME_CAPABLE_CAPABILITIES gate
// for the tab as a whole.
function canGenerateOutcomeLibrary(capabilities: readonly StudioProjectCapability[]): boolean {
    return capabilities.includes(BLUEPRINT_BUILD_CAPABILITY) || capabilities.includes(RUNTIME_EXECUTE_CAPABILITY);
}

// Whether this project can reach *some* canonical outcome library -- either by generating a fresh one
// (see canGenerateOutcomeLibrary above) or because it already *is* one (OUTCOME_LIBRARY_READ_CAPABILITY,
// granted only to a resolved "outcomeLibrary" project -- see PROJECT_TYPE_CAPABILITIES). Static export and
// every adapter card only ever *read* an existing canonical library (see their own "prerequisites"), so
// unlike the generator card above, they don't themselves need this project to be buildable/runnable --
// an already-read-only outcome-library project can still export/deploy the library it already is, even
// though it can never generate a fresh one itself.
function canReachCanonicalOutcomeLibrary(capabilities: readonly StudioProjectCapability[]): boolean {
    return canGenerateOutcomeLibrary(capabilities) || capabilities.includes(OUTCOME_LIBRARY_READ_CAPABILITY);
}

// Builds the shell's own card list from the live registered-target list (StudioDeploymentTargetSummary[],
// exactly what useDeploymentManager.targetsView already carries) and the resolved project's own
// capabilities -- each group is only ever included once this project's own capabilities actually grant
// what that group needs (see canGenerateOutcomeLibrary/canReachCanonicalOutcomeLibrary above), never as an
// all-or-nothing bundle. The SDK's own local-json-example demo target is filtered out before any adapter
// card is built, on every project, regardless of capabilities -- every genuinely registered target left
// classifies as "remoteDeployment", and the placeholder above fills that group only while it would
// otherwise be empty.
export function describeExportDeployTargetCards(
    deploymentTargets: readonly StudioDeploymentTargetSummary[],
    capabilities: readonly StudioProjectCapability[],
): ExportDeployTargetCard[] {
    const cards: ExportDeployTargetCard[] = [];
    if (canGenerateOutcomeLibrary(capabilities)) {
        cards.push(OUTCOME_LIBRARY_CARD);
    }
    if (!canReachCanonicalOutcomeLibrary(capabilities)) {
        return cards;
    }
    cards.push(STAKE_ENGINE_EXPORT_CARD);
    const adapterCards = deploymentTargets.filter((target) => target.id !== LOCAL_JSON_EXAMPLE_TARGET_ID).map(describeExternalAdapterTargetCard);
    cards.push(...adapterCards, ...(adapterCards.length > 0 ? [] : [REMOTE_DEPLOYMENT_PLACEHOLDER_CARD]));
    return cards;
}
