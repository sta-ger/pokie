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
    const field = screen.getByLabelText("Game id");
    await user.clear(field);
    await user.type(field, value);
    await user.tab(); // blur -- MetadataFieldset commits on blur
}

async function validate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", {name: "Validate"}));
}

describe("Guided Design Game: validation staleness and build gating", () => {
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

        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Build Package"})).not.toBeDisabled();

        await dirtyGameId(user, "changed-after-validate");

        // A previously "ok" result goes "stale" (not back to "idle") on the next edit -- freshness-aware
        // validation truthfully distinguishes "changed since it was last checked" from "never checked
        // yet" (see BlueprintValidationView's own doc comment). The guided editor's own debounced
        // auto-validate (see BlueprintEditorPage's own revision-bump effect) will re-check shortly after,
        // but this assertion runs well before that debounce elapses.
        expect(screen.queryByText("Ready to build")).not.toBeInTheDocument();
        expect(screen.getByText("Checking your changes")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
    }, 60000);

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
            // Typing into "Load from path" below (a PathInput) triggers its own resolved-path hint
            // fetch on every change -- irrelevant to what this test covers, but it must resolve to a
            // real "ok" shape rather than falling through to the generic `respond([])` below, which
            // PathInput can't interpret as a valid StudioFsBrowseView.
            if (path === "/api/home/fs/browse") {
                return respond({status: "ok", resolvedPath: "/games/other.json", displayPath: "/games/other.json", entries: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        // `hidden: true` on the role query below is needed because Mantine's `Collapse` (transitionDuration
        // > 0, keepMounted) wraps its expanded content in React's `Activity` API, which jsdom doesn't
        // resolve to "visible" the way it does for e.g. Tabs.Panel -- so `getByRole` misclassifies
        // genuinely-expanded content as accessibility-hidden here. `getByLabelText` isn't affected (it
        // doesn't apply the same hidden-tree filtering), which is why the field itself needs no such flag.
        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        await user.type(screen.getByLabelText("Load from path", {exact: false}), "/games/other.json");
        await user.click(screen.getByRole("button", {name: "Load", exact: true, hidden: true}));

        await waitFor(() => expect(screen.queryByText("Ready to build")).not.toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
    }, 60000);

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
        // Same Collapse/Activity/jsdom caveat as the "Load" button above -- `hidden: true` needed.
        await user.click(screen.getByRole("radio", {name: "JSON", hidden: true}));
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
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
    }, 60000);

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
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
    }, 60000);

    it("shows a subject-specific recovery message, never the raw backend text, when the validation request itself fails outright (not a domain validation result)", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return Promise.reject(new Error("Failed to fetch"));
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("This validation request could not be completed. Try again, and check the Studio server logs if the problem persists.");
        expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    }, 60000);

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
        expect(screen.getByRole("button", {name: "Build Package"})).not.toBeDisabled();
    }, 60000);

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

        const idField = screen.getByLabelText("Game id");
        expect(idField).toHaveAttribute("aria-invalid", "true");
        // The field's own Mantine error shows the bare message; BlueprintValidationPanel's bottom,
        // unfiltered summary shows the same issue prefixed with its code ("blueprint-manifest-invalid-id:
        // ..." -- see IssueList) -- a regex on the shared substring matches both renderings, proving it's
        // shown exactly twice: once inline, once in the summary, *not* a third time in Game basics' own
        // generic section list (crossFieldOnly excludes it there, since it's already shown next to its
        // field).
        expect(screen.getAllByText(/must be a non-empty string/)).toHaveLength(2);
    }, 60000);

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
    }, 60000);

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
    }, 60000);

    it("a field-level warning shows as a separate note and never marks the field invalid", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "ok",
                    warnings: [
                        {
                            code: "blueprint-reels-suspicious",
                            severity: "warning",
                            message: '"reels" is unusually large.',
                            path: "reels",
                        },
                    ],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        await user.click(screen.getByRole("tab", {name: /Layout/}));
        const reelsField = screen.getByLabelText("Reels");
        // Mantine only sets aria-invalid when an `error` prop is actually passed -- a warning must never
        // reach that prop (see fieldErrorMessage/fieldWarningMessage's own doc comments), so the attribute
        // is either absent entirely or explicitly "false", never "true".
        expect(reelsField).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText('"reels" is unusually large.')).toBeInTheDocument();
        // Warnings-only still means "ok" -- Build stays enabled (see the dedicated
        // "a warnings-only validation still allows Build" test for the general case; this just confirms
        // a *field-level* warning specifically doesn't accidentally regress that).
        expect(screen.getByRole("button", {name: "Build Package"})).not.toBeDisabled();
    }, 60000);

    it("neither warning is lost from the UI when two share the same field-level path", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({
                    status: "ok",
                    warnings: [
                        {code: "blueprint-reels-suspicious", severity: "warning", message: "First reels warning.", path: "reels"},
                        {code: "blueprint-reels-suspicious-2", severity: "warning", message: "Second reels warning.", path: "reels"},
                    ],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        await user.click(screen.getByRole("tab", {name: /Layout/}));
        // Only the first is ever shown inline (fieldWarningMessage picks the first match) -- the second
        // has nowhere inline to go, so it must stay visible in Layout's own cross-field summary list
        // instead of silently vanishing (the crossFieldOnly fix this pass makes). The second also shows
        // up a second time in BlueprintValidationPanel's own unfiltered "Warnings" list (outside the
        // sectioned editor entirely) -- getAllByText tolerates that instead of asserting exclusivity.
        expect(screen.getByText("First reels warning.")).toBeInTheDocument();
        expect(screen.getAllByText(/Second reels warning\./).length).toBeGreaterThan(0);
    }, 60000);
});

