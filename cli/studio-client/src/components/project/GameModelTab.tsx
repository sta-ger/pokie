import {Button} from "@mantine/core";
import {useCallback, useEffect, useState} from "react";
import {getGameModel} from "../../api/apiClient";
import type {GameModelProjection} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";
import {GameModelSections} from "./GameModelSections";

type GameModelState = {status: "loading"} | {status: "error"; message: string} | {status: "loaded"; projection: GameModelProjection};

// The Project Workspace's own Game Model tab -- View Mode's default (and only) content: a calm,
// read-only rendering of GET /api/project/gameModel's own resolved-project-type-aware projection (see
// buildProjectGameModel's own doc comment for exactly what's available per project type). Fetches on its
// own (mounted fresh per project via ProjectDashboardPage's `key={projectKey}`, same convention as
// RuntimeTab/CertificationTab) rather than threading yet another piece of state through the page, since
// nothing else on the page needs this projection.
export function GameModelTab() {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<GameModelState>({status: "loading"});

    const refresh = useCallback(() => {
        setState({status: "loading"});
        getGameModel(fetchImpl)
            .then((projection) => setState({status: "loaded", projection}))
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
    }, [fetchImpl]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return (
        <div>
            {state.status === "loading" && <LoadingState label="Loading game model…" />}
            {state.status === "error" && <ErrorState message={`Couldn't load the game model: ${state.message}`} />}
            {state.status === "loaded" && <GameModelSections projection={state.projection} />}
            <QuickActions>
                <Button variant="default" size="xs" onClick={refresh} loading={state.status === "loading"}>
                    Refresh
                </Button>
            </QuickActions>
        </div>
    );
}
