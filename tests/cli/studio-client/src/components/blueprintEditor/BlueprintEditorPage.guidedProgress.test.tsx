import {screen, waitFor} from "@testing-library/react";
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
        expect(screen.getByRole("button", {name: "Create Project"})).toBeInTheDocument();

        await waitFor(() => expect(screen.getByText("Valid — no issues found.")).toBeInTheDocument());
    });

    it("does not expose the removed Configure-to-Validate-to-Build workflow", () => {
        renderRoutedApp({fetchImpl: fetchWithValidateResult({status: "ok", warnings: []}), initialEntries: ["/home/design"]});

        expect(screen.queryByRole("button", {name: "Validate"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: /Build Package|Build/})).not.toBeInTheDocument();
        expect(screen.queryByRole("list", {name: "Progress"})).not.toBeInTheDocument();
    });

    it("makes Create Project surface automatic validation errors without trying to save", async () => {
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

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(screen.getByText("Invalid — 1 error(s).")).toBeInTheDocument());
        expect(screen.getByLabelText("Game id")).toHaveAttribute("aria-invalid", "true");
        expect(requests).toContain("/api/home/blueprints/validate");
        expect(requests).not.toContain("/api/home/blueprints/save-managed");
    });
});
