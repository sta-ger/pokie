import {Anchor, Collapse, SegmentedControl, Stepper, Text, Title} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import {loadBlueprint, saveBlueprint, validateBlueprint} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeLoadResult,
    describeSaveResult,
    describeValidation,
    type BlueprintLoadView,
    type BlueprintSaveView,
    type BlueprintValidationView,
} from "../../domain/interpret/BlueprintEditor";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {NextStepCallout} from "../common/NextStepCallout";
import {BetsList} from "./BetsList";
import {BlueprintBuildPanel} from "./BlueprintBuildPanel";
import {BlueprintJsonPanel} from "./BlueprintJsonPanel";
import {BlueprintLoadSaveControls} from "./BlueprintLoadSaveControls";
import {BlueprintValidationPanel} from "./BlueprintValidationPanel";
import {LayoutFieldset} from "./LayoutFieldset";
import {MetadataFieldset} from "./MetadataFieldset";
import {PaylinesEditor} from "./PaylinesEditor";
import {PaytableEditor} from "./PaytableEditor";
import {ReelGenerationModeSelector} from "./ReelGenerationModeSelector";
import {SectionedFormEditor} from "./SectionedFormEditor";
import {SymbolsTable} from "./SymbolsTable";

type BlueprintMode = "form" | "json";

function guidedStepIndex(status: BlueprintValidationView["status"]): number {
    if (status === "idle") {
        return 0;
    }
    if (status === "ok") {
        return 2;
    }
    return 1;
}

type GuidedNextStep = {tone: "info" | "success" | "warning"; title: string; description: string};

function describeGuidedNextStep(status: BlueprintValidationView["status"]): GuidedNextStep {
    if (status === "ok") {
        return {
            tone: "success",
            title: "Ready to build",
            description: "Your blueprint is valid — build your package below to open it in the Project Dashboard.",
        };
    }
    if (status === "invalid") {
        return {tone: "warning", title: "Fix validation issues", description: "Resolve the errors below before building your package."};
    }
    if (status === "error") {
        return {tone: "warning", title: "Validation failed", description: "Something went wrong while validating — try again."};
    }
    return {
        tone: "info",
        title: "Configure your game model",
        description: "Add symbols, bets, paylines and a paytable below, then validate your configuration.",
    };
}

