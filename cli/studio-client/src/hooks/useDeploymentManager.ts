import {useCallback, useRef, useState} from "react";
import {listDeploymentTargets, runDeployment} from "../api/apiClient";
import type {StudioDeploymentModeInput, StudioDeploymentTargetSummary} from "../api/types";
import {useStudioApi} from "../context/StudioApiProvider";
import {DeploymentRunTracker} from "../domain/deploymentRunTracker";
import {errorMessage} from "../domain/errorMessage";
import {
    describeDeploymentRunResult,
    describeDeploymentTargetsList,
    type DeploymentRunResultView,
    type DeploymentTargetsListView,
} from "../domain/interpret/Deployment";

// Owns the Deployment tab's state, including the DeploymentRunTracker (ported unchanged) that guards
// against double-submits and stale/out-of-order responses -- a page-level hook for the same "must
// survive tab switches" reasoning as every other tab here (a Preview/Deploy request may still be in
// flight when the user looks at a different tab).
export function useDeploymentManager() {
    const fetchImpl = useStudioApi();
    const [targetsView, setTargetsView] = useState<DeploymentTargetsListView>({status: "empty"});
    const [targetsError, setTargetsError] = useState<string>();
    const [selectedTarget, setSelectedTarget] = useState<StudioDeploymentTargetSummary>();
    const [modes, setModes] = useState<StudioDeploymentModeInput[]>([{modeName: "", libraryPath: ""}]);
    const [runResult, setRunResult] = useState<DeploymentRunResultView>();
    const [runError, setRunError] = useState<string>();
    const [runLoading, setRunLoading] = useState(false);
    const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>();
    const trackerRef = useRef(new DeploymentRunTracker());

    const refreshTargets = useCallback(() => {
        listDeploymentTargets(fetchImpl)
            .then((targets) => {
                setTargetsView(describeDeploymentTargetsList(targets));
                setTargetsError(undefined);
                setSelectedTarget((prev) => (prev !== undefined && !targets.some((target) => target.id === prev.id) ? undefined : prev));
            })
            .catch((error: unknown) => setTargetsError(errorMessage(error)));
    }, [fetchImpl]);

    const invalidate = useCallback(() => {
        trackerRef.current.invalidate();
        setRunResult(undefined);
        setRunError(undefined);
        setSelectedArtifactPath(undefined);
        setRunLoading(trackerRef.current.isRunInFlight());
    }, []);

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
    };
}