// This step's own freshness contract: guided validation must run on initial open/load (not only after
// an explicit "Validate" click or an edit), and an external source change (Load) or a runtime
// materialization event (Build) must both make a previously-current result stale and trigger a fresh,
// guarded revalidate -- never leaving a stale "ok" in place once the source it described has moved on.
describe("Guided Design Game: automatic freshness triggers (open, external change, materialization)", () => {
    it("validates a freshly opened blueprint automatically, with no explicit Validate click", async () => {
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        // Nothing has run yet the instant this mounts -- the auto-validate below is genuinely debounced
        // (see AUTO_VALIDATE_DEBOUNCE_MS), not a synchronous side effect of render.
        expect(screen.getByText("Configure your game model")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();

        // No user action at all -- the guided editor's own debounced auto-validate (see
        // BlueprintEditorPage's own revision-bump effect) now also fires once on mount, not only after
        // an edit.
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Build Package"})).not.toBeDisabled();
    }, 60000);

    it("loading a different blueprint (an external source change) automatically re-validates it and reaches 'Ready to build' again with no further click", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            if (path === "/api/home/blueprints/load" && init?.method === "POST") {
                return respond({status: "ok", path: "/games/other.json", blueprint: {manifest: {id: "other", name: "Other", version: "0.1.0"}}});
            }
            if (path === "/api/home/fs/browse") {
                return respond({status: "ok", resolvedPath: "/games/other.json", displayPath: "/games/other.json", entries: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        await user.type(screen.getByLabelText("Load from path", {exact: false}), "/games/other.json");
        await user.click(screen.getByRole("button", {name: "Load", exact: true, hidden: true}));

        await waitFor(() => expect(screen.queryByText("Ready to build")).not.toBeInTheDocument());
        // No further click -- Load's own revision bump reschedules the exact same debounced auto-validate
        // an edit gets, so the freshly loaded blueprint reaches "Ready to build" again on its own.
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "Build Package"})).not.toBeDisabled();
    }, 60000);

    it("a successful Build (runtime materialization) makes the displayed validation stale and triggers a guarded revalidate", async () => {
        const user = userEvent.setup();
        let validateCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            const method = init?.method ?? "GET";
            if (path === "/api/home/blueprints/validate" && method === "POST") {
                validateCalls += 1;
                return respond({status: "ok", warnings: []});
            }
            if (path === "/api/home/blueprints/build-preview" && method === "POST") {
                return respond({
                    status: "ok",
                    warnings: [],
                    manifest: {id: "materialize", name: "Materialize", version: "0.1.0"},
                    reels: 5,
                    rows: 3,
                    symbolsCount: 0,
                    blueprintHash: "abc123",
                    expectedFiles: ["build-info.json"],
                    projectRoot: "/games/materialize",
                    destinationHasContent: false,
                    createFiles: ["build-info.json"],
                    updateFiles: [],
                    deleteFiles: [],
                });
            }
            if (path === "/api/home/blueprints/build" && method === "POST") {
                return respond({
                    status: "ok",
                    projectRoot: "/games/materialize",
                    manifest: {id: "materialize", name: "Materialize", version: "0.1.0"},
                    createdFiles: ["build-info.json"],
                    buildInfo: {blueprintHash: "abc123", pokieVersion: "1.0.0", generatedAt: new Date(0).toISOString(), files: []},
                    unchanged: false,
                    warnings: [],
                });
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await validate(user);
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
        expect(validateCalls).toBeGreaterThanOrEqual(1);
        const validateCallsBeforeBuild = validateCalls;

        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await screen.findByText(/Last built/);

        // The build materialized a real runtime package from this exact revision -- that must trigger
        // its own guarded revalidate (not just reuse whatever "ok" merely authorized the build to
        // start), and the displayed result must still land on "Ready to build" once it settles.
        await waitFor(() => expect(validateCalls).toBeGreaterThan(validateCallsBeforeBuild));
        await waitFor(() => expect(screen.getByText("Ready to build")).toBeInTheDocument());
    }, 60000);
});
