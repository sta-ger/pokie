import {HashRouter, Navigate, Route, Routes} from "react-router-dom";
import {HomePage} from "./components/home/HomePage";
import {ProjectDashboardPage} from "./components/project/ProjectDashboardPage";

// Hash routing. Each section has a stable URL under a single `:tab` param route per page -- react-router
// keeps the same element instance mounted across param-only changes, so HomePage/ProjectDashboardPage
// themselves never remount when the active tab changes via the URL (only their own internal
// useParams()-derived `activeTab` changes) -- this is what makes refresh/back-forward/direct-link land on
// the right section instead of always resetting to the default tab.
export function StudioRoutes() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<Navigate to="/home/design" replace />} />
                <Route path="/home/:tab" element={<HomePage />} />
                <Route path="/project" element={<Navigate to="/project/overview" replace />} />
                <Route path="/project/:tab" element={<ProjectDashboardPage />} />
                <Route path="*" element={<Navigate to="/home/design" replace />} />
            </Routes>
        </HashRouter>
    );
}
