import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {render, type RenderResult} from "@testing-library/react";
import {MemoryRouter, Navigate, Route, Routes} from "react-router-dom";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {HomePage} from "../../../../../cli/studio-client/src/components/home/HomePage";
import {ProjectDashboardPage} from "../../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";

// Mirrors routes.tsx's own route table (/home/:tab -> HomePage, /project/:tab -> ProjectDashboardPage) so
// a real navigate(...) (e.g. from useOpenProject, or BlueprintBuildPanel's "Open in Studio") actually
// swaps the rendered page during a test, and useParams() resolves a real `:tab` -- renderWithProviders.tsx
// only ever renders one page element directly with no route match, which can't exercise a real cross-page
// happy-path scenario or URL-driven tab selection. Kept as a test-only file (does not touch App.tsx/
// routes.tsx) so if routes.tsx ever gains a new route, this needs updating too.
export function renderRoutedApp(options?: {fetchImpl?: FetchLike; initialEntries?: string[]}): RenderResult {
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={options?.initialEntries ?? ["/home/design"]}>
                <StudioApiProvider fetchImpl={options?.fetchImpl}>
                    <ModalsProvider>
                        <Routes>
                            <Route path="/" element={<Navigate to="/home/design" replace />} />
                            <Route path="/home/:tab" element={<HomePage />} />
                            <Route path="/project" element={<Navigate to="/project/overview" replace />} />
                            <Route path="/project/:tab" element={<ProjectDashboardPage />} />
                            <Route path="*" element={<Navigate to="/home/design" replace />} />
                        </Routes>
                    </ModalsProvider>
                </StudioApiProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
}
