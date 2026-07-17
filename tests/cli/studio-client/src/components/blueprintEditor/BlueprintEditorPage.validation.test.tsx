import {fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Covers this stabilization pass's own scope: validation staleness (an edit/Load/JSON-Apply after a
// successful validate must make that result stop applying), the stale-async-response guard, guided
// Build-gating (blocked until a successful validation of the *current* revision, warnings never block),
// field-level Mantine input errors, auto-jump-to-first-error-section + focus, and accessible section
// status text. BlueprintEditorPage.sections.test.tsx already covers the sectioned layout itself
// (navigation, dirty-draft-across-sections, the happy path); this file is deliberately narrower.

function respond(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

async function dirtyGameId(user: ReturnType<typeof userEvent.setup>, value: string): Promise<void> {
    const field = screen.getAllByLabelText("Game id")[0];
    await user.clear(field);
    await user.type(field, value);
    await user.tab(); // blur -- MetadataFieldset commits on blur
}

async function validate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getAllByRole("button", {name: "Validate"})[0]);
}

describe("Guided Design & Build: validation staleness and build gating", () => {
    it("editing after a successful validate clears 'Ready to build' and disables Build again", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).toBeDisabled();

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).not.toBeDisabled();

        await dirtyGameId(user, "changed-after-validate");

        expect(screen.queryByText("Ready to build")).not.toBeInTheDocument();
        expect(screen.getByText("Configure your game model")).toBeInTheDocument();
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).toBeDisabled();
    }, 45000);

    it("loading a different blueprint after a successful validate clears it the same way", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            if (path === "/api/home/blueprints/load" && init?.method === "POST") {
                return respond({status: "ok", path: "/games/other.json", blueprint: {manifest: {id: "other", name: "Other", version: "0.1.0"}}});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        // The raw/Advanced Tools editor's own instance of every one of these fields/buttons is also
        // always mounted (hidden via CSS, not unmounted -- see HomePage's own "hide, don't unmount" tabs)
        // -- [0] is always the guided instance's, matching the pattern established throughout this test
        // suite (e.g. dirtyTheDesignDraft in the navigation-guard tests). `hidden: true` on the role
        // query below is needed because Mantine's `Collapse` (transitionDuration > 0, keepMounted) wraps
        // its expanded content in React's `Activity` API, which jsdom doesn't resolve to "visible" the
        // way it does for e.g. Tabs.Panel -- so `getByRole` misclassifies genuinely-expanded content as
        // accessibility-hidden here. `getByLabelText` isn't affected (it doesn't apply the same
        // hidden-tree filtering), which is why the field itself needs no such flag.
        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        await user.type(screen.getAllByLabelText("Load from path", {exact: false})[0], "/games/other.json");
        await user.click(screen.getAllByRole("button", {name: "Load", exact: true, hidden: true})[0]);

        await waitFor(() => expect(screen.queryByText("Ready to build")).not.toBeInTheDocument());
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).toBeDisabled();
    }, 45000);

    it("applying JSON after a successful validate clears it the same way", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        // Same Collapse/Activity/jsdom caveat as the "Load" button above -- `hidden: true` needed, and
        // [0] is the guided instance's own Form/JSON switch.
        await user.click(screen.getAllByRole("radio", {name: "JSON", hidden: true})[0]);
        const newBlueprint = {
            manifest: {id: "json-applied", name: "JSON Applied", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: [],
            paytable: {},
            availableBets: [1],
        };
        // The textarea is uncontrolled (read via ref only when "Apply JSON" is clicked) -- setting its
        // value directly avoids user-event's `{`/`}` special-character parsing on raw JSON text.
        const textarea = screen.getByLabelText("Blueprint JSON");
        fireEvent.change(textarea, {target: {value: JSON.stringify(newBlueprint)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));

        await waitFor(() => expect(screen.queryByText("Ready to build")).not.toBeInTheDocument());
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).toBeDisabled();
    }, 45000);

    it("discards a validate response that resolves after a subsequent edit", async () => {
        const user = userEvent.setup();
        let resolveValidate: ((value: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return new Promise((resolve) => {
                    resolveValidate = (body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(resolveValidate).toBeDefined());

        // Edit *while the request is still in flight* -- this must win over whatever the response says.
        await dirtyGameId(user, "edited-during-flight");

        resolveValidate?.({
            status: "invalid",
            errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: "stale response, must not apply"}],
            warnings: [],
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(screen.queryByText(/stale response, must not apply/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Invalid/)).not.toBeInTheDocument();
        expect(screen.getByText("Configure your game model")).toBeInTheDocument();
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).toBeDisabled();
    }, 45000);

    it("a warnings-only validation still allows Build", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "ok",
                    warnings: [{code: "blueprint-rows-suspicious", severity: "warning", message: '"rows" is unusually large.', path: "rows"}],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(screen.getAllByRole("button", {name: "Build Package"})[0]).not.toBeDisabled();
    }, 45000);

    it("a field-level issue shows as the field's own Mantine error, not duplicated in the section's generic list", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "invalid",
                    errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: '"manifest.id" must be a non-empty string.', path: "manifest.id"}],
                    warnings: [],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText(/Invalid/)).toBeInTheDocument());

        const idField = screen.getAllByLabelText("Game id")[0];
        expect(idField).toHaveAttribute("aria-invalid", "true");
        // The field's own Mantine error shows the bare message; BlueprintValidationPanel's bottom,
        // unfiltered summary shows the same issue prefixed with its code ("blueprint-manifest-invalid-id:
        // ..." -- see IssueList) -- a regex on the shared substring matches both renderings, proving it's
        // shown exactly twice: once inline, once in the summary, *not* a third time in Game basics' own
        // generic section list (crossFieldOnly excludes it there, since it's already shown next to its
        // field).
        expect(screen.getAllByText(/must be a non-empty string/)).toHaveLength(2);
    }, 45000);

    it("auto-jumps to and focuses the first error section, without breaking keyboard navigation afterward", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "invalid",
                    errors: [{code: "blueprint-paytable-empty", severity: "error", message: '"paytable" must define at least one symbol payout.'}],
                    warnings: [],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Before validating, every section is neutral -- exact-name matches work.
        expect(screen.getByRole("tab", {name: "Game basics"})).toHaveAttribute("aria-selected", "true");

        await validate(user);
        await waitFor(() => expect(screen.getByRole("tab", {name: /Paytable/})).toHaveAttribute("aria-selected", "true"));
        // After validating, every *clean* section (Game basics included -- its own error is in Paytable,
        // not here) now carries "valid" in its accessible name too (see StatusBadge.tsx) -- exact-name
        // matches below become regexes for that reason, not because the section itself changed.
        expect(screen.getByRole("tab", {name: /^Game basics/})).toHaveAttribute("aria-selected", "false");
        expect(document.activeElement).toBe(screen.getByRole("tab", {name: /Paytable/}));

        // Arrow-key navigation must still work immediately after the auto-jump (regression guard).
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("tab", {name: /^Bets/})).toHaveAttribute("aria-selected", "true");
    }, 45000);

    it("exposes a section's error/warning count as real, non-aria-hidden accessible text", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "invalid",
                    errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: "bad id", path: "manifest.id"}],
                    warnings: [],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByRole("tab", {name: /Game basics/})).toBeInTheDocument());

        // The accessible name carries the count as words, not only a visual digit badge -- this is what
        // a screen reader announces when landing on the tab.
        const gameBasicsTab = screen.getByRole("tab", {name: /Game basics.*1 error/});
        expect(gameBasicsTab).toBeInTheDocument();
        // A clean section (e.g. Bets, never touched) carries "valid" instead of an error/warning count --
        // distinct wording per state, not just "has a count or doesn't".
        expect(screen.getByRole("tab", {name: /Bets.*valid/})).toBeInTheDocument();
        // Before any validation had run at all, a section's accessible name is exactly its label (no
        // appended text yet) -- confirmed by every pre-validate tab query elsewhere in this suite
        // (e.g. BlueprintEditorPage.sections.test.tsx's own keyboard-navigation test).
    }, 45000);
});
