import {MathDefinitionDiffPreview} from "../common/MathDefinitionDiffPreview";
import {Button} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {previewGameModel} from "../../api/apiClient";
import type {GameModelProjection} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {GameModelSections} from "../project/GameModelSections";

type PreviewState = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | {status: "loaded"; projection: GameModelProjection};

// Design Game's own on-demand live preview of the exact same read-only Game Model view the Project
// Workspace's Game Model tab shows for a saved Blueprint project (GameModelTab.tsx) -- both render
// GameModelSections over a GameModelProjection, and both projections come from the exact same core
// buildGameModelProjection() (see StudioBlueprintService.previewGameModel's own doc comment for how this
// panel's own POST reaches it directly against the in-editor draft, with no save/build round trip in
// between). On-demand (a button, not auto-debounced like Validate) purely to avoid adding a second
// debounced request alongside BlueprintEditorPage's existing auto-validate one -- the preview is a
// deliberate "show me" action, not a live-as-you-type view.
export function GameModelPreviewPanel({blueprint, sourcePath, revision}: {blueprint: unknown; sourcePath?: string; revision?: number}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<PreviewState>({status: "idle"});
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});
    // Both completed and pending previews belong to one applied draft/source. Keep the
    // request guard as well as abort: a transport may still deliver an obsolete response.
    useEffect(() => {
        const requests = lifecycle.current;
        requests.generation++;
        requests.active?.abort();
        setState({status: "idle"});
        return () => {
            requests.generation++;
            requests.active?.abort();
        };
    }, [blueprint, sourcePath, revision, fetchImpl]);
    // Undefined keeps the Reels section's own default, reproducible "symbolWeights"/"default" sample --
    // see GameModelTab's own `sharedWeightsSampleSeed` doc comment for why this is only ever set by the
    // "New sample" action below.
    const [sharedWeightsSampleSeed, setSharedWeightsSampleSeed] = useState<number>();

    function handlePreview(seed?: number): void {
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const generation = ++lifecycle.current.generation;
        const isCurrent = (): boolean => lifecycle.current.generation === generation && !controller.signal.aborted;
        setState({status: "loading"});
        previewGameModel(fetchImpl, blueprint, seed ?? sharedWeightsSampleSeed, controller.signal)
            .then((projection) => {
                if (isCurrent()) setState({status: "loaded", projection});
            })
            .catch((error: unknown) => {
                if (isCurrent()) setState({status: "error", message: errorMessage(error)});
            });
    }

    function handleNewSample(): void {
        const seed = Math.floor(Math.random() * 1_000_000);
        setSharedWeightsSampleSeed(seed);
        handlePreview(seed);
    }

    return (
        <PageSection legend="Game Model preview">
            <MathDefinitionDiffPreview sourcePath={sourcePath} draft={blueprint} revision={revision} />
            <QuickActions>
                <Button onClick={() => handlePreview()} loading={state.status === "loading"}>
                    Preview Game Model
                </Button>
            </QuickActions>
            {state.status === "error" && (
                <ErrorState
                    message="We couldn't build this game model preview. Check the game design, then try previewing it again."
                    detail={state.message}
                />
            )}
            {state.status === "loading" && <LoadingState label="Building preview…" />}
            {state.status === "loaded" && (
                <GameModelSections projection={state.projection} reelsSampleControls={{onNewSample: handleNewSample, loading: false}} />
            )}
        </PageSection>
    );
}
