import {fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Guided Design Game has automatic model validation and one Create Project action. P6-04 deliberately
// removed the old Configure -> Validate -> Build wizard and its package-build button. These tests cover
// the validation state that remains part of the creation flow: revision freshness, stale responses,
// actionable request failures, field/section diagnostics, and automatic revalidation after wholesale
// model replacement. Create Project's validation-and-save contract lives in the adjacent guidedProgress
// and save suites.

function respond(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

async function dirtyGameId(user: ReturnType<typeof userEvent.setup>, value: string): Promise<void> {
    const field = screen.getByLabelText("Game id");
    await user.clear(field);
    await user.type(field, value);
    await user.tab();
}

describe("Guided Design Game: automatic validation freshness", () => {
    it("marks a completed validation stale on edit, then validates the new revision automatically", async () => {
        const user = userEvent.setup();
        let validateCalls = 0;
        let resolveEditedValidation: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                validateCalls += 1;
                if (validateCalls === 2) {
                    return new Promise((resolve) => {
                        resolveEditedValidation = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
                    });
                }
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
        const callsBeforeEdit = validateCalls;

        await dirtyGameId(user, "changed-after-validation");

        await waitFor(() => expect(validateCalls).toBeGreaterThan(callsBeforeEdit));
        expect(screen.queryByText("Valid — no issues found.")).not.toBeInTheDocument();
        expect(screen.getByText("Validating…")).toBeInTheDocument();
        resolveEditedValidation?.();
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
    }, 60000);

    it("discards a validation response that resolves after a subsequent edit", async () => {
        const user = userEvent.setup();
        let validateCalls = 0;
        let resolveFirstValidation: ((value: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                validateCalls += 1;
                if (validateCalls === 1) {
                    return new Promise((resolve) => {
                        resolveFirstValidation = (body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
                    });
                }
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await waitFor(() => expect(resolveFirstValidation).toBeDefined());

        await dirtyGameId(user, "edited-during-flight");
        resolveFirstValidation?.({
            status: "invalid",
            errors: [{code: "blueprint-manifest-invalid-id", severity: "error", message: "stale response, must not apply"}],
            warnings: [],
        });

        await waitFor(() => expect(validateCalls).toBeGreaterThan(1));
        expect(screen.queryByText(/stale response, must not apply/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Invalid/)).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
    }, 60000);

    it("shows a subject-specific recovery message, never raw backend text, when validation fails", async () => {
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return Promise.reject(new Error("Failed to fetch"));
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        expect(
            await screen.findByText("This validation request could not be completed. Try again. If it continues, choose the location again and retry."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    }, 60000);

    it("shows a field error inline and in the complete summary, without a third section-list copy", async () => {
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

        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getAllByText(/must be a non-empty string/)).toHaveLength(2);
    }, 60000);

    it("auto-jumps to the first error section and keeps arrow-key navigation working", async () => {
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

        expect(screen.getByRole("tab", {name: "Game basics"})).toHaveAttribute("aria-selected", "true");
        await waitFor(() => expect(screen.getByRole("tab", {name: /Paytable.*1 error/})).toHaveAttribute("aria-selected", "true"));
        expect(document.activeElement).toBe(screen.getByRole("tab", {name: /Paytable/}));

        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("tab", {name: /^Bets/})).toHaveAttribute("aria-selected", "true");
    }, 60000);

    it("renders field warnings without marking the field invalid or dropping duplicate-path warnings", async () => {
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

        await waitFor(() => expect(screen.getByText("Valid, with warnings — 2 warning(s).")).toBeInTheDocument());
        await user.click(screen.getByRole("tab", {name: /Layout/}));
        expect(screen.getByLabelText("Reels")).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("First reels warning.")).toBeInTheDocument();
        expect(screen.getAllByText(/Second reels warning\./).length).toBeGreaterThan(0);
    }, 60000);

    it("automatically validates a blueprint loaded through advanced options", async () => {
        const user = userEvent.setup();
        const validatedIds: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                const body = JSON.parse(String(init.body)) as {blueprint: {manifest: {id: string}}};
                validatedIds.push(body.blueprint.manifest.id);
                return respond({status: "ok", warnings: []});
            }
            if (path === "/api/home/blueprints/load" && init?.method === "POST") {
                return respond({
                    status: "ok",
                    path: "/games/other.json",
                    blueprint: {manifest: {id: "other", name: "Other", version: "0.1.0"}},
                    blueprintHash: "other-hash",
                });
            }
            if (path === "/api/home/fs/browse") {
                return respond({status: "ok", resolvedPath: "/games/other.json", displayPath: "/games/other.json", entries: []});
            }
            if (path === "/api/home/blueprints/check-source") {
                return respond({status: "unchanged"});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await waitFor(() => expect(validatedIds).toContain("starter-slot"));

        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        await user.type(screen.getByLabelText("Load from path", {exact: false}), "/games/other.json");
        await user.click(screen.getByRole("button", {name: "Load", exact: true, hidden: true}));

        await waitFor(() => expect(validatedIds).toContain("other"));
        expect(screen.getByLabelText("Game id")).toHaveValue("other");
        expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument();
    }, 60000);

    it("automatically validates a blueprint applied from JSON", async () => {
        const user = userEvent.setup();
        const validatedIds: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                const body = JSON.parse(String(init.body)) as {blueprint: {manifest: {id: string}}};
                validatedIds.push(body.blueprint.manifest.id);
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await waitFor(() => expect(validatedIds).toContain("starter-slot"));

        await user.click(screen.getByRole("button", {name: "Show advanced options (JSON mode, load/save by path)"}));
        await user.click(screen.getByRole("radio", {name: "JSON", hidden: true}));
        const appliedBlueprint = {
            manifest: {id: "json-applied", name: "JSON Applied", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbols: [],
            paytable: {},
            availableBets: [1],
        };
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(appliedBlueprint)}});
        await user.click(screen.getByRole("button", {name: "Apply JSON"}));

        await waitFor(() => expect(validatedIds).toContain("json-applied"));
        expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument();
    }, 60000);
});
