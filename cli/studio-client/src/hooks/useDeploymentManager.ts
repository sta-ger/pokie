import {useCallback, useEffect, useRef, useState} from "react";
import {getDeploymentBuildModes, listDeploymentTargets, runDeployment} from "../api/apiClient";
import type {StudioDeploymentTargetSummary} from "../api/types";
import {useStudioApi} from "../context/StudioApiProvider";
import {DeploymentRunTracker} from "../domain/deploymentRunTracker";
import {errorMessage} from "../domain/errorMessage";
import {
    describeDeploymentRunResult,
    describeDeploymentTargetsList,
    hasTargetDescriptorChanged,
    type DeploymentRunResultView,
    type DeploymentTargetsListView,
} from "../domain/interpret/Deployment";

// The project's own *current built package* modes (see getDeploymentBuildModes/
// resolveCurrentBuildModeIds's own doc comment) -- deliberately not CertificationTab's own
// inspectProject -> loadBlueprint -> betModes lookup, which reflects the editable tracked source
// instead. "unavailable" covers both "no current build" and "load failed": either way, the Configure
// step's own mode picker has nothing to pick from -- the Configure step blocks mode-name entry, Add
// mode, and deployment preflight entirely until this resolves to "ok" (see
// describeBuildModesUnavailable), rather than falling back to a hand-typed mode name.
export type DeploymentProjectModesView = {status: "loading"} | {status: "unavailable"} | {status: "ok"; modeIds: readonly string[]};

