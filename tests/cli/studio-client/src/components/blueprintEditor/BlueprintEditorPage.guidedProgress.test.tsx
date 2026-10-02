import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

function fetchWithValidateResult(validateJson: unknown, onRequest?: (path: string) => void): FetchLike {
    return (url, init) => {
        const [path] = url.split("?");
        onRequest?.(path);
        const method = init?.method ?? "GET";
        if (path === "/api/home/projects/registry") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        }
        if (path === "/api/home/blueprints/validate" && method === "POST") {
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(validateJson)});
        }
        return Promise.reject(new Error(`no fake route for ${method} ${url}`));
    };
}

describe("Guided Design Game: automatic validation", () => {
    it("opens with the recommended playable model and checks it automatically", async () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});

        expect(screen.getByLabelText("Game id")).toHaveValue("starter-slot");
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        const create = screen.getByRole("button", {name: "Create game"});
        expect(create).toHaveAttribute("data-pokie-validation-state", "idle");
        expect(create).toBeDisabled();

        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
    });

    it("disables the real Create control during validation and on invalid designs, then recovers after an edit", async () => {
        const user = userEvent.setup();
        const requests: string[] = [];
        let completeValidation: ((body: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            requests.push(path);
            if (path === "/api/home/projects/registry") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return new Promise((resolve) => {
                    completeValidation = (body) => resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
                });
            }
            return Promise.reject(new Error(`unexpected request: ${url}`));
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        const create = screen.getByRole("button", {name: "Create game"});
        expect(create).toHaveAttribute("id", "blueprint-create-game");
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "loading"));
        expect(create).toBeDisabled();
        expect(create).toHaveAttribute("aria-busy", "true");
        await user.click(create);
        await act(() => completeValidation?.({status: "invalid", errors: [
            {code: "blueprint-manifest-invalid-name", severity: "error", message: "Choose a game name.", path: "manifest.name"},
        ], warnings: []}));
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "invalid"));
        expect(create).toBeDisabled();
        expect(create).not.toHaveAttribute("aria-busy");
        expect(screen.getByText(/Fix the highlighted design errors/)).toBeInTheDocument();
        expect(create).toHaveAccessibleDescription("Fix the highlighted design errors before creating your game. Studio checks your changes automatically.");
        await user.click(create);
        expect(requests.filter((path) => path === "/api/home/blueprints/validate")).toHaveLength(1);
        expect(requests).not.toContain("/api/home/blueprints/save-managed");
        expect(requests).not.toContain("/api/home/projects/open");

        completeValidation = undefined;
        await user.clear(screen.getByLabelText("Game name"));
        await user.type(screen.getByLabelText("Game name"), "Corrected Game");
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "loading"));
        expect(create).toBeDisabled();
        await act(() => completeValidation?.({status: "ok", warnings: []}));
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "ok"));
        expect(create).toBeEnabled();
        expect(create).not.toHaveAttribute("aria-busy");
        expect(requests).not.toContain("/api/home/blueprints/save-managed");
        expect(requests).not.toContain("/api/home/projects/open");
    });

    it("uses exactly one pointer activation of the native control after terminal ok to save and open Overview", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/save-managed": () => ({ok: true, status: 201, body: {status: "ok", path: "/games/starter", blueprintHash: "h1"}}),
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: "/games/starter"}}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/starter", game: {id: "starter-slot", name: "Starter Slot", version: "1.0.0"}, type: "blueprint", capabilities: []}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {valid: true, packageRoot: "/games/starter"}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        let finishValidation: (() => void) | undefined;
        const deferredFetch: FetchLike = (url, init) => fetchImpl(url, init).then((response) => url === "/api/home/blueprints/validate"
            ? {...response, json: () => new Promise((resolve) => {
                finishValidation = () => resolve({status: "ok", warnings: []});
            })}
            : response);
        const {router} = renderRoutedApp({fetchImpl: deferredFetch, initialEntries: ["/home/design"]});
        const create = screen.getByRole("button", {name: "Create game"});
        const activations: string[] = [];
        create.addEventListener("click", () => activations.push(create.getAttribute("data-pokie-validation-state")!));
        await waitFor(() => expect(finishValidation).toBeDefined());
        expect(create).toHaveAttribute("data-pokie-validation-state", "loading");
        await user.click(create);
        expect(activations).toEqual([]);
        await act(() => finishValidation?.());
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "ok"));
        expect(create).toBeEnabled();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/save-managed")).toHaveLength(0);
        await user.click(create);
        await screen.findByRole("heading", {name: "Starter Slot"});
        expect(activations).toEqual(["ok"]);
        expect(router.state.location.pathname).toBe("/project/%2Fgames%2Fstarter/overview");
        expect(document.querySelector('[data-pokie-lifecycle-result-control="project-tab:overview"][data-pokie-lifecycle-terminal="rendered"]')).toBeVisible();
        expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(1);
        expect(calls.filter((call) => call.url === "/api/home/blueprints/save-managed")).toHaveLength(1);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        const saved = JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/save-managed")!.init!.body!);
        expect(saved.blueprint.manifest.id).toBe("starter-slot");
        const validated = JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/validate")!.init!.body!);
        expect(saved.blueprint).toEqual(validated.blueprint);
    });

    it("does not expose the removed Configure-to-Validate-to-Build workflow", async () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});

        expect(screen.queryByRole("button", {name: "Validate"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /Build Package|Build/})).not.toBeInTheDocument();
        expect(screen.queryByRole("list", {name: "Progress"})).not.toBeInTheDocument();
        await screen.findByText("Valid — no issues found.");
    });

    it("withdraws rendered ok readiness when focusing Create commits a changed field", async () => {
        const user = userEvent.setup();
        const requests: string[] = [];
        const writes: string[] = [];
        let finishValidation: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/home/projects/registry") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (url === "/api/home/blueprints/validate" && init?.method === "POST") {
                requests.push(init.body ?? "{}");
                return new Promise((resolve) => {
                    finishValidation = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
                });
            }
            if (init?.method === "POST") writes.push(url);
            return Promise.reject(new Error(`unexpected request: ${url}`));
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        const create = screen.getByRole("button", {name: "Create game"});
        await waitFor(() => expect(finishValidation).toBeDefined());
        await act(() => finishValidation?.());
        expect(create).toHaveAttribute("data-pokie-validation-state", "ok");

        const id = screen.getByLabelText("Game id");
        await user.click(id);
        fireEvent.change(id, {target: {value: "edited-slot"}});
        act(() => create.focus());
        expect(create).toHaveFocus();
        expect(create).toHaveAttribute("data-pokie-validation-state", "stale");
        expect(create).toBeDisabled();
        await user.click(create);
        expect(requests).toHaveLength(1);

        finishValidation = undefined;
        await waitFor(() => expect(requests).toHaveLength(2));
        expect(JSON.parse(requests[1]).blueprint.manifest.id).toBe("edited-slot");
        expect(create).toHaveAttribute("data-pokie-validation-state", "loading");
        expect(create).toBeDisabled();
        await act(() => finishValidation?.());
        expect(create).toHaveAttribute("data-pokie-validation-state", "ok");
        expect(create).toBeEnabled();
        expect(create).not.toHaveAttribute("aria-busy");
        expect(writes).toEqual([]);
    });

    it("keeps a failed validation disabled and explains how to check the design again", async () => {
        const user = userEvent.setup();
        const requests: string[] = [];
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "error", message: "Validation service unavailable"},
            (path) => requests.push(path)), initialEntries: ["/home/design"]});
        const create = screen.getByRole("button", {name: "Create game"});
        await waitFor(() => expect(create).toHaveAttribute("data-pokie-validation-state", "error"));
        expect(create).toBeDisabled();
        expect(create).not.toHaveAttribute("aria-busy");
        expect(create).toHaveAccessibleDescription("Studio couldn't check this design. Review the validation error below and edit the design to check it again.");
        await user.click(create);
        expect(requests).not.toContain("/api/home/blueprints/save-managed");
        expect(requests).not.toContain("/api/home/projects/open");
    });

    it("makes Create game surface automatic validation errors without trying to save", async () => {
        const user = userEvent.setup();
        const requests: string[] = [];
        renderRoutedApp({
            fetchImpl: fetchWithValidateResult(
                {
                    status: "invalid",
                    errors: [
                        {
                            code: "blueprint-manifest-invalid-id",
                            severity: "error",
                            message: '"manifest.id" must be a non-empty string.',
                            path: "manifest.id",
                        },
                    ],
                    warnings: [],
                },
                (path) => requests.push(path),
            ),
            initialEntries: ["/home/design"],
        });

        await user.click(screen.getByRole("button", {name: "Create game"}));

        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveAttribute("aria-invalid", "true");
        expect(requests).toContain("/api/home/blueprints/validate");
        expect(requests).not.toContain("/api/home/blueprints/save-managed");
    });
});
