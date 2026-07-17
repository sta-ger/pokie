import {useCallback, useRef, useState} from "react";
import {listDeploymentTargets, runDeployment} from "../api/apiClient";
import type {StudioDeploymentModeInput, StudioDeploymentTargetSummary} from "../api/types";
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

// Owns the Deployment tab's state, including the DeploymentRunTracker (ported unchanged) that guards
// against double-submits and stale/out-of-order responses -- a page-level hook for the same "must
// survive tab switches" reasoning as every other tab here (a Preview/Deploy request may still be in
// flight when the user looks at a different tab).
export function useDeploymentManager() {
    const fetchImpl = useStudioApi();
    const [targetsView, setTargetsView] = useState<DeploymentTargetsListView>({status: "loading"});
    const [targetsError, setTargetsError] = useState<string>();
    const [selectedTarget, setSelectedTarget] = useState<StudioDeploymentTargetSummary>();
    const [modes, setModes] = useState<StudioDeploymentModeInput[]>([{modeName: "", libraryPath: ""}]);
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

    // Monotonic request id guarding refreshTargets() against a stale/out-of-order response -- same
    // requestId pattern ProjectDashboardPage's own refreshRecentSpins() uses. Two overlapping Refresh
    // clicks (or a Refresh still in flight when the project switches, see resetForProjectSwitch() below)
    // must only ever apply the response matching the *latest* call; an older one landing later is
    // silently discarded rather than clobbering a newer, already-rendered targets list.
    const targetsRequestIdRef = useRef(0);

    const refreshTargets = useCallback(() => {
        const requestId = ++targetsRequestIdRef.current;
        setTargetsView({status: "loading"});
        listDeploymentTargets(fetchImpl)
            .then((targets) => {
                if (requestId !== targetsRequestIdRef.current) {
                    return;
                }
                setTargetsView(describeDeploymentTargetsList(targets));
                setTargetsError(undefined);

                // Rebind the selection to the fresh object this response returned -- never keep showing
                // the previous request's own reference once a newer one has landed. If the target
                // disappeared from the registry, or its own descriptor (version/capabilities/requirements)
                // changed underneath the current selection, any preview/deploy result already shown was
                // computed against a descriptor that's no longer accurate and must be invalidated -- see
                // hasTargetDescriptorChanged's own doc comment.
                if (selectedTarget !== undefined) {
                    const fresh = targets.find((target) => target.id === selectedTarget.id);
                    if (fresh === undefined) {
                        setSelectedTarget(undefined);
                        invalidate();
                    } else {
                        setSelectedTarget(fresh);
                        if (hasTargetDescriptorChanged(selectedTarget, fresh)) {
                            invalidate();
                        }
                    }
                }
            })
            .catch((error: unknown) => {
                if (requestId !== targetsRequestIdRef.current) {
                    return;
                }
                setTargetsError(errorMessage(error));
            });
    }, [fetchImpl, selectedTarget, invalidate]);

    // Called from ProjectDashboardPage's own projectKey effect -- a genuinely different project must
    // never show a trace of the previous one's target selection, modes, or run result, same reasoning as
    // useRuntimeManager's own resetForProjectSwitch(). Reuses invalidate() for the tracker-revision-bump/
    // run-result-clearing part (a run still in flight from before the switch becomes stale and is safely
    // ignored once it resolves, exactly like any other invalidation -- there is nothing to cancel over
    // plain fetch), and additionally clears the target/modes/targets-list state invalidate() alone never
    // touches, since those are select-target/configure inputs, not run outputs. Bumps
    // targetsRequestIdRef too, so a targets response still in flight from the *previous* project can
    // never land afterward and repopulate what this reset just cleared with another project's targets.
    const resetForProjectSwitch = useCallback(() => {
        targetsRequestIdRef.current++;
        invalidate();
        setSelectedTarget(undefined);
        setModes([{modeName: "", libraryPath: ""}]);
        setTargetsView({status: "loading"});
        setTargetsError(undefined);
    }, [invalidate]);

    const selectTarget = useCallback(
        (target: StudioDeploymentTargetSummary) => {
            setSelectedTarget(target);
            invalidate();
        },
        [invalidate],
    );

    const updateMode = useCallback(
        (index: number, patch: Partial<StudioDeploymentModeInput>) => {
            setModes((prev) => prev.map((mode, i) => (i === index ? {...mode, ...patch} : mode)));
            invalidate();
        },
        [invalidate],
    );

    const addMode = useCallback(() => {
        setModes((prev) => [...prev, {modeName: "", libraryPath: ""}]);
        invalidate();
    }, [invalidate]);

    const removeMode = useCallback(
        (index: number) => {
            setModes((prev) => (prev.length > 1 ? prev.filter((_mode, i) => i !== index) : [{modeName: "", libraryPath: ""}]));
            invalidate();
        },
        [invalidate],
    );

    const run = useCallback(
        (publish: boolean) => {
            if (selectedTarget === undefined) {
                return;
            }
            const token = trackerRef.current.beginRun();
            if (token === undefined) {
                return;
            }
            setSelectedArtifactPath(undefined);
            // A previous run's error must never linger once a new attempt starts -- otherwise a retry
            // that's still in flight would keep showing the *old* failure's ErrorState alongside its own
            // loading indicator, and a stale-but-not-yet-cleared error could outlive a run that actually
            // succeeds (see the success branch below, which clears it again for the same reason).
            setRunError(undefined);
            setRunLoading(true);

            runDeployment(fetchImpl, selectedTarget.id, modes, publish)
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
        [fetchImpl, selectedTarget, modes],
    );

    return {
        targetsView,
        targetsError,
        selectedTarget,
        modes,
        runResult,
        runError,
        runLoading,
        selectedArtifactPath,
        refreshTargets,
        selectTarget,
        updateMode,
        addMode,
        removeMode,
        run,
        selectArtifact: setSelectedArtifactPath,
        resetForProjectSwitch,
    };
}
