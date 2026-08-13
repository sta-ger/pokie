import {createHashRouter, Navigate, RouterProvider} from "react-router-dom";
import {HomePage} from "./components/home/HomePage";
import {ProjectDashboardRoute} from "./components/project/ProjectDashboardPage";
import {StudioLanding} from "./components/StudioLanding";

// Hash routing, via the *data router* API (createHashRouter + RouterProvider) rather than the
// declarative <HashRouter><Routes>, specifically so useDesignNavigationGuard's useBlocker works --
// react-router's navigation-blocking primitive only works under a data router (it needs the router's own
// history-transition machinery, not just a plain <Routes> match). Each section has a stable URL under a
// single `:tab` param route per page -- react-router keeps the same element instance mounted across
// param-only changes, so HomePage/ProjectDashboardPage themselves never remount when the active tab
// changes via the URL (only their own internal useParams()-derived `activeTab` changes) -- this is what
// makes refresh/back-forward/direct-link land on the right section instead of always resetting to the
// default tab.
//
// Created once at module scope (never inside the component) -- recreating the router on every render
// would reset all navigation/blocker state, which react-router's own docs warn against.
const router = createHashRouter([
    // "/" asks the server which mode it was started in before landing (see StudioLanding) instead of
    // hardcoding Home, which is what made `pokie .` start a project-mode server but open Home anyway.
    {path: "/", element: <StudioLanding />},
    {path: "/home/:tab", element: <HomePage />},
    {path: "/project", element: <Navigate to="/project/overview" replace />},
    // A project opened from Home carries its root in the history entry. ProjectDashboardRoute
    // restores that project before mounting its stateful dashboard, so Back/Forward cannot render
    // one project's retained client state against whichever project the server was last switched to.
    {path: "/project/:projectRoot/:tab", element: <ProjectDashboardRoute />},
    {path: "/project/:tab", element: <ProjectDashboardRoute />},
    {path: "*", element: <Navigate to="/home/design" replace />},
]);

export function StudioRoutes() {
    return <RouterProvider router={router} />;
}
