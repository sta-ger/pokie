import {createHashRouter, Navigate, RouterProvider} from "react-router-dom";
import {HomePage} from "./components/home/HomePage";
import {ProjectDashboardPage} from "./components/project/ProjectDashboardPage";

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
    {path: "/", element: <Navigate to="/home/design" replace />},
    {path: "/home/:tab", element: <HomePage />},
    {path: "/project", element: <Navigate to="/project/overview" replace />},
    {path: "/project/:tab", element: <ProjectDashboardPage />},
    {path: "*", element: <Navigate to="/home/design" replace />},
]);

export function StudioRoutes() {
    return <RouterProvider router={router} />;
}
