import type {
    OutcomeLibrarySelector,
    StudioOutcomeLibraryRegistryView,
    StudioStakeEngineExportValidateView,
    StudioStakeEngineExportView,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Stake Engine Export tab -- same role as Certification.ts's own
// describe* functions. Every hash/count/manifest field shown by this tab is exactly what
// StakeEngineExporter/StakeEngineExportValidator already computed server-side -- nothing here converts a
// payoutMultiplier into Stake units, renders a lookup CSV, or re-derives a library's own outcome
// count/hash; these functions only add idle/loading/network-error states around the server's own DTOs and
// turn already-computed data into plain-language labels.

// ---- Configure step: source (canonical outcome library) selection ----
// Each mode row's own source is a full OutcomeLibrarySelector (a plain JSON file, or one mode of a
// canonical outcome-library bundle the Outcome Libraries registry already knows about) -- never a bare
// libraryPath string. Mirrors Deployment.ts's own isBlankLibrarySelector/discoverDeploymentModeLibrarySelector
// pair, kept as this tab's own small copy (not a shared import) since the two features' own row shapes
// (this one also carries "cost", never a build-mode-restricted Select) are independent and free to diverge.

export function isBlankStakeEngineExportLibrarySelector(selector: OutcomeLibrarySelector): boolean {
    if (selector.kind === "json") {
        return selector.path.trim().length === 0;
    }
    if (selector.kind === "bundle") {
        return selector.bundleDir.trim().length === 0 || selector.modeName.trim().length === 0;
    }
    return selector.stakeDir.trim().length === 0 || selector.modeName.trim().length === 0;
}

// Whether a row's own librarySelector is safe to silently replace when its modeName changes -- a blank
// selector obviously is, and so is a "bundle" one (its own `modeName` field must always match the row's,
// so it's already tied to the mode it was discovered for). A manually-chosen "json"/"stakeengine" selector
// is never auto-replaced this way.
export function isAutoDiscoverableStakeEngineExportLibrarySelector(selector: OutcomeLibrarySelector): boolean {
    return selector.kind === "bundle" || isBlankStakeEngineExportLibrarySelector(selector);
}

// The Outcome Libraries registry's own compatibility classification for exactly the bundle a row's own
// librarySelector points at -- `undefined` when the registry has nothing to say about it.
function registryBuildStatusForStakeEngineExportSelector(
    modeName: string,
    selector: OutcomeLibrarySelector,
    registry: StudioOutcomeLibraryRegistryView,
): "compatible" | "stale" | "wrong" | undefined {
    if (registry.status !== "ok" || registry.buildStatus === "missing" || selector.kind !== "bundle") {
        return undefined;
    }
    return registry.modes.find((mode) => mode.modeName === modeName && mode.bundleDir === selector.bundleDir)?.buildStatus;
}

// The latest registry-known library compatible with the current build for a given mode name, ready to
// drop straight into a row's own librarySelector -- `undefined` when the registry has no (or no longer
// compatible) entry for this mode name.
export function discoverStakeEngineExportModeLibrarySelector(modeName: string, registry: StudioOutcomeLibraryRegistryView): OutcomeLibrarySelector | undefined {
    if (registry.status !== "ok" || registry.buildStatus === "missing") {
        return undefined;
    }
    const entry = registry.modes.find((mode) => mode.modeName === modeName && mode.buildStatus === "compatible");
    return entry === undefined ? undefined : {kind: "bundle", bundleDir: entry.bundleDir, modeName: entry.modeName};
}

// Every status a Configure row's own source can be in, in the language its own status badge shows:
//   - "missing": no library has been chosen/discovered for this row yet.
//   - "wrong": the chosen library is a registry-known bundle that's stale or from a different game build --
//     present, but not safe to export as-is.
//   - "invalid": the last Validate/Export run's own load-error named this exact mode -- the chosen
//     selector doesn't actually resolve to a readable, well-formed library.
//   - "found": everything about this row's source is usable as far as the Configure step can tell locally;
//     Validate diagnostics is still the authoritative last word.
export type StakeEngineExportModeSourceStatus = "missing" | "wrong" | "invalid" | "found";

export function classifyStakeEngineExportModeSourceStatus(
    modeName: string,
    selector: OutcomeLibrarySelector,
    registry: StudioOutcomeLibraryRegistryView | undefined,
    lastLoadError: string | undefined,
): StakeEngineExportModeSourceStatus {
    if (isBlankStakeEngineExportLibrarySelector(selector)) {
        return "missing";
    }
    const trimmedModeName = modeName.trim();
    if (lastLoadError !== undefined && trimmedModeName.length > 0 && lastLoadError.includes(`mode "${trimmedModeName}"`)) {
        return "invalid";
    }
    const registryStatus = registry !== undefined ? registryBuildStatusForStakeEngineExportSelector(trimmedModeName, selector, registry) : undefined;
    if (registryStatus === "wrong" || registryStatus === "stale") {
        return "wrong";
    }
    return "found";
}

const STAKE_ENGINE_EXPORT_MODE_SOURCE_STATUS_DESCRIPTIONS: Record<StakeEngineExportModeSourceStatus, {label: string; color: string}> = {
    missing: {label: "Missing", color: "red"},
    wrong: {label: "Wrong build", color: "yellow"},
    invalid: {label: "Invalid", color: "red"},
    found: {label: "Found", color: "green"},
};

export function describeStakeEngineExportModeSourceStatus(status: StakeEngineExportModeSourceStatus): {label: string; color: string} {
    return STAKE_ENGINE_EXPORT_MODE_SOURCE_STATUS_DESCRIPTIONS[status];
}

// The Preview/Validate diagnostics steps' own plain-language account of input provenance, the
// transformation this pipeline performs, the exact files it will produce, and where/how they land on
// disk -- grounded in StakeEngineExporter's own real, documented contract (see docs/stake-engine-export.md's
// "Rebuild safety" section), never an invented atomicity/overwrite story. Shown regardless of outcome,
// since even a validation failure still has real input/output/destination semantics worth explaining.
export function describeStakeEngineExportDestinationNote(modeNames: readonly string[]): string {
    const perModeFiles = modeNames.flatMap((name) => [`lookup_${name}.csv`, `books_${name}.jsonl.zst`]);
    const files = ["index.json", ...perModeFiles, "pokie-manifest.json"];

    const inputOutput =
        `Input: each mode's own canonical outcome library, read only -- never modified by this pipeline.\n\n` +
        `Output: ${files.join(", ")}.`;

    const destination =
        `Destination: a real Export writes exactly those files into the output directory below, replaced as ` +
        `a whole, atomically: every file is first written into a fresh temporary directory beside it, and only ` +
        `swapped into place, in one rename, once every file has been written successfully. If anything fails ` +
        `before that swap, the temporary directory is discarded and the output directory is left exactly as it ` +
        `was -- never a partial export. A re-export starts from nothing, not from the previous directory's own ` +
        `contents: a mode present in an earlier export but missing from this run is simply not written into the ` +
        `new directory, and the swap discards its old files along with everything else. Exporting into an ` +
        `existing, non-empty directory is only allowed when it's empty or recognized as a prior Stake Engine ` +
        `export's own output -- otherwise it's refused outright, with nothing touched, unless you confirm ` +
        `overwriting it.`;

    return `${inputOutput}\n\n${destination}`;
}

export type StakeEngineExportValidateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioStakeEngineExportValidateView;

export function describeStakeEngineExportValidateResult(result: StudioStakeEngineExportValidateView): StakeEngineExportValidateRequestView {
    return result;
}

// "network-error" (a thrown fetch failure) is kept distinct from StudioStakeEngineExportView's own
// domain-level "conflict"/"invalid"/"load-error" statuses -- none of them can share the literal "error"
// without colliding in this union's own discriminant.
export type StakeEngineExportRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioStakeEngineExportView;

export function describeStakeEngineExportResult(result: StudioStakeEngineExportView): StakeEngineExportRequestView {
    return result;
}

// Every outcome a Validate/Export step can end up in, in the language a non-technical user would
// recognize -- never re-validating anything, only reading whether the response's own errors/warnings
// (already computed server-side) are non-empty. "partial" means "succeeded, but with warnings worth
// reviewing" -- never a blocker; "invalid" means the step produced no usable result at all.
export type StakeEngineExportOutcome = "success" | "partial" | "invalid";

export function describeStakeEngineExportOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): StakeEngineExportOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}
