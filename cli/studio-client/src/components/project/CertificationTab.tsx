import {Alert, Anchor, Button, CopyButton, Group, NumberInput, Select, Stepper, Table, Text, TextInput} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {browseFilesystem, buildCertificationEvidenceBundle, inspectProject, loadBlueprint, validateCertificationSourceBundle, type CertificationBuildModeInput} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {asBetModesList} from "../../domain/blueprintFormOps";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeCertificationBuildResult,
    describeCertificationOutcome,
    describeCertificationProvenanceSummary,
    describeCertificationSourceValidateResult,
    type CertificationBuildRequestView,
    type CertificationOutcome,
    type CertificationSourceValidateRequestView,
} from "../../domain/interpret/Certification";
import {describePathActionError} from "../../domain/pathActionError";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {FieldWarningText} from "../common/FieldWarningText";
import {IssueList} from "../common/IssueList";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";
import {WarningState} from "../common/WarningState";

const OUTCOME_BANNER: Record<CertificationOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Clean"},
    partial: {color: "blue", icon: <IconAlertTriangle size={16} />, title: "Completed with warnings"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Failed"},
};

function downloadJsonBlob(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

type ModeFields = {modeName: string; seed: string; sampleCount: number};

// The sample count a first, freshly auto-filled row is seeded with -- not a requirement enforced
// anywhere server-side, just a reasonable starting point for a certifier's evidence sample; the field
// stays fully editable.
const RECOMMENDED_SAMPLE_COUNT = 100;

const EMPTY_MODE: ModeFields = {modeName: "", seed: "", sampleCount: RECOMMENDED_SAMPLE_COUNT};

// Where POKIE Studio looks, relative to the project root, for a source outcome-library bundle before
// asking the user to point at one themselves -- the same layout "pokie outcomelibrary build" writes to
// by default (see OutcomeLibraryCommand's own "<config dir>/outcomelibrary" default, which projects
// scaffolded alongside this convention place under "outcomes/bundle"). Purely a starting guess, never
// assumed to exist -- browseFilesystem still confirms it for real before "Use detected" offers it.
const DETECTED_BUNDLE_RELATIVE_PATH = "outcomes/bundle";

type DetectedBundleView = {status: "loading"} | {status: "found"; path: string} | {status: "not-found"};

// A deterministic, reproducible-by-construction default seed for a freshly auto-filled mode row --
// scoped to the mode name so two modes never collide, and stable across reloads so re-running the same
// project's certification later starts from the same suggestion (see docs/certification-evidence-
// bundle.md's own "same input always reproduces the same output" contract this whole tab is built on).
function defaultSeedForMode(modeName: string): string {
    return `cert-${modeName}`;
}

type ProjectModesView = {status: "loading"} | {status: "unavailable"} | {status: "ok"; modeIds: readonly string[]};

// The set of project mode ids already claimed by some *other* row -- used both to restrict a given
// row's own Select to the modes still available to it, and to decide whether "Add mode" has anything
// left to offer at all.
function usedModeNames(modes: readonly ModeFields[], excludeIndex: number): Set<string> {
    return new Set(modes.filter((_, index) => index !== excludeIndex).map((mode) => mode.modeName.trim()).filter((name) => name.length > 0));
}

const CERTIFICATION_STORAGE_PREFIX = "pokie-studio:certification:";

type PersistedCertificationFields = {bundleDir: string; outDir: string; modes: ModeFields[]};

function certificationStorageKey(projectRoot: string | undefined): string {
    return `${CERTIFICATION_STORAGE_PREFIX}${projectRoot ?? "no-project"}`;
}

function isPersistedModeFields(value: unknown): value is ModeFields {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.modeName === "string" && typeof record.seed === "string" && typeof record.sampleCount === "number";
}

// Reads back whatever loadPersistedCertificationFields last wrote for this project -- defensively:
// sessionStorage is outside POKIE's own control (a hand-edited value, a future format change, private
// browsing quirks), so any shape mismatch is treated the same as "nothing saved yet" rather than
// thrown, and a corrupt/foreign entry is simply ignored rather than crashing the tab.
function loadPersistedCertificationFields(projectRoot: string | undefined): PersistedCertificationFields | undefined {
    try {
        const raw = window.sessionStorage.getItem(certificationStorageKey(projectRoot));
        if (raw === null) {
            return undefined;
        }
        const parsed = JSON.parse(raw) as Partial<PersistedCertificationFields>;
        if (typeof parsed.bundleDir !== "string" || typeof parsed.outDir !== "string" || !Array.isArray(parsed.modes) || !parsed.modes.every(isPersistedModeFields)) {
            return undefined;
        }
        return {bundleDir: parsed.bundleDir, outDir: parsed.outDir, modes: parsed.modes};
    } catch {
        return undefined;
    }
}

function savePersistedCertificationFields(projectRoot: string | undefined, fields: PersistedCertificationFields): void {
    try {
        window.sessionStorage.setItem(certificationStorageKey(projectRoot), JSON.stringify(fields));
    } catch {
        // sessionStorage unavailable (private browsing, storage disabled) -- the in-memory form state
        // still works for the rest of this tab's mounted lifetime, it just won't survive a tab switch.
    }
}

function clearPersistedCertificationFields(projectRoot: string | undefined): void {
    try {
        window.sessionStorage.removeItem(certificationStorageKey(projectRoot));
    } catch {
        // See savePersistedCertificationFields -- nothing to clean up if storage was never usable.
    }
}

type ModeRowStatus = "empty" | "incomplete" | "valid";

function isModeValid(mode: ModeFields): boolean {
    return mode.modeName.trim().length > 0 && mode.seed.trim().length > 0 && Number.isInteger(mode.sampleCount) && mode.sampleCount > 0;
}

// "empty" (never touched -- still exactly what "Add mode" produced) is the only status silently
// excluded from the submitted mode list (see toModeInputs). "incomplete" (the user typed *something*
// into this row, but it still isn't valid -- e.g. a mode name with no seed) must never be silently
// dropped the same way: see hasIncompleteModeRow, which blocks Build and surfaces a diagnostic instead
// of quietly submitting a build that's missing a mode the user thought they'd included.
function classifyModeRow(mode: ModeFields): ModeRowStatus {
    if (isModeValid(mode)) {
        return "valid";
    }
    const touched = mode.modeName.trim().length > 0 || mode.seed.trim().length > 0 || mode.sampleCount !== EMPTY_MODE.sampleCount;
    return touched ? "incomplete" : "empty";
}

function toModeInputs(modes: readonly ModeFields[]): CertificationBuildModeInput[] {
    return modes.filter((mode) => classifyModeRow(mode) === "valid").map((mode) => ({modeName: mode.modeName.trim(), seed: mode.seed.trim(), sampleCount: mode.sampleCount}));
}

// Per-field detail for an "incomplete" row -- shown right next to the field that's actually missing,
// rather than a single vague "this row is wrong" message. Empty object for anything other than an
// "incomplete" row (an "empty" row is never nagged at, a "valid" one has nothing to warn about).
function modeFieldWarnings(mode: ModeFields): {modeName?: string; seed?: string; sampleCount?: string} {
    if (classifyModeRow(mode) !== "incomplete") {
        return {};
    }
    return {
        modeName: mode.modeName.trim().length === 0 ? "Mode name is required." : undefined,
        seed: mode.seed.trim().length === 0 ? "Seed is required." : undefined,
        sampleCount: Number.isInteger(mode.sampleCount) && mode.sampleCount > 0 ? undefined : "Sample count must be a positive integer.",
    };
}

// Guided Select/configure -> Validate -> Build bundle -> Inspect -> Export workflow, built entirely on
// pokie's own CertificationEvidenceBundleBuilder/CertificationEvidenceBundleValidator (see
// StudioCertificationService) -- every hash/metric shown here is computed server-side, never re-derived
// in this UI. Mirrors OutcomeLibrariesTab's own lifecycle discipline: a monotonic requestId ref per
// async action, a double-submit guard, and an invalidate*() helper that resets state and cascades to
// downstream steps whenever an upstream input changes.
export function CertificationTab({projectRoot}: {projectRoot?: string} = {}) {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // Read once, at mount, whatever a previous visit to this project's Certification tab left in this
    // browser session -- see the "Select/configure" persistence note rendered from this. undefined
    // (nothing saved, or storage unusable) means every field below starts from its ordinary default. A
    // once-only useState (its setter is never called) rather than a ref, since a ref's `.current` can't
    // be read during render.
    const [persistedFields] = useState(() => loadPersistedCertificationFields(projectRoot));

    // ---- Select/configure ----
    const [bundleDir, setBundleDir] = useState(() => persistedFields?.bundleDir ?? "");
    const [outDir, setOutDir] = useState(() => persistedFields?.outDir ?? "certification");
    const [modes, setModes] = useState<ModeFields[]>(() => persistedFields?.modes ?? [EMPTY_MODE]);

    // ---- Source bundle autodetection ----
    const [detectedBundle, setDetectedBundle] = useState<DetectedBundleView>({status: "loading"});
    const [generatePanelOpened, {toggle: toggleGeneratePanel}] = useDisclosure(false);

    // ---- Project modes (for auto-filling/restricting mode rows) ----
    const [projectModesView, setProjectModesView] = useState<ProjectModesView>({status: "loading"});
    const autoFilledFirstRowRef = useRef(false);

    // ---- Validate ----
    const [validateView, setValidateView] = useState<CertificationSourceValidateRequestView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();
    // True once a *completed* Validate response has been silently invalidated by a later Select/configure
    // edit -- same distinction DeploymentTab's own preflightOutdated draws between "outdated" and "never
    // run": tells a user who already validated once that what they saw is stale, rather than leaving the
    // reset to idle unexplained. Cleared the instant a fresh Validate run starts.
    const [validateOutdated, setValidateOutdated] = useState(false);

    // ---- Build bundle ----
    const [buildView, setBuildView] = useState<CertificationBuildRequestView>({status: "idle"});
    const buildRequestIdRef = useRef(0);
    const buildGuard = useDoubleSubmitGuard();
    // Same "outdated" distinction as validateOutdated above, for a completed Build silently invalidated by
    // a later mode/output-directory edit -- the case validateOutdated alone can't cover, since editing
    // modes/outDir (unlike bundleDir) never touches Validate at all, only Build. Cleared the instant a
    // fresh Build run starts. Rendered on Select/configure (where modes live) rather than duplicating the
    // validateOutdated banner's own "rerun Validate" guidance whenever both are true at once.
    const [buildOutdated, setBuildOutdated] = useState(false);

    function invalidateBuild(): void {
        buildRequestIdRef.current++;
        if (buildView.status !== "idle") {
            setBuildOutdated(true);
        }
        setBuildView({status: "idle"});
        buildGuard.end();
    }

    function invalidateValidate(): void {
        validateRequestIdRef.current++;
        setValidateView({status: "idle"});
        setValidateOutdated(true);
        validateGuard.end();
        invalidateBuild();
    }

    function handleBundleDirChange(value: string): void {
        setBundleDir(value);
        savePersistedCertificationFields(projectRoot, {bundleDir: value, outDir, modes});
        if (validateView.status !== "idle") {
            invalidateValidate();
        }
    }

    function handleModesChange(next: ModeFields[]): void {
        setModes(next);
        savePersistedCertificationFields(projectRoot, {bundleDir, outDir, modes: next});
        if (buildView.status !== "idle") {
            invalidateBuild();
        }
    }

    function handleOutDirChange(value: string): void {
        setOutDir(value);
        savePersistedCertificationFields(projectRoot, {bundleDir, outDir: value, modes});
        if (buildView.status !== "idle") {
            invalidateBuild();
        }
    }

    // Resets Select/configure back to its untouched defaults and forgets this project's saved session
    // values -- the explicit counterpart to the autosave every field change above already performs, for
    // a user who wants a clean slate rather than editing every field back by hand. Sets all three fields
    // directly (rather than composing the individual handle*Change functions, each of which persists
    // using its *sibling* fields' current closure value) so the save this triggers can't briefly
    // resurrect a stale bundleDir/outDir/modes combination between two of those calls. Cascades the same
    // way a manual edit would: invalidating Validate/Build exactly as typing over the fields does.
    function clearSavedValues(): void {
        clearPersistedCertificationFields(projectRoot);
        setBundleDir("");
        setOutDir("certification");
        setModes([{...EMPTY_MODE}]);
        autoFilledFirstRowRef.current = false;
        if (validateView.status !== "idle") {
            invalidateValidate();
        }
    }

    // Runs once per mount -- CertificationTab is remounted wholesale (key={projectKey}) on a genuine
    // project switch, so there's no separate "project changed" case to handle here. Never blocks the
    // rest of the tab: a failed/unsupported detection just leaves "Use detected"/the auto-filled mode
    // row unavailable, same as a project with no matching bundle or tracked blueprint at all.
    useEffect(() => {
        let cancelled = false;
        browseFilesystem(fetchImpl, DETECTED_BUNDLE_RELATIVE_PATH, projectRoot, "directory")
            .then((result) => {
                if (cancelled) {
                    return;
                }
                setDetectedBundle(result.status === "ok" ? {status: "found", path: result.resolvedPath} : {status: "not-found"});
            })
            .catch(() => {
                if (!cancelled) {
                    setDetectedBundle({status: "not-found"});
                }
            });

        inspectProject(fetchImpl)
            .then((report) => {
                if (cancelled) {
                    return undefined;
                }
                if (!report.generated || report.buildInfo?.source === undefined) {
                    setProjectModesView({status: "unavailable"});
                    return undefined;
                }
                return loadBlueprint(fetchImpl, report.buildInfo.source).then((result) => {
                    if (cancelled) {
                        return;
                    }
                    if (result.status === "load-error") {
                        setProjectModesView({status: "unavailable"});
                        return;
                    }
                    const blueprint = result.blueprint as Record<string, unknown> | null;
                    const modeIds = asBetModesList(blueprint?.betModes)
                        .map((mode) => mode.id.trim())
                        .filter((id) => id.length > 0);
                    setProjectModesView(modeIds.length > 0 ? {status: "ok", modeIds} : {status: "unavailable"});
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setProjectModesView({status: "unavailable"});
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-fills the first mode row from the project's own modes exactly once, and only when there's
    // nothing more specific to respect: a session restore (persistedFields) already reflects the user's
    // own prior choice (including a deliberate blank), and a row the user has since touched themselves
    // must never be clobbered by a slow project-modes response landing late.
    useEffect(() => {
        if (projectModesView.status !== "ok" || autoFilledFirstRowRef.current || persistedFields !== undefined) {
            return;
        }
        autoFilledFirstRowRef.current = true;
        if (modes.length !== 1 || classifyModeRow(modes[0]) !== "empty") {
            return;
        }
        const modeName = projectModesView.modeIds[0];
        handleModesChange([{modeName, seed: defaultSeedForMode(modeName), sampleCount: RECOMMENDED_SAMPLE_COUNT}]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectModesView]);

    function runValidate(): void {
        if (bundleDir.trim().length === 0 || !validateGuard.begin()) {
            return;
        }
        const requestId = ++validateRequestIdRef.current;
        invalidateBuild();
        setValidateOutdated(false);
        setValidateView({status: "loading"});
        validateCertificationSourceBundle(fetchImpl, bundleDir.trim())
            .then((result) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView(describeCertificationSourceValidateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView({status: "network-error", message: errorMessage(error)});
            });
    }

    function runBuild(): void {
        const modeInputs = toModeInputs(modes);
        const hasIncompleteMode = modes.some((mode) => classifyModeRow(mode) === "incomplete");
        if (modeInputs.length === 0 || hasIncompleteMode || bundleDir.trim().length === 0 || outDir.trim().length === 0 || !buildGuard.begin()) {
            return;
        }
        const requestId = ++buildRequestIdRef.current;
        setBuildOutdated(false);
        setBuildView({status: "loading"});
        buildCertificationEvidenceBundle(fetchImpl, bundleDir.trim(), modeInputs, outDir.trim())
            .then((result) => {
                if (requestId !== buildRequestIdRef.current) {
                    return;
                }
                buildGuard.end();
                setBuildView(describeCertificationBuildResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== buildRequestIdRef.current) {
                    return;
                }
                buildGuard.end();
                setBuildView({status: "network-error", message: errorMessage(error)});
            });
    }

    const hasIncompleteModeRow = modes.some((mode) => classifyModeRow(mode) === "incomplete");
    const validateReachable = bundleDir.trim().length > 0;
    const validateOutcome = validateView.status === "ok" ? describeCertificationOutcome(validateView) : undefined;
    const buildReachable = validateOutcome !== undefined && validateOutcome !== "invalid";
    const buildResult = buildView.status === "ok" ? buildView : undefined;
    let buildOutcome: CertificationOutcome | undefined;
    if (buildView.status === "ok") {
        buildOutcome = describeCertificationOutcome({errors: [], warnings: buildView.warnings});
    } else if (buildView.status === "error") {
        buildOutcome = describeCertificationOutcome(buildView);
    }
    const inspectReachable = buildResult !== undefined;

    // What's standing between the user and each step's own "Continue" -- rendered as a plain-language
    // checklist next to that step's own controls whenever it isn't reachable yet, rather than leaving a
    // hidden/disabled button as the only signal something is still missing.
    function buildContinueBlockers(): string[] {
        if (validateView.status === "idle") {
            return ['Run "Validate source bundle" above first.'];
        }
        if (validateView.status === "loading") {
            return ["Validation is still running."];
        }
        if (validateView.status === "network-error" || validateView.status === "load-error") {
            return ["Fix the validation request error above, then run Validate source bundle again."];
        }
        if (validateOutcome === "invalid") {
            return ["The source bundle failed validation -- fix the errors above before continuing."];
        }
        if (hasIncompleteModeRow) {
            return [
                "One or more mode rows on Select/configure are incomplete -- fill in mode name, seed, and a positive sample count, or remove the row, before continuing.",
            ];
        }
        return [];
    }

    function inspectContinueBlockers(): string[] {
        if (buildView.status === "idle") {
            return ['Run "Build certification bundle" above first.'];
        }
        if (buildView.status === "loading") {
            return ["The build is still running."];
        }
        if (buildView.status === "network-error" || buildView.status === "load-error") {
            return ["Fix the build request error above, then run Build certification bundle again."];
        }
        if (buildOutcome === "invalid") {
            return ["The build failed -- fix the errors above before continuing."];
        }
        return [];
    }

    // Modes still available to the row at `index` -- every project mode not already claimed by some
    // *other* row, plus this row's own current selection (so choosing it never makes it vanish from its
    // own dropdown). Empty (and unused for restriction) whenever project modes aren't known.
    function remainingModeChoicesFor(index: number): string[] {
        if (projectModesView.status !== "ok") {
            return [];
        }
        const usedByOtherRows = usedModeNames(modes, index);
        const ownValue = modes[index].modeName.trim();
        return projectModesView.modeIds.filter((id) => id === ownValue || !usedByOtherRows.has(id));
    }

    const allProjectModesUsed = projectModesView.status === "ok" && projectModesView.modeIds.every((id) => usedModeNames(modes, -1).has(id));

    function handleAddMode(): void {
        handleModesChange([...modes, {...EMPTY_MODE}]);
    }

    function handleRemoveMode(index: number): void {
        const next = modes.filter((_, i) => i !== index);
        handleModesChange(next.length > 0 ? next : [{...EMPTY_MODE}]);
    }

    // The real, project-specific "pokie outcomelibrary build" invocation that would populate the
    // directory this tab is about to read from -- targets wherever Source outcome-library bundle
    // directory already points (typed value, else the detected default, else the bare convention path),
    // so the copied command always writes to the exact place Validate/Build will look.
    let generateOutcomeLibraryOutDir = DETECTED_BUNDLE_RELATIVE_PATH;
    if (bundleDir.trim().length > 0) {
        generateOutcomeLibraryOutDir = bundleDir.trim();
    } else if (detectedBundle.status === "found") {
        generateOutcomeLibraryOutDir = detectedBundle.path;
    }
    const generateOutcomeLibraryCommand = `pokie outcomelibrary build <config.json> --out ${generateOutcomeLibraryOutDir}`;

    function renderValidateStep(): ReactNode {
        if (!validateReachable) {
            return <EmptyState message="Enter a source outcome-library bundle directory first." />;
        }
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Runs the same deep bundle validation the Build step itself performs before sampling a single
                    round -- a preflight check you can run before committing to a build.
                </Text>
                <QuickActions>
                    <Button onClick={runValidate} loading={validateView.status === "loading"}>
                        Validate source bundle
                    </Button>
                </QuickActions>
                {validateView.status === "network-error" && (
                    <ErrorState message={describePathActionError("The certification bundle directory", validateView.message)} />
                )}
                {validateView.status === "load-error" && (
                    <ErrorState message={describePathActionError("The certification bundle directory", validateView.error)} />
                )}
                {validateOutcome !== undefined && (
                    <OutcomeBanner
                        color={OUTCOME_BANNER[validateOutcome].color}
                        icon={OUTCOME_BANNER[validateOutcome].icon}
                        title={OUTCOME_BANNER[validateOutcome].title}
                        errors={validateView.status === "ok" ? validateView.errors : []}
                        warnings={validateView.status === "ok" ? validateView.warnings : []}
                    />
                )}
                {buildReachable && !hasIncompleteModeRow ? (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(2)}>Continue to Build bundle</Button>
                    </QuickActions>
                ) : (
                    <IssueList title="Before you can continue" issues={buildContinueBlockers().map((message) => ({message}))} />
                )}
            </div>
        );
    }

    function renderBuildStep(): ReactNode {
        if (!buildReachable) {
            return <EmptyState message="Validate the source bundle first." />;
        }
        return (
            <div>
                <PathInput
                    label="Output directory"
                    kind="directory"
                    browseTitle="Browse for a certification output directory"
                    browseId="certification-out-dir"
                    relevantDirectory={projectRoot}
                    value={outDir}
                    onChange={(event) => handleOutDirChange(event.currentTarget.value)}
                    onPathSelected={handleOutDirChange}
                    mb="sm"
                />
                {hasIncompleteModeRow && (
                    <WarningState message="One or more mode rows on Select/configure are incomplete. Fill in mode name, seed, and a positive sample count, or remove the row, before building." />
                )}
                <QuickActions>
                    <Button onClick={runBuild} loading={buildView.status === "loading"} disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}>
                        Build certification bundle
                    </Button>
                </QuickActions>
                {buildView.status === "network-error" && (
                    <ErrorState message={describePathActionError("The certification bundle directory", buildView.message)} />
                )}
                {buildView.status === "load-error" && (
                    <ErrorState message={describePathActionError("The certification bundle directory", buildView.error)} />
                )}
                {buildOutcome !== undefined && (
                    <OutcomeBanner
                        color={OUTCOME_BANNER[buildOutcome].color}
                        icon={OUTCOME_BANNER[buildOutcome].icon}
                        title={OUTCOME_BANNER[buildOutcome].title}
                        errors={buildView.status === "error" ? buildView.errors : []}
                        warnings={buildView.status === "ok" || buildView.status === "error" ? buildView.warnings : []}
                    />
                )}
                {inspectReachable ? (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(3)}>Continue to Inspect</Button>
                    </QuickActions>
                ) : (
                    <IssueList title="Before you can continue" issues={inspectContinueBlockers().map((message) => ({message}))} />
                )}
            </div>
        );
    }

    return (
        <PageSection legend="Certification">
            <Text size="sm" c="dimmed" mb="sm">
                Build a canonical certification/evidence bundle on top of an outcome-library bundle, inspect its
                manifest and sampled artifacts, and export it for a certifier -- everything shown here is computed
                by pokie&apos;s own CertificationEvidenceBundleBuilder/Validator, never re-derived in this UI.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select/configure" description="Bundle & modes" aria-current={activeStep === 0 ? "step" : undefined} />
                <Stepper.Step
                    label="Validate"
                    description="Preflight"
                    disabled={!validateReachable}
                    aria-current={activeStep === 1 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Build bundle"
                    description="Sample & publish"
                    disabled={!buildReachable}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Inspect"
                    description="Manifest & artifacts"
                    disabled={!inspectReachable}
                    aria-current={activeStep === 3 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Export"
                    description="Download manifest"
                    disabled={!inspectReachable}
                    aria-current={activeStep === 4 ? "step" : undefined}
                />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <Text size="xs" c="dimmed" mb="sm">
                        Select/configure is saved automatically to this browser tab&apos;s session storage as you
                        type -- it survives switching tabs and reloading the page, but is lost once this tab
                        closes, and is never written to disk or shared with anyone else.{" "}
                        <Anchor component="button" type="button" onClick={clearSavedValues}>
                            Clear saved values
                        </Anchor>
                    </Text>
                    {validateOutdated && (
                        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                            Outdated -- the bundle directory changed since the last Validate run. Its result no
                            longer reflects what&apos;s configured here; rerun Validate before Build bundle is
                            offered again.
                        </Alert>
                    )}
                    {!validateOutdated && buildOutdated && (
                        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                            Outdated -- the modes or output directory changed since the last Build run. Its
                            result no longer reflects what&apos;s configured here; rerun Build certification
                            bundle before Inspect/Export are offered again.
                        </Alert>
                    )}
                    <PathInput
                        label="Source outcome-library bundle directory"
                        placeholder="./outcomes/bundle"
                        kind="directory"
                        browseTitle="Browse for a source outcome-library bundle directory"
                        browseId="certification-bundle-dir"
                        relevantDirectory={projectRoot}
                        autoDestinationPath={detectedBundle.status === "found" ? detectedBundle.path : undefined}
                        value={bundleDir}
                        onChange={(event) => handleBundleDirChange(event.currentTarget.value)}
                        onPathSelected={handleBundleDirChange}
                        mb="sm"
                    />
                    {detectedBundle.status === "found" && (
                        <QuickActions>
                            <Text size="xs" c="dimmed">
                                Detected an outcome-library bundle at {detectedBundle.path}.
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() => handleBundleDirChange(detectedBundle.path)}
                                disabled={bundleDir.trim() === detectedBundle.path}
                            >
                                Use detected
                            </Button>
                        </QuickActions>
                    )}
                    <QuickActions>
                        <Button variant="default" size="xs" onClick={toggleGeneratePanel} aria-expanded={generatePanelOpened}>
                            {generatePanelOpened ? "Hide generate outcome library" : "Generate outcome library"}
                        </Button>
                    </QuickActions>
                    <PageSection legend="Generate an outcome library" hidden={!generatePanelOpened}>
                        <Text size="sm" c="dimmed" mb="sm">
                            POKIE Studio never fabricates outcome data itself -- run this from a terminal once you
                            have a config.json listing each mode&apos;s real outcome source (a WeightedOutcomeLibrary
                            JSON file, or a streaming JSONL file of outcomes for a mode too large to hold in memory;
                            see docs/outcome-library-bundle.md for the exact format), then point the field above at
                            the directory it writes.
                        </Text>
                        <CodeBlock>{generateOutcomeLibraryCommand}</CodeBlock>
                        <QuickActions>
                            <CopyButton value={generateOutcomeLibraryCommand}>
                                {({copied, copy}) => (
                                    <Button size="xs" variant="default" onClick={copy}>
                                        {copied ? "Copied" : "Copy command"}
                                    </Button>
                                )}
                            </CopyButton>
                        </QuickActions>
                    </PageSection>
                    <Text size="sm" fw={600} mb={4}>
                        Modes to sample
                    </Text>
                    {projectModesView.status === "unavailable" && (
                        <Text size="xs" c="dimmed" mb="sm">
                            This project isn&apos;t built from a tracked source blueprint, so its modes can&apos;t be
                            listed automatically -- enter mode names below as free text.
                        </Text>
                    )}
                    {modes.map((mode, index) => {
                        const warnings = modeFieldWarnings(mode);
                        const canRemove = classifyModeRow(mode) !== "empty" || modes.length > 1;
                        return (
                            <Group key={index} gap="sm" wrap="wrap" mb="sm" align="flex-end">
                                <div>
                                    {projectModesView.status === "ok" ? (
                                        <Select
                                            label="Mode name"
                                            placeholder="Choose a mode…"
                                            data={remainingModeChoicesFor(index)}
                                            value={mode.modeName.trim().length > 0 ? mode.modeName : null}
                                            onChange={(value) =>
                                                handleModesChange(modes.map((m, i) => (i === index ? {...m, modeName: value ?? ""} : m)))
                                            }
                                        />
                                    ) : (
                                        <TextInput
                                            label="Mode name"
                                            placeholder="base"
                                            value={mode.modeName}
                                            onChange={(event) => handleModesChange(modes.map((m, i) => (i === index ? {...m, modeName: event.currentTarget.value} : m)))}
                                        />
                                    )}
                                    <FieldWarningText message={warnings.modeName} />
                                </div>
                                <div>
                                    <TextInput
                                        label="Seed"
                                        placeholder="cert-2026-07-20-base"
                                        value={mode.seed}
                                        onChange={(event) => handleModesChange(modes.map((m, i) => (i === index ? {...m, seed: event.currentTarget.value} : m)))}
                                    />
                                    <FieldWarningText message={warnings.seed} />
                                </div>
                                <div>
                                    <NumberInput
                                        label="Sample count"
                                        description={`Recommended: at least ${RECOMMENDED_SAMPLE_COUNT}.`}
                                        min={1}
                                        value={mode.sampleCount}
                                        onChange={(value) => handleModesChange(modes.map((m, i) => (i === index ? {...m, sampleCount: Number(value) || 0} : m)))}
                                    />
                                    <FieldWarningText message={warnings.sampleCount} />
                                </div>
                                {canRemove && (
                                    <Button variant="subtle" color="red" onClick={() => handleRemoveMode(index)}>
                                        Remove
                                    </Button>
                                )}
                            </Group>
                        );
                    })}
                    <QuickActions>
                        <Button variant="default" onClick={handleAddMode} disabled={allProjectModesUsed}>
                            Add mode
                        </Button>
                        <Button onClick={() => setActiveStep(1)} disabled={!validateReachable}>
                            Continue to Validate
                        </Button>
                    </QuickActions>
                    {allProjectModesUsed && projectModesView.status === "ok" && (
                        <Text size="xs" c="dimmed" mb="sm">
                            All {projectModesView.modeIds.length} project mode{projectModesView.modeIds.length === 1 ? "" : "s"} (
                            {projectModesView.modeIds.join(", ")}) already have a row above.
                        </Text>
                    )}
                    {!validateReachable && (
                        <IssueList title="Before you can continue" issues={[{message: "Enter a source outcome-library bundle directory above."}]} />
                    )}
                </div>
            )}

            {activeStep === 1 && renderValidateStep()}
            {activeStep === 2 && renderBuildStep()}

            {activeStep === 3 &&
                (buildResult === undefined ? (
                    <EmptyState message="Build a certification bundle first." />
                ) : (
                    <div>
                        <PageSection legend="Summary">
                            <Text size="sm" mb="sm">
                                {describeCertificationProvenanceSummary(buildResult.manifest)}
                            </Text>
                        </PageSection>

                        <PageSection legend="Per-mode evidence">
                            <Table.ScrollContainer minWidth={640}>
                                <Table withRowBorders={false}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Mode</Table.Th>
                                            <Table.Th>Library hash</Table.Th>
                                            <Table.Th>Outcomes</Table.Th>
                                            <Table.Th>RTP</Table.Th>
                                            <Table.Th>Samples</Table.Th>
                                            <Table.Th>Samples hash</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {buildResult.manifest.modes.map((mode) => (
                                            <Table.Tr key={mode.modeName}>
                                                <Table.Td>{mode.modeName}</Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryHash}</Table.Td>
                                                <Table.Td>{mode.outcomeCount.toLocaleString()}</Table.Td>
                                                <Table.Td>{(mode.analysis.rtp * 100).toFixed(2)}%</Table.Td>
                                                <Table.Td>
                                                    {mode.sampleCount.toLocaleString()} (seed &quot;{mode.sampleSeed}&quot;)
                                                </Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.samplesHash}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </PageSection>

                        {buildResult.manifest.deepValidation.issues.length > 0 && (
                            <PageSection legend="Source bundle deep-validation (embedded verbatim)">
                                <IssueList title="Issues" issues={[...buildResult.manifest.deepValidation.issues]} />
                            </PageSection>
                        )}

                        <PageSection legend="Files">
                            {buildResult.files.map((file) => (
                                <Text key={file} size="sm" style={{overflowWrap: "anywhere"}}>
                                    {file}
                                </Text>
                            ))}
                        </PageSection>

                        <AdvancedDisclosure detail="raw manifest">
                            <CodeBlock>{JSON.stringify(buildResult.manifest, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>

                        <QuickActions>
                            <Button onClick={() => setActiveStep(4)}>Continue to Export</Button>
                        </QuickActions>
                    </div>
                ))}

            {activeStep === 4 &&
                (buildResult === undefined ? (
                    <EmptyState message="Build a certification bundle first." />
                ) : (
                    <div>
                        <Alert color="blue" variant="light" mb="sm">
                            <Text size="sm">
                                The manifest and every sampled-artifact file already live on disk under the output
                                directory below -- Studio never copies them into the browser. Download the manifest
                                for a quick reference, and hand the certifier the directory itself for the full
                                evidence (including the per-mode samples file(s) listed under Files).
                            </Text>
                        </Alert>
                        <PageSection legend="Output directory">
                            <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                {outDir}
                            </Text>
                        </PageSection>
                        <QuickActions>
                            <Button
                                onClick={() =>
                                    downloadJsonBlob(
                                        `certification-${buildResult.manifest.game.id}-${buildResult.manifest.game.version}-manifest.json`,
                                        buildResult.manifest,
                                    )
                                }
                            >
                                Download manifest.json
                            </Button>
                        </QuickActions>
                    </div>
                ))}
        </PageSection>
    );
}
