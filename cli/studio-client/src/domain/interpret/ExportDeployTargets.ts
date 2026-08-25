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
// Each actionable card here is offered only once this project's own resolved capabilities/ProjectType
// actually grant what it needs -- see canGenerateOutcomeLibrary/canReachCanonicalOutcomeLibrary and the
// server-resolved `supported` flag for artifact cards. Unavailable artifact cards still explain their
// concrete limitation instead of disappearing. The External Adapter SDK's own bundled local-json-example
// demo target is never described as a card at all, on any project (see LOCAL_JSON_EXAMPLE_TARGET_ID's own
// doc comment) -- it exists to exercise the SDK end to end, not as a real deployment pipeline this page
// should ever present alongside genuine registered targets.
export type ExportDeployTargetKind = "staticExport" | "outcomeLibrary" | "buildArtifact" | "remoteDeployment";

export type ExportDeployTargetCard = {
    readonly kind: ExportDeployTargetKind;
    readonly id: string;
    readonly label: string;
    readonly adapter: string;
    readonly version: string;
    readonly purpose: string;
    readonly destination: string;
    readonly technicalDestination: string;
    readonly writePublishBehavior: string;
    readonly capabilities: readonly string[];
    readonly limits: readonly string[];
    readonly prerequisites: readonly string[];
    readonly unavailableReasons: readonly string[];
    readonly supported: boolean;
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
// tsPackage/outcomeLibrary/stakeAdapter/parWorkbook vocabulary and semantics
// ArtifactBuilderRegistry.describe() itself already reports (see ArtifactBuilderRegistry.ts's own
// UNSUPPORTED_NOTES), restated here only as a label/one-line purpose for this card -- never a second,
// independently-decided description of what building a target does or doesn't do. WASM is intentionally
// absent: it is an inspection-only project kind until a matrix-supported builder exists.
const ARTIFACT_TARGET_CARD_INFO: Readonly<
    Record<StudioArtifactTargetType, {label: string; purpose: string; destination: string; technicalDestination: string; unavailableReason: string}>
> = {
    tsPackage: {
        label: "TypeScript Game Package",
        purpose: "Create a runnable game package from this project.",
        destination: "Choose a folder for the finished game package, or use the default destination.",
        technicalDestination: "A new package directory (default: a \"tsPackage\" sibling of this project).",
        unavailableReason: "This project cannot build a TypeScript Game Package. Open a Game Blueprint project to create one.",
    },
    outcomeLibrary: {
        label: "Outcome library",
        purpose: "Build an outcome library from this project.",
        destination: "Choose a folder for the outcome library, or use the default destination.",
        technicalDestination: "A new bundle directory (default: an \"outcomeLibrary\" sibling of this project).",
        unavailableReason:
            "This project cannot create or republish an outcome library. Open a Game Blueprint, runnable game package, or outcome library project to continue.",
    },
    stakeAdapter: {
        label: "Stake Engine export",
        purpose: "Build a Stake Engine export from this project.",
        destination: "Choose a folder for the Stake Engine export, or use the default destination.",
        technicalDestination: "A new Stake Engine export directory beside this project by default.",
        unavailableReason:
            "This project cannot build a Stake Engine export. Open a Game Blueprint, runnable game package, outcome library, or Stake Engine export project to continue.",
    },
    parWorkbook: {
        label: "PAR sheet (.xlsx)",
        purpose: "Export this Game Blueprint as a PAR workbook snapshot, or republish this PAR workbook.",
        destination: "Choose where to save the PAR workbook, or use the default destination.",
        technicalDestination: "A new .xlsx file (default: \"parWorkbook.xlsx\" next to this project).",
        unavailableReason: "This project cannot export or republish a PAR workbook. Open a Game Blueprint or PAR sheet workbook project to continue.",
    },
};

// Builds one card per ArtifactBuilderRegistry target. `supported` is resolved server-side by
// StudioArtifactBuildService.listTargets (the same registry.supportsConversionFrom() check "pokie build"
// runs). Unsupported cards remain visible and explain why this project cannot build them, rather than
// making an unavailable output look as though Studio forgot to offer it.
function unavailableReasonsForArtifactTarget(entry: StudioArtifactTargetView, fallbackReason: string): readonly string[] {
    if (entry.supported) return [];
    if (entry.diagnostic !== undefined) return [entry.diagnostic];
    if (entry.unsupportedNotes.length > 0) return entry.unsupportedNotes;
    return [fallbackReason];
}

export function describeArtifactBuildTargetCards(targets: readonly StudioArtifactTargetView[]): ExportDeployTargetCard[] {
    return targets
        // A stale server response must not re-advertise a hidden build target in the UI. The server is
        // matrix-authoritative, but this defensive filter makes the hidden/unadvertised contract hold while
        // a browser has an older response cached.
        .filter((entry) => entry.target in ARTIFACT_TARGET_CARD_INFO)
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
                technicalDestination: info.technicalDestination,
                writePublishBehavior:
                    "A registry-backed preview reports the resolved destination (and any conflict) before Build is ever clicked; Build itself still writes the artifact to disk in one step, and a destination that already exists and isn't empty is refused untouched.",
                capabilities: [],
                limits: [],
                prerequisites: entry.supported ? ["This project is ready to build. Choose a destination or use the default."] : [],
                // The server's descriptor remains the authority whenever it provides a reason. Some
                // transitional or third-party Studio responses have no descriptor prose, however, so the
                // card still needs a useful, target-specific next step instead of a generic unavailable
                // message that leaves the user guessing.
                unavailableReasons: unavailableReasonsForArtifactTarget(entry, info.unavailableReason),
                supported: entry.supported,
                locality: "local",
                compatibility: "The exact same ArtifactBuilderRegistry conversion runs in the CLI and Studio, so they always agree on what's buildable and what it writes.",
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
        "Create a standalone Stake Engine bundle from this project's outcomes.",
    destination: "Choose a local folder for the finished export. Studio checks it before creating the export.",
    technicalDestination: "A local output directory: index.json, a per-mode lookup CSV, per-mode zstd-compressed books, and a sibling pokie-manifest.json.",
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
    unavailableReasons: [],
    supported: true,
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
        "Create the outcome library used by the other export and delivery options.",
    destination: "Choose a local folder for the outcome library. Nothing is sent outside Studio.",
    technicalDestination: "A local bundle directory registered for this project (outcomelibrary by default, or a custom directory) -- nothing is deployed or exported externally.",
    writePublishBehavior: "Generate writes the bundle to disk and registers it for discovery; Select/Validate/Inspect never write anything.",
    capabilities: ["Exact or bounded-sample generation, whichever the game's own mechanic supports", "Registry discovery by mode name for every other target on this page"],
    limits: [],
    prerequisites: ["A built, runnable package for this project"],
    unavailableReasons: [],
    supported: true,
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
        label: "Remote delivery",
        adapter: "External Adapter SDK registered target",
        version: target.version,
        purpose: "Check and publish this project's outcome library to a configured remote destination.",
        destination: "Use the configured remote destination after a compatibility check succeeds.",
        technicalDestination: "Wherever this target's own runtime adapter delivers to -- not necessarily local to this machine.",
        writePublishBehavior:
            "Preview runs the full pipeline (compatibility check, projection, generation, artifact validation, target diagnostic) without writing; Deploy additionally publishes the generated artifacts to the target's own output location.",
        capabilities: target.capabilities.length > 0 ? target.capabilities.map(describeTargetCapability) : ["No optional capabilities declared."],
        limits: describeTargetRequirements(target.requirements),
        prerequisites: ["One canonical outcome library file per deployment mode", "A reachable target diagnostic before Deploy is offered"],
        unavailableReasons: [],
        supported: true,
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
    label: "Remote delivery is not set up",
    adapter: "External Adapter SDK",
    version: "--",
    purpose: "Set up a remote destination before this project can be delivered outside Studio.",
    destination: "Set up a remote destination before delivery can begin.",
    technicalDestination: "Not yet registered.",
    writePublishBehavior: "Not applicable until a remote target is registered.",
    capabilities: [],
    limits: [],
    prerequisites: ["Add a remote delivery destination in Studio."],
    unavailableReasons: ["Remote delivery is unavailable until a destination is set up. Add a remote delivery destination in Studio."],
    supported: false,
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