// `guided`/`initialPath` are purely additive -- omitted (the "Advanced Tools" raw editor's usage),
// this component renders exactly as it always has. `guided` adds a step indicator + next-step hint and
// tucks JSON mode/Load-by-path/Save behind an "advanced options" disclosure, since Build works directly
// off the in-memory blueprint and doesn't strictly need either in the guided happy path. `initialPath`
// (set when arriving via Project Overview's "Configure Game Model" link) auto-loads that blueprint on
// mount, reusing the exact same handleLoad a manual Load click would use.
export function BlueprintEditorPage({
    guided = false,
    initialPath,
    onDirtyChange,
}: {guided?: boolean; initialPath?: string; onDirtyChange?: (dirty: boolean) => void} = {}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [mode, setMode] = useState<BlueprintMode>("form");
    const [blueprintPath, setBlueprintPath] = useState<string>();
    const overwriteConfirmedForPath = useRef<string | undefined>(undefined);
    const [loadView, setLoadView] = useState<BlueprintLoadView>({status: "idle"});
    const [saveView, setSaveView] = useState<BlueprintSaveView>({status: "idle"});
    const [validationView, setValidationView] = useState<BlueprintValidationView>({status: "idle"});
    const loadGuard = useDoubleSubmitGuard();
    const saveGuard = useDoubleSubmitGuard();
    const validateGuard = useDoubleSubmitGuard();
    const [advancedOpened, {toggle: toggleAdvanced}] = useDisclosure(false);

    // Dirty-tracking: `cleanRevisionRef` is the last revision known to be "safe" (freshly loaded, freshly
    // saved, or freshly built) -- any revision past it means there are edits nothing on disk/in a package
    // reflects yet. New/Load reset it via `nextFormGenerationIsClean` (consumed in the formGeneration
    // effect below, since only a *post-commit* read of `editor.state.revision` is correct there -- see the
    // stabilization-pass plan for why manual `+1` arithmetic in the click handler isn't reliable). A
    // successful JSON-textarea apply also bumps formGeneration but is deliberately NOT treated as clean --
    // it's still an unsaved edit, just a wholesale one.
    const cleanRevisionRef = useRef(editor.state.revision);
    const nextFormGenerationIsClean = useRef(false);
    // Save/Build success mutate cleanRevisionRef from an async callback, which (being a ref) doesn't
    // itself trigger a re-render -- this forces one so `isDirty` below gets recomputed against whatever
    // editor.state.revision *actually* is by then (which may have moved past what was saved/built, if
    // the user kept editing during the round-trip -- markClean must never just report "not dirty").
    const [, forceRerenderAfterMarkClean] = useState(0);
    const markClean = (revisionThatWasPersisted: number): void => {
        cleanRevisionRef.current = revisionThatWasPersisted;
        forceRerenderAfterMarkClean((n) => n + 1);
    };
    useEffect(() => {
        if (nextFormGenerationIsClean.current) {
            cleanRevisionRef.current = editor.state.revision;
            nextFormGenerationIsClean.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.formGeneration]);
    // Refs must never be read during render (react-hooks/refs) -- reading cleanRevisionRef.current here,
    // inside an effect with no dependency array, runs after every render instead, which for this
    // component is effectively every meaningful state change anyway (a mutate/New/Load/Save/Build always
    // re-renders); onDirtyChange is idempotent, so a few redundant calls with the same value are harmless.
    useEffect(() => {
        onDirtyChange?.(editor.state.revision !== cleanRevisionRef.current);
    });

    // A form edit, New, Load, and a successful JSON Apply all bump `revision` (see
    // blueprintEditorState.ts's own doc comment) -- resetting validationView to idle on every bump, in
    // one place, uniformly makes *any* of those stale a previous validation result: section statuses
    // (describeSectionStatus already returns "neutral" for "idle"), the Stepper/NextStepCallout ("Ready
    // to build" only shows for "ok"), and guided Build-gating (below, keyed off "ok") all revert for
    // free, with no separate reset needed at each call site. `handleNew` no longer sets this explicitly.
    useEffect(() => {
        setValidationView({status: "idle"});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision]);

    // Kept in sync with the latest revision on every render so handleValidate's async resolve handler
    // can read the *current* value at response time, not the one closed over at request-send time --
    // same pattern ReelStripGenerationEditor.tsx's own "Resolve reels" preview already uses for its own
    // staleness guard.
    const revisionRef = useRef(editor.state.revision);
    useEffect(() => {
        revisionRef.current = editor.state.revision;
    }, [editor.state.revision]);
    // A second, independent staleness signal alongside revision: incremented once per validate request
    // that actually starts, so a request whose *response* arrives after a *newer* validate request began
    // is recognized as stale even in the (currently impossible, since validateGuard already serializes
    // validate calls) case that guarantee ever changes.
    const validateRequestIdRef = useRef(0);

    const handleNew = (): void => {
        nextFormGenerationIsClean.current = true;
        editor.newBlueprint();
        setBlueprintPath(undefined);
        overwriteConfirmedForPath.current = undefined;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
    };

    const handleLoad = (path: string): void => {
        if (!loadGuard.begin()) {
            return;
        }
        setLoadView({status: "loading"});
        loadBlueprint(fetchImpl, path)
            .then((result) => {
                setLoadView(describeLoadResult(result));
                if (result.status === "ok") {
                    nextFormGenerationIsClean.current = true;
                    editor.loadFrom(result.blueprint);
                    setBlueprintPath(result.path);
                    overwriteConfirmedForPath.current = result.path;
                }
            })
            .catch((error: unknown) => setLoadView({status: "error", message: errorMessage(error)}))
            .finally(() => loadGuard.end());
    };

    useEffect(() => {
        if (initialPath) {
            handleLoad(initialPath);
        }
        // Only ever auto-loads the path this page mounted with -- a later prop change (there isn't one
        // in practice, since it only comes from a one-time navigation state) must not re-trigger a load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSave = (path: string, overwrite: boolean): void => {
        if (!saveGuard.begin()) {
            return;
        }
        // Captured now, at request-send time -- see the same reasoning on BlueprintBuildPanel's own
        // `builtRevision` capture for why response-time would be wrong if edits happen mid-flight.
        const savedRevision = editor.state.revision;
        setSaveView({status: "loading"});
        saveBlueprint(fetchImpl, path, editor.state.blueprint, overwrite)
            .then((result) => {
                setSaveView(describeSaveResult(result));
                if (result.status === "ok") {
                    setBlueprintPath(result.path);
                    overwriteConfirmedForPath.current = result.path;
                    markClean(savedRevision);
                }
            })
            .catch((error: unknown) => setSaveView({status: "error", message: errorMessage(error)}))
            .finally(() => saveGuard.end());
    };

    const handleSave = (path: string): void => {
        runSave(path, overwriteConfirmedForPath.current === path);
    };

    const handleOverwrite = (path: string): void => {
        confirm(`Overwrite the blueprint at "${path}"?`, () => runSave(path, true));
    };

    const handleValidate = (): void => {
        if (!validateGuard.begin()) {
            return;
        }
        // Captured now, at request-send time -- compared against the *current* refs at response time, so
        // a response for a blueprint that's since changed (an edit, New, Load, JSON Apply -- anything
        // that bumped revision) or been superseded by a newer validate request is discarded rather than
        // clobbering whatever the current, already-reset-to-idle state should be.
        const requestedRevision = editor.state.revision;
        const requestId = ++validateRequestIdRef.current;
        const isStale = (): boolean => requestId !== validateRequestIdRef.current || requestedRevision !== revisionRef.current;
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, editor.state.blueprint)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                setValidationView(describeValidation(result));
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setValidationView({status: "error", message: errorMessage(error)});
            })
            .finally(() => validateGuard.end());
    };

    const {blueprint, revision} = editor.state;

    const stepIndex = guidedStepIndex(validationView.status);
    const nextStep = describeGuidedNextStep(validationView.status);

    // Guided flow requires an actual successful validation *of the current revision* before allowing a
    // build -- not just "not known-invalid" (the raw editor's own, looser rule below, unchanged). Since
    // validationView is reset to "idle" on every revision bump (see the effect above), "ok" here can
    // only ever mean "the current revision validated cleanly" -- warnings don't prevent it, matching
    // BlueprintBuildPanel's own existing "warnings-only never blocks" contract.
    const guidedBuildBlocked = validationView.status !== "ok";
    const guidedBuildBlockedMessage =
        validationView.status === "invalid" ? "Fix the validation errors above before building." : "Validate your configuration successfully before building.";

    const formModeContent = guided ? (
        <SectionedFormEditor
            key={editor.formGeneration}
            blueprint={blueprint}
            mutate={editor.mutate}
            drafts={editor.drafts}
            revision={revision}
            validationView={validationView}
        />
    ) : (
        <div key={editor.formGeneration}>
            <MetadataFieldset blueprint={blueprint} mutate={editor.mutate} />
            <LayoutFieldset blueprint={blueprint} mutate={editor.mutate} />
            <SymbolsTable blueprint={blueprint} mutate={editor.mutate} />
            <BetsList blueprint={blueprint} mutate={editor.mutate} />
            <PaylinesEditor blueprint={blueprint} mutate={editor.mutate} />
            <PaytableEditor blueprint={blueprint} mutate={editor.mutate} />
            <ReelGenerationModeSelector blueprint={blueprint} mutate={editor.mutate} drafts={editor.drafts} revision={revision} />
        </div>
    );

    return (
        <div>
            {guided && (
                <div>
                    <Title order={2}>Design & Build Your Game</Title>
                    <Text c="dimmed" size="sm" mb="md">
                        Start from a blank blueprint or load an existing one, configure your game model, validate it, then build your
                        game package.
                    </Text>
                    <Stepper active={stepIndex} mb="md" size="sm" allowNextStepsSelect={false}>
                        <Stepper.Step label="Configure" description="Game model" />
                        <Stepper.Step label="Validate" description="Check for issues" />
                        <Stepper.Step label="Build" description="Create your package" />
                    </Stepper>
                    <NextStepCallout {...nextStep} />
                </div>
            )}

            {guided && (
                <Text size="sm" mb="sm">
                    <Anchor component="button" type="button" onClick={toggleAdvanced}>
                        {advancedOpened ? "Hide" : "Show"} advanced options (JSON mode, load/save by path)
                    </Anchor>
                </Text>
            )}

            <BlueprintLoadSaveControls
                onNew={handleNew}
                onLoad={handleLoad}
                onSave={handleSave}
                onOverwrite={handleOverwrite}
                loadView={loadView}
                saveView={saveView}
                initialLoadPath=""
                initialSavePath=""
                advancedOptionsOpened={guided ? advancedOpened : undefined}
            />

            <Collapse expanded={!guided || advancedOpened}>
                <SegmentedControl
                    value={mode}
                    onChange={(value) => setMode(value as BlueprintMode)}
                    data={[
                        {label: "Form", value: "form"},
                        {label: "JSON", value: "json"},
                    ]}
                    mb="md"
                    aria-label="Blueprint editor mode"
                />
            </Collapse>

            {mode === "form" ? (
                formModeContent
            ) : (
                <BlueprintJsonPanel jsonText={editor.state.jsonText} jsonError={editor.state.jsonError} onApply={editor.applyJson} />
            )}

            <BlueprintValidationPanel view={validationView} onValidate={handleValidate} />
            <BlueprintBuildPanel
                blueprint={blueprint}
                sourcePath={blueprintPath}
                revision={revision}
                onBuildSuccess={markClean}
                blocked={guided ? guidedBuildBlocked : validationView.status === "invalid"}
                blockedMessage={guided ? guidedBuildBlockedMessage : undefined}
            />
        </div>
    );
}
