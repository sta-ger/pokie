import {HashRouter, Navigate, Route, Routes} from "react-router-dom";
import {HomePage} from "./components/home/HomePage";
import {ProjectDashboardPage} from "./components/project/ProjectDashboardPage";

// Hash routing, exactly router.ts's old 2-route set ("/" and "/project") -- needs zero StudioServer
// changes (no SPA fallback exists or is needed) and keeps Back/Forward toggling Home<->Project only,
// same as before. Tab selection within a page stays local component state, not a nested route.
export function StudioRoutes() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/project" element={<ProjectDashboardPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    );
}
