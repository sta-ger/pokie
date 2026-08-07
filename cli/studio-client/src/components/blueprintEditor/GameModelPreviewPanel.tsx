import {Button} from "@mantine/core";
import {useState} from "react";
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
export function GameModelPreviewPanel({blueprint}: {blueprint: unknown}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<PreviewState>({status: "idle"});

    function handlePreview(): void {
        setState({status: "loading"});
        previewGameModel(fetchImpl, blueprint)
            .then((projection) => setState({status: "loaded", projection}))
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
    }

    return (
        <PageSection legend="Game Model preview">
            <QuickActions>
                <Button onClick={handlePreview} loading={state.status === "loading"}>
                    Preview Game Model
                </Button>
            </QuickActions>
            {state.status === "error" && <ErrorState message={`Couldn't preview the game model: ${state.message}`} />}
            {state.status === "loading" && <LoadingState label="Building preview…" />}
            {state.status === "loaded" && <GameModelSections projection={state.projection} />}
        </PageSection>
    );
}
