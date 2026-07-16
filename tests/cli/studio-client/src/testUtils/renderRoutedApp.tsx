import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {render, type RenderResult} from "@testing-library/react";
import {MemoryRouter, Navigate, Route, Routes} from "react-router-dom";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {HomePage} from "../../../../../cli/studio-client/src/components/home/HomePage";
import {ProjectDashboardPage} from "../../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";

// Mirrors routes.tsx's own route table ("/" -> HomePage, "/project" -> ProjectDashboardPage) so a real
// navigate("/project") (e.g. from useOpenProject, or BlueprintBuildPanel's "Open in Studio") actually
// swaps the rendered page during a test -- renderWithProviders.tsx only ever renders one page element
// directly, which can't exercise a real cross-page happy-path scenario. Kept as a test-only file (does
// not touch App.tsx/routes.tsx) so if routes.tsx ever gains a new route, this needs updating too.
export function renderRoutedApp(options?: {fetchImpl?: FetchLike; initialEntries?: string[]}): RenderResult {
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={options?.initialEntries ?? ["/"]}>
                <StudioApiProvider fetchImpl={options?.fetchImpl}>
                    <ModalsProvider>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/project" element={<ProjectDashboardPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </ModalsProvider>
                </StudioApiProvider>
            </MemoryRouter>
        </MantineProvider>,
    );
}
