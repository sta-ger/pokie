import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Covers the guided Design & Build editor's sectioned layout (SectionedFormEditor): editing across
// multiple named sections (Game basics/Layout/Symbols/Reels/Paytable/Bets), a dirty edit surviving a
// section switch, a validation error surfacing in its own section's badge/inline list while the bottom
// BlueprintValidationPanel still shows the full summary, and keyboard navigation between sections.
// happyPath.test.tsx already covers the full Design->Validate->Build->Project cross-page flow end to
// end (via the Symbols section) -- this file focuses on what's specific to the new sectioned layout.

function okValidateFetch(): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        const method = init?.method ?? "GET";
        if (path === "/api/home/recent-projects") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        }
        if (path === "/api/home/blueprints/validate" && method === "POST") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
        }
        if (path === "/api/home/blueprints/build" && method === "POST") {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        status: "ok",
                        projectRoot: "/games/sectioned",
                        manifest: {id: "sectioned", name: "Sectioned", version: "0.1.0"},
                        createdFiles: ["build-info.json"],
                        buildInfo: {blueprintHash: "abc123", pokieVersion: "1.0.0", generatedAt: new Date().toISOString(), files: []},
                        unchanged: false,
                        warnings: [],
                    }),
            });
        }
        if (path === "/api/home/projects/open" && method === "POST") {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        context: {mode: "project", projectRoot: "/games/sectioned"},
                        manifest: {id: "sectioned", name: "Sectioned", version: "0.1.0"},
                    }),
            });
        }
        if (path === "/api/project/context") {
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({status: "loaded", projectRoot: "/games/sectioned", game: {id: "sectioned", name: "Sectioned", version: "0.1.0"}}),
            });
        }
        if (path === "/api/project/inspect") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({packageRoot: "/games/sectioned", valid: true})});
        }
        if (["/api/project/reports", "/api/project/replays", "/api/project/deployment/targets"].includes(path) && method === "GET") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        }
        if (path === "/api/project/runtime") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
        }
        return Promise.reject(new Error(`no fake route for ${method} ${url}`));
    };
}

describe("Guided Design & Build: sectioned layout", () => {
    it("walks Edit (across sections) -> Validate -> Build, ending on the Project Dashboard", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        // "Game basics" is the default active section -- no tab click needed for it.
        await user.type(screen.getAllByLabelText("Game id")[0], "sectioned");
        await user.type(screen.getAllByLabelText("Game name")[0], "Sectioned");

        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(screen.getAllByLabelText("New symbol id")[0], "wild");
        await user.click(screen.getAllByRole("button", {name: "Add symbol"})[0]);

        await user.click(screen.getByRole("tab", {name: "Bets"}));
        await user.type(screen.getAllByLabelText("New bet amount")[0], "2");
        await user.click(screen.getAllByRole("button", {name: "Add bet"})[0]);

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());

        // No section shows an error/warning badge after a clean validate (StatusBadge renders nothing
        // for a "neutral"/"success" tone -- only a digit for "error"/"warning"). Domain-level tone
        // computation itself is covered by BlueprintSections.test.ts; this just checks nothing leaked
        // through to the tab row.
        expect(within(screen.getByRole("tablist")).queryByText(/^\d+$/)).not.toBeInTheDocument();

        await user.click(screen.getAllByRole("button", {name: "Build Package"})[0]);
        const openInStudio = await screen.findByRole("button", {name: "Open in Studio"});
        await user.click(openInStudio);

        expect(await screen.findByRole("heading", {name: "Sectioned"})).toBeInTheDocument();
    }, 45000);

    it("preserves an in-progress edit in one section when switching to another and back", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        await user.type(screen.getAllByLabelText("New symbol id")[0], "draft-symbol");

        await user.click(screen.getByRole("tab", {name: "Layout"}));
        expect(screen.getByRole("tab", {name: "Layout"})).toHaveAttribute("aria-selected", "true");

        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        expect(screen.getAllByLabelText("New symbol id")[0]).toHaveValue("draft-symbol");
    }, 45000);

    it("surfaces a validation error in its own section's badge and inline list, alongside the full summary at the bottom", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            const method = init?.method ?? "GET";
            if (path === "/api/home/recent-projects") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/home/blueprints/validate" && method === "POST") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "invalid",
                            errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: '"manifest.id" must be a non-empty string.'}],
                            warnings: [],
                        }),
                });
            }
            return Promise.reject(new Error(`no fake route for ${method} ${url}`));
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());

        // Exactly one section tab shows an error badge, and it's "Game basics".
        const tablist = screen.getByRole("tablist");
        expect(within(tablist).getAllByText("1")).toHaveLength(1);
        expect(within(screen.getByRole("tab", {name: "Game basics"})).getByText("1")).toBeInTheDocument();

        // "Game basics" is the default active section, so its own inline issue list is already visible
        // without switching tabs -- *and* the full, unfiltered summary at the bottom shows the same
        // issue too (one inline occurrence, one in BlueprintValidationPanel's own summary).
        expect(screen.getAllByText(/blueprint-manifest-invalid-id/)).toHaveLength(2);
    }, 45000);

    it("switches the active section with arrow-key keyboard navigation", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("tab", {name: "Game basics"}));
        expect(screen.getByRole("tab", {name: "Game basics"})).toHaveAttribute("aria-selected", "true");

        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("tab", {name: "Layout"})).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", {name: "Game basics"})).toHaveAttribute("aria-selected", "false");

        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("tab", {name: "Symbols"})).toHaveAttribute("aria-selected", "true");
    }, 45000);
});