// Owns the Deployment tab's state, including the DeploymentRunTracker (ported unchanged) that guards
// against double-submits and stale/out-of-order responses -- a page-level hook for the same "must
// survive tab switches" reasoning as every other tab here (a Preview/Deploy request may still be in
// flight when the user looks at a different tab). Also owns the Configure step's own mode-mapping
// inputs: the project's own build modes (so a mode is always picked from a real bet mode, never typed
// free-hand) and the outcome-library registry (so each mode's own library is discovered, not left an
// empty path) -- see domain/interpret/Deployment.ts's own mode-mapping section for the pure decision
// logic built on top of these two.
export function useDeploymentManager() {
    const fetchImpl = useStudioApi();
    const [targetsView, setTargetsView] = useState<DeploymentTargetsListView>({status: "loading"});
    const [targetsError, setTargetsError] = useState<string>();
    const [selectedTarget, setSelectedTarget] = useState<StudioDeploymentTargetSummary>();
    // Mirrors `selectedTarget` synchronously, updated by every setter below in lockstep with its own
    // setSelectedTarget() call -- unlike the `selectedTarget` state variable itself, this is never stale
    // inside an async callback. refreshTargets()'s own `.then()` reads this instead of closing over
    // `selectedTarget` directly: when resetForProjectSwitch() and a following refreshTargets() are called
    // back-to-back (see ProjectDashboardPage's own projectKey effect), refreshTargets()'s closure is
    // formed *before* React has re-rendered with resetForProjectSwitch()'s setSelectedTarget(undefined)
    // applied, so `selectedTarget` in that closure would still read the *previous* project's target --
    // and by the time the fetch resolves, this ref (updated synchronously the moment
    // resetForProjectSwitch() ran, no render needed) already reflects the reset, so the response can
    // never rebind to a same-id target from a different project.
    const selectedTargetRef = useRef<StudioDeploymentTargetSummary | undefined>(undefined);
    const [projectModesView, setProjectModesView] = useState<DeploymentProjectModesView>({status: "loading"});
    const [runResult, setRunResult] = useState<DeploymentRunResultView>();
    const [runError, setRunError] = useState<string>();
    const [runLoading, setRunLoading] = useState(false);
    const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>();
    const trackerRef = useRef(new DeploymentRunTracker());

    const invalidate = useCallback(() => {
        trackerRef.current.invalidate();
        setRunResult(undefined);
        setRunError(undefined);
        setSelectedArtifactPath(undefined);
        setRunLoading(trackerRef.current.isRunInFlight());
    }, []);

    // Whether a previously *successful* Check-compatibility/preview run no longer reflects the current
    // Configure-step inputs -- true only once something that actually invalidates it (a mode/library/target
    // edit, or the selected target's own descriptor changing underneath it, see markConfigChanged below)
    // happens *after* a run already landed. Deliberately distinct from "nothing has been run yet" (plain
    // `runResult === undefined` with this staying false) -- the Configure step's own banner (see
    // ExportDeployTab) reads this to tell a user who already checked once "what you saw is stale, re-check"
    // apart from "you haven't checked at all yet". Cleared the instant a fresh run starts (see run() below)
    // and by resetForProjectSwitch(), which starts an entirely new context with nothing to call outdated.
    const [preflightOutdated, setPreflightOutdated] = useState(false);
    // Mirrors `runResult` synchronously for markConfigChanged's own read below -- every config-changing
    // setter is a useCallback whose own dependency list doesn't include `runResult` itself (adding it would
    // recreate the setter, and the components it's passed to, on every run), so this ref is what lets that
    // callback see whether a run result currently exists without depending on it directly.
    const runResultRef = useRef<DeploymentRunResultView>(undefined);
    useEffect(() => {
        runResultRef.current = runResult;
    }, [runResult]);

    // The single path every Configure-step edit (mode name/library, add/remove row, target
    // selection/descriptor change) invalidates a stale run through -- same invalidate() effect, plus
    // marking preflightOutdated when there was actually a run to go stale (a blank-to-blank edit before
    // ever running once has nothing to call outdated).
    const markConfigChanged = useCallback(() => {
        if (runResultRef.current !== undefined) {
            setPreflightOutdated(true);
        }
        invalidate();
    }, [invalidate]);

    // Monotonic request id guarding refreshTargets() against a stale/out-of-order response -- same
    // requestId pattern ProjectDashboardPage's own refreshRecentSpins() uses. Two overlapping Refresh
    // clicks (or a Refresh still in flight when the project switches, see resetForProjectSwitch() below)
    // must only ever apply the response matching the *latest* call; an older one landing later is
    // silently discarded rather than clobbering a newer, already-rendered targets list.
    const targetsRequestIdRef = useRef(0);

    const refreshTargets = useCallback(() => {
        const requestId = ++targetsRequestIdRef.current;
        setTargetsView({status: "loading"});
        // A previous Refresh's own failure must never linger once a new one starts -- same reasoning as
        // run()'s own runError clearing below.
        setTargetsError(undefined);
        listDeploymentTargets(fetchImpl)
            .then((targets) => {
                if (requestId !== targetsRequestIdRef.current) {
                    return;
                }
                setTargetsView(describeDeploymentTargetsList(targets));
                setTargetsError(undefined);

                // Rebind the selection to the fresh object this response returned -- never keep showing
                // the previous request's own reference once a newer one has landed. Reads
                // selectedTargetRef (not the `selectedTarget` this closure would otherwise capture) so a
                // resetForProjectSwitch() called just before this refreshTargets() -- see that function's
                // own doc comment -- is always observed here, even though this closure was formed before
                // React re-rendered with that reset applied. If the target disappeared from the registry,
                // or its own descriptor (version/capabilities/requirements) changed underneath the current
                // selection, any preview/deploy result already shown was computed against a descriptor
                // that's no longer accurate and must be invalidated -- see hasTargetDescriptorChanged's
                // own doc comment.
                const current = selectedTargetRef.current;
                if (current !== undefined) {
                    const fresh = targets.find((target) => target.id === current.id);
                    if (fresh === undefined) {
                        selectedTargetRef.current = undefined;
                        setSelectedTarget(undefined);
                        markConfigChanged();
                    } else {
                        selectedTargetRef.current = fresh;
                        setSelectedTarget(fresh);
                        if (hasTargetDescriptorChanged(current, fresh)) {
                            markConfigChanged();
                        }
                    }
                } else if (targets.length === 1) {
                    // Nothing to choose between -- a lone registered target is selected automatically, so
                    // Select-target never forces a click through an artificial single-option step. Never
                    // fires once something is already selected (the `current !== undefined` branch above
                    // owns that case), so this can only ever pick this project's own first/only target, not
                    // silently override a deliberate choice.
                    selectedTargetRef.current = targets[0];
                    setSelectedTarget(targets[0]);
                }
            })
            .catch((error: unknown) => {
                if (requestId !== targetsRequestIdRef.current) {
                    return;
                }
                setTargetsError(errorMessage(error));
            });
    }, [fetchImpl, markConfigChanged]);

    // The Build/Export tab only reads current build modes to label outcome
    // generation. Deployment itself sends no selector: the server owns the
    // prerequisite lookup, plan preparation, and terminal result.
    const modesRequestIdRef = useRef(0);
    const refreshProjectModes = useCallback(() => {
        const requestId = ++modesRequestIdRef.current;
        setProjectModesView({status: "loading"});

        getDeploymentBuildModes(fetchImpl)
            .then((view) => {
                if (requestId === modesRequestIdRef.current) {
                    setProjectModesView(view);
                }
            })
            .catch(() => {
                if (requestId === modesRequestIdRef.current) {
                    setProjectModesView({status: "unavailable"});
                }
            });

    }, [fetchImpl]);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's target selection, modes, or run result. Reuses
    // invalidate() for the tracker-revision-bump/run-result-clearing part (a run still in flight from
    // before the switch becomes stale and is safely ignored once it resolves, exactly like any other
    // invalidation -- there is nothing to cancel over plain fetch), and additionally clears the
    // target/modes/targets-list state invalidate() alone never touches, since those are
    // select-target/configure inputs, not run outputs. Bumps
    // targetsRequestIdRef too, so a targets response still in flight from the *previous* project can
    // never land afterward and repopulate what this reset just cleared with another project's targets.
    // Updates selectedTargetRef synchronously (not just the `selectedTarget` state, which only takes
    // effect after React's next render) -- see refreshTargets()'s own doc comment: a caller that calls
    // this and then immediately calls refreshTargets() (exactly what ProjectDashboardPage's own
    // projectKey effect does) must have that refreshTargets() see the cleared selection right away, even
    // before any re-render has happened.
    const resetForProjectSwitch = useCallback(() => {
        targetsRequestIdRef.current++;
        modesRequestIdRef.current++;
        invalidate();
        setPreflightOutdated(false);
        selectedTargetRef.current = undefined;
        setSelectedTarget(undefined);
        setTargetsView({status: "loading"});
        setTargetsError(undefined);
        setProjectModesView({status: "loading"});
    }, [invalidate]);

    const selectTarget = useCallback(
        (target: StudioDeploymentTargetSummary) => {
            selectedTargetRef.current = target;
            setSelectedTarget(target);
            markConfigChanged();
        },
        [markConfigChanged],
    );

    // Sets a row's own mode name (from the Configure step's Select, only ever reachable once the
    // project's own build modes are known -- see describeBuildModesUnavailable) -- re-discovers that
    // mode's own librarySelector from the
    // current registry alongside it only when the row's existing selector is itself blank or was itself
    // auto-discovered (see isAutoDiscoverableLibrarySelector's own doc comment); a selector the user
    // picked by hand (Choose) is left untouched by a mode-name edit, only ever replaced by an explicit
    // setModeLibrarySelector call below.
    // Only ever adds a row when there is a build mode left to add it for (or the project's own build
    // modes aren't known at all -- see canAddDeploymentMode's own doc comment) and the selected target
    // actually declares multiMode; the new row is auto-filled with the sole remaining choice the same way
    // the very first row is, so picking is only ever needed when there's a genuine choice to make.
    const run = useCallback(
        // `targetOverride` lets a caller that owns its own target list (Build/Export's ExportDeployTab,
        // choosing straight from an ExportDeployTargetCard) select-and-run in one action, without a
        // separate selectTarget() call first landing in a stale closure of `selectedTarget` -- see
        // ExportDeployTab's own doc comment. Every other caller omits it entirely and keeps running
        // against whatever selectTarget() already put in state, unchanged.
        // The request contains no prerequisite selector. The server prepares
        // and executes the authoritative prerequisite plan atomically.
        (publish: boolean, targetOverride?: StudioDeploymentTargetSummary) => {
            const target = targetOverride ?? selectedTarget;
            if (target === undefined) {
                return;
            }
            const token = trackerRef.current.beginRun();
            if (token === undefined) {
                return;
            }
            if (targetOverride !== undefined && targetOverride.id !== selectedTarget?.id) {
                selectedTargetRef.current = targetOverride;
                setSelectedTarget(targetOverride);
            }
            setSelectedArtifactPath(undefined);
            // A fresh run is exactly what clears "outdated" -- whatever it lands on (success or failure) is
            // itself the up to date answer for the *current* Configure-step inputs, not a stale one.
            setPreflightOutdated(false);
            // A previous run's error must never linger once a new attempt starts -- otherwise a retry
            // that's still in flight would keep showing the *old* failure's ErrorState alongside its own
            // loading indicator, and a stale-but-not-yet-cleared error could outlive a run that actually
            // succeeds (see the success branch below, which clears it again for the same reason).
            setRunError(undefined);
            // Same reasoning for the previous run's *result*: ExportDeployTab doesn't gate its own
            // buttons on runLoading, so leaving the old runResult in place while a new Check/Publish is
            // in flight would let the user see the previous run's outcome banner with nothing indicating
            // a newer run (which may land a different outcome entirely) is currently executing.
            setRunResult(undefined);
            setRunLoading(true);

            // The server selects and verifies the deployment prerequisite. The
            // browser state is never an authority or a selector submitted with
            // this action.
            runDeployment(fetchImpl, target.id, undefined, publish)
                .then((view) => {
                    trackerRef.current.endRun();
                    setRunLoading(trackerRef.current.isRunInFlight());
                    if (!trackerRef.current.isCurrent(token)) {
                        return;
                    }
                    const described = describeDeploymentRunResult(view);
                    setRunResult(described);
                    setRunError(undefined);
                    setSelectedArtifactPath(described.artifacts[0]?.relativePath);
                })
                .catch((error: unknown) => {
                    trackerRef.current.endRun();
                    setRunLoading(trackerRef.current.isRunInFlight());
                    if (!trackerRef.current.isCurrent(token)) {
                        return;
                    }
                    setRunError(errorMessage(error));
                });
        },
        [fetchImpl, selectedTarget],
    );

    return {
        targetsView,
        targetsError,
        selectedTarget,
        projectModesView,
        runResult,
        runError,
        runLoading,
        preflightOutdated,
        selectedArtifactPath,
        refreshTargets,
        refreshProjectModes,
        selectTarget,
        run,
        selectArtifact: setSelectedArtifactPath,
        resetForProjectSwitch,
    };
}

// ExportDeployTab's own prop type -- it renders straight off this hook's return shape (owned by
// ProjectDashboardPage, the same instance it renders off) instead of threading each field through as
// its own prop.
export type DeploymentManager = ReturnType<typeof useDeploymentManager>;
