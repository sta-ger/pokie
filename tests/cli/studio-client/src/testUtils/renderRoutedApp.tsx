import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {render, type RenderResult} from "@testing-library/react";
import {createMemoryRouter, Navigate, RouterProvider} from "react-router-dom";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {HomePage} from "../../../../../cli/studio-client/src/components/home/HomePage";
import {ProjectDashboardPage} from "../../../../../cli/studio-client/src/components/project/ProjectDashboardPage";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";

// Mirrors routes.tsx's own route table (/home/:tab -> HomePage, /project/:tab -> ProjectDashboardPage) so
// a real navigate(...) (e.g. from useOpenProject, or BlueprintBuildPanel's "Open in Studio") actually
// swaps the rendered page during a test, and useParams() resolves a real `:tab` -- renderWithProviders.tsx
// only ever renders one page element directly with no route match, which can't exercise a real cross-page
// happy-path scenario or URL-driven tab selection.
//
// Uses the *data router* API (createMemoryRouter + RouterProvider), matching production routes.tsx, so
// useDesignNavigationGuard's useBlocker actually works under test the same way it does in a real browser
// (declarative <MemoryRouter><Routes> doesn't support useBlocker at all). Returns the created `router`
// instance alongside the usual render result, for tests that need to drive it directly (e.g.
// router.navigate(-1) for a real back navigation) rather than only through rendered UI.
//
// Kept as a test-only file (does not touch App.tsx/routes.tsx) so if routes.tsx ever gains a new route,
// this needs updating too.
const ROUTES = [
    {path: "/", element: <Navigate to="/home/design" replace />},
    {path: "/home/:tab", element: <HomePage />},
    {path: "/project", element: <Navigate to="/project/overview" replace />},
    {path: "/project/:tab", element: <ProjectDashboardPage />},
    {path: "*", element: <Navigate to="/home/design" replace />},
];

export function renderRoutedApp(options?: {fetchImpl?: FetchLike; initialEntries?: string[]}) {
    const router = createMemoryRouter(ROUTES, {initialEntries: options?.initialEntries ?? ["/home/design"]});
    const result: RenderResult = render(
        <MantineProvider>
            <StudioApiProvider fetchImpl={options?.fetchImpl}>
                <ModalsProvider>
                    <RouterProvider router={router} />
                </ModalsProvider>
            </StudioApiProvider>
        </MantineProvider>,
    );
    return {...result, router};
}
