import {useEffect, useState} from "react";
import {Navigate} from "react-router-dom";
import {getContext} from "../api/apiClient";
import {LoadingState} from "./common/LoadingState";
import {useStudioApi} from "../context/StudioApiProvider";

const HOME_ROUTE = "/home/design";
const PROJECT_ROUTE = "/project/overview";

// What "/" resolves to, and the one place the app's opening route is decided. The server already knows
// which mode it was started in (`pokie` inside a project, `pokie .`, `pokie <path>` -> project;
// `pokie studio` or `pokie` outside any project -> home) and reports it at /api/context, but a hash
// route never reaches the server, so the browser has to ask before it can land anywhere. Without this
// step the app always opened Home regardless of how the server was started, which is exactly the
// server-context/frontend-route mismatch this component exists to remove.
//
// It only reads the mode and routes on it. It deliberately does not fetch, validate or render any
// project data itself: ProjectDashboardPage already owns loading /api/project/context and reporting a
// project that fails to load, so a project root that turns out to be broken still lands on the
// dashboard and shows that error there, rather than being second-guessed here.
export function StudioLanding() {
    const fetchImpl = useStudioApi();
    const [route, setRoute] = useState<string>();

    useEffect(() => {
        let cancelled = false;

        const land = (destination: string): void => {
            if (!cancelled) {
                setRoute(destination);
            }
        };

        getContext(fetchImpl).then(
            (context) => land(context.mode === "project" ? PROJECT_ROUTE : HOME_ROUTE),
            // An unreachable/failed /api/context is not worth stranding the user on a blank screen for:
            // Home is the safe landing, and it's what the app did for every startup before this existed.
            () => land(HOME_ROUTE),
        );

        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);

    if (route === undefined) {
        return <LoadingState label="Starting POKIE Studio…" />;
    }

    return <Navigate to={route} replace />;
}
