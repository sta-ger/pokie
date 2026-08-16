import {configure, fireEvent, getConfig, screen, waitFor, within} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// This page contains a large editable model. The default Testing Library error formatter walks and
// prints that entire accessibility tree when an assertion is stale, turning an immediate miss into a
// many-minute CPU-bound failure. Keep the assertion message but omit the redundant full-DOM dump for
// this file; the official workflow runner gives every file its own Jest process, and the restore keeps
// ad-hoc combined runs isolated too.
const defaultGetElementError = getConfig().getElementError;
beforeAll(() => configure({getElementError: (message) => new Error(message)}));
afterAll(() => configure({getElementError: defaultGetElementError}));

function sectionTab(name: string | RegExp): HTMLElement {
    const tab = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find((candidate) => {
        const label = candidate.textContent ?? "";
        return typeof name === "string" ? label.includes(name) : name.test(label);
    });
    if (tab === undefined) {
        throw new Error(`Section tab not found: ${String(name)}`);
    }
    return tab;
}

function buttonNamed(name: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(name));
    if (button === undefined) {
        throw new Error(`Button not found: ${name}`);
    }
    return button;
}

// Covers the guided Design Game editor's sectioned layout (SectionedFormEditor): editing across
// multiple named sections (Game basics/Layout/Symbols/Reels/Paytable/Bets), a dirty edit surviving a
// section switch, a validation error surfacing in its own section's badge/inline list while the bottom
// BlueprintValidationPanel still shows the full summary, and keyboard navigation between sections.
// happyPath.test.tsx already covers the full Recommended -> automatic validation -> Create Project
// cross-page flow -- this file focuses on what's specific to the sectioned editor.

function okValidateFetch(): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        const method = init?.method ?? "GET";
        if (path === "/api/home/projects/registry") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        }
        if (path === "/api/home/blueprints/validate" && method === "POST") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
        }
        if (path === "/api/home/blueprints/save-managed" && method === "POST") {
            return Promise.resolve({
                ok: true,
                status: 201,
                json: () =>
                    Promise.resolve({
                        status: "ok",
                        path: "/games/sectioned/blueprint.json",
                        name: "sectioned",
                        blueprintHash: "abc123",
                        registeredProject: {
                            location: "/games/sectioned/blueprint.json",
                            name: "Sectioned",
                            type: "blueprint",
                            capabilities: ["runtime.execute"],
                            origin: "managed",
                            status: "ok",
                        },
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
        return Promise.reject(new Error(`no fake route for ${method} ${url}`));
    };
}

describe("Guided Design Game: sectioned layout", () => {
    it("walks across sections -> automatic validation -> Create Project, ending in Workspace", async () => {
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        // Design Game now starts from the playable Recommended model. Exercise the section controls
        // without rebuilding that intentionally complete model field by field.
        fireEvent.click(sectionTab("Symbols"));
        fireEvent.click(sectionTab("Bets"));

        // P6-04 removed the explicit Validate -> Build Package sequence. The current revision becomes
        // ready automatically and the one primary action persists and opens its managed project.
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        expect(screen.queryByText("Validate", {selector: "button"})).not.toBeInTheDocument();
        expect(screen.queryByText("Build Package", {selector: "button"})).not.toBeInTheDocument();

        // No section shows an error/warning badge after a clean validate (StatusBadge renders nothing
        // for a "neutral"/"success" tone -- only a digit for "error"/"warning"). Domain-level tone
        // computation itself is covered by BlueprintSections.test.ts; this just checks nothing leaked
        // through to the tab row.
        const tablist = document.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        expect(within(tablist as HTMLElement).queryByText(/^\d+$/)).not.toBeInTheDocument();

        fireEvent.click(buttonNamed("Create Project"));

        await waitFor(() => {
            const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).find((candidate) => candidate.textContent === "Sectioned");
            expect(heading).toBeDefined();
        });
    }, 60000);

    it("preserves an in-progress edit in one section when switching to another and back", () => {
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        // Heavy inactive panels are absent until first visit, then remain mounted to preserve local
        // uncommitted values across later section switches.
        expect(screen.queryByLabelText("New symbol id")).not.toBeInTheDocument();
        fireEvent.click(sectionTab(/Symbols/));
        fireEvent.change(screen.getByLabelText("New symbol id"), {target: {value: "draft-symbol"}});

        fireEvent.click(sectionTab(/Layout/));
        expect(sectionTab(/Layout/)).toHaveAttribute("aria-selected", "true");

        fireEvent.click(sectionTab(/Symbols/));
        expect(screen.getByLabelText("New symbol id")).toHaveValue("draft-symbol");
    }, 60000);

    it("surfaces a validation error in its own section's badge and inline list, alongside the full summary at the bottom", async () => {
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            const method = init?.method ?? "GET";
            if (path === "/api/home/projects/registry") {
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

        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());

        // Exactly one section tab shows an error badge, and it's "Game basics".
        const tablist = document.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        expect(within(tablist as HTMLElement).getAllByText("1")).toHaveLength(1);
        // Exact-name match no longer works here: StatusBadge now also exposes the error count as real,
        // accessible text (see StatusBadge.tsx), so "Game basics"'s own accessible name grows to "Game
        // basics, 1 error" -- {name: /Game basics/} matches regardless.
        expect(within(sectionTab(/Game basics/)).getByText("1")).toBeInTheDocument();

        // "Game basics" is the default active section, so its own inline issue list is already visible
        // without switching tabs -- *and* the full, unfiltered summary at the bottom shows the same
        // issue too (one inline occurrence, one in BlueprintValidationPanel's own summary).
        expect(screen.getAllByText(/blueprint-manifest-invalid-id/)).toHaveLength(2);
    }, 60000);

    it("revalidates a section edit automatically without exposing the removed package-build controls", async () => {
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        expect(screen.queryByText("Validate", {selector: "button"})).not.toBeInTheDocument();
        expect(screen.queryByText("Build Package", {selector: "button"})).not.toBeInTheDocument();
        expect(screen.queryByText("Compare built blueprint", {selector: "button"})).not.toBeInTheDocument();

        // Fields commit on blur. The new revision is checked in the background and remains eligible for
        // the single Create Project action; no build snapshot/compare state is created along the way.
        const gameNameInput = screen.getByLabelText("Game name");
        fireEvent.change(gameNameInput, {target: {value: "Sectioned Renamed"}});
        fireEvent.blur(gameNameInput);

        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        expect(gameNameInput).toHaveValue("Sectioned Renamed");
        expect(buttonNamed("Create Project")).toBeEnabled();
        expect(screen.queryByText("Compare built blueprint", {selector: "button"})).not.toBeInTheDocument();
    }, 60000);

    it("switches the active section with arrow-key keyboard navigation", () => {
        renderRoutedApp({fetchImpl: okValidateFetch(), initialEntries: ["/home/design"]});

        const basicsTab = sectionTab(/Game basics/);
        fireEvent.click(basicsTab);
        expect(basicsTab).toHaveAttribute("aria-selected", "true");

        fireEvent.keyDown(basicsTab, {key: "ArrowRight"});
        const layoutTab = sectionTab(/Layout/);
        expect(layoutTab).toHaveAttribute("aria-selected", "true");
        expect(basicsTab).toHaveAttribute("aria-selected", "false");

        fireEvent.keyDown(layoutTab, {key: "ArrowRight"});
        expect(sectionTab(/Symbols/)).toHaveAttribute("aria-selected", "true");
    }, 60000);
});
