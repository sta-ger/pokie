import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
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
        expect(screen.getByRole("button", {name: "Create game"})).toBeInTheDocument();

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
    });

    it("does not expose the removed Configure-to-Validate-to-Build workflow", () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});

        expect(screen.queryByRole("button", {name: "Validate"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /Build Package|Build/})).not.toBeInTheDocument();
        expect(screen.queryByRole("list", {name: "Progress"})).not.toBeInTheDocument();
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
