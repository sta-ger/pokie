import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useLocation} from "react-router-dom";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {createFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("BlueprintEditorPage - Save conflict -> Overwrite", () => {
    it("shows a conflict panel on a 409 and resends with overwrite:true after confirming", async () => {
        const user = userEvent.setup();
        const saveCalls: {overwrite: boolean}[] = [];
        const {fetchImpl} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/save") {
                const body = JSON.parse(call.init?.body ?? "{}") as {overwrite: boolean; path: string};
                saveCalls.push({overwrite: body.overwrite});
                if (!body.overwrite) {
                    return {ok: false, status: 409, body: {status: "conflict", path: body.path, error: `"${body.path}" already exists.`}};
                }
                return {ok: true, status: 200, body: {status: "ok", path: body.path}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(<BlueprintEditorPage />, {fetchImpl});

        await user.type(screen.getByLabelText("Save to path"), "/games/a/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Save"}));

        expect(await screen.findByText('"/games/a/blueprint.json" already exists.')).toBeInTheDocument();
        expect(saveCalls).toEqual([{overwrite: false}]);

        await user.click(screen.getByRole("button", {name: "Overwrite"}));
        // useConfirm opens a Mantine confirm modal -- click its own Confirm button.
        await user.click(await screen.findByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(saveCalls).toEqual([{overwrite: false}, {overwrite: true}]);
        });
        expect(await screen.findByText('Saved to "/games/a/blueprint.json".')).toBeInTheDocument();
    });
});

function LocationProbe() {
    return <output data-testid="location">{useLocation().pathname}</output>;
}

describe("BlueprintEditorPage - guided Create Project", () => {
    it("automatically validates the initial Recommended revision", async () => {
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(1), {timeout: 1500});
        const body = JSON.parse(calls[0].init?.body ?? "{}");
        expect(body.blueprint.manifest).toMatchObject({id: "starter-slot", name: "Starter Slot"});
    });

    it("validates the initial Recommended revision and creates, registers, then opens its Workspace with one action", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            if (call.url === "/api/home/blueprints/save-managed") {
                return {
                    ok: true,
                    status: 201,
                    body: {
                        status: "ok",
                        path: "/projects/starter-slot/blueprint.json",
                        name: "starter-slot",
                        blueprintHash: "starter-hash",
                        registeredProject: {
                            location: "/projects/starter-slot/blueprint.json",
                            name: "Starter Slot",
                            type: "blueprint",
                            capabilities: ["runtime.execute"],
                            origin: "managed",
                            status: "ok",
                        },
                    },
                };
            }
            if (call.url === "/api/home/projects/open") {
                return {
                    ok: true,
                    status: 200,
                    body: {
                        context: {mode: "project", projectRoot: "/projects/starter-slot/blueprint.json"},
                        manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                    },
                };
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(
            <>
                <BlueprintEditorPage guided />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(1));
        expect(calls.filter((call) => call.url === "/api/home/blueprints/save-managed")).toHaveLength(1);
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        const savedBlueprint = JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/save-managed")?.init?.body ?? "{}")
            .blueprint as {reelStrips: string[][]};
        expect(savedBlueprint.reelStrips.map((strip) => strip.length)).toEqual([4, 4, 4, 4, 4]);
        expect(savedBlueprint.reelStrips.reduce((outcomeSpaceSize, strip) => outcomeSpaceSize * strip.length, 1)).toBe(1024);
        await waitFor(() =>
            expect(screen.getByTestId("location")).toHaveTextContent("/project/%2Fprojects%2Fstarter-slot%2Fblueprint.json/overview"),
        );
    });

    it("opens the saved Workspace even when the managed-save response has no registry projection", async () => {
        const user = userEvent.setup();
        const savedPath = "/projects/starter-slot/blueprint.json";
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            if (call.url === "/api/home/blueprints/save-managed") {
                return {ok: true, status: 201, body: {status: "ok", path: savedPath, name: "starter-slot", blueprintHash: "starter-hash"}};
            }
            if (call.url === "/api/home/projects/open") {
                return {
                    ok: true,
                    status: 200,
                    body: {
                        context: {mode: "project", projectRoot: savedPath},
                        manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                    },
                };
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(
            <>
                <BlueprintEditorPage guided />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1));
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/projects/open")?.init?.body ?? "{}")).toEqual({projectRoot: savedPath});
        await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/project/${encodeURIComponent(savedPath)}/overview`));
    });

    it("opens the just-persisted Blueprint path instead of an unresolved registry projection", async () => {
        const user = userEvent.setup();
        const savedPath = "/projects/starter-slot/blueprint.json";
        const unresolvedRegistryLocation = "/projects/starter-slot";
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            if (call.url === "/api/home/blueprints/save-managed") {
                return {
                    ok: true,
                    status: 201,
                    body: {
                        status: "ok",
                        path: savedPath,
                        name: "starter-slot",
                        blueprintHash: "starter-hash",
                        registeredProject: {
                            location: unresolvedRegistryLocation,
                            name: "Starter Slot",
                            type: "blueprint",
                            capabilities: ["runtime.execute"],
                            origin: "managed",
                            status: "ok",
                        },
                    },
                };
            }
            if (call.url === "/api/home/projects/open") {
                const projectRoot = (JSON.parse(call.init?.body ?? "{}") as {projectRoot?: string}).projectRoot;
                if (projectRoot !== savedPath) {
                    return {ok: false, status: 404, body: {error: "The project could not be found."}};
                }
                return {
                    ok: true,
                    status: 200,
                    body: {
                        context: {mode: "project", projectRoot: savedPath},
                        manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
                    },
                };
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(
            <>
                <BlueprintEditorPage guided />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1));
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/projects/open")?.init?.body ?? "{}")).toEqual({projectRoot: savedPath});
        await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/project/${encodeURIComponent(savedPath)}/overview`));
    });

    it("validates an immediately edited revision before saving and does not save it when invalid", async () => {
        const validationBodies: {blueprint: {manifest: {name: string}}}[] = [];
        const managedSaveBodies: unknown[] = [];
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/validate") {
                const body = JSON.parse(call.init?.body ?? "{}") as {blueprint: {manifest: {name: string}}};
                validationBodies.push(body);
                return body.blueprint.manifest.name.length === 0
                    ? {
                        ok: true,
                        status: 200,
                        body: {status: "invalid", errors: [{code: "missing-name", severity: "error", message: "Game name is required."}], warnings: []},
                    }
                    : {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            if (call.url === "/api/home/blueprints/save-managed") {
                managedSaveBodies.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 201, body: {status: "ok", path: "/projects/starter-slot/blueprint.json", name: "starter-slot", blueprintHash: "starter-hash"}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(1), {timeout: 1500});
        expect(await screen.findByText("Valid — no issues found.")).toBeInTheDocument();

        const gameNameInput = screen.getByLabelText("Game name");
        act(() => {
            fireEvent.change(gameNameInput, {target: {value: ""}});
            fireEvent.blur(gameNameInput);
            fireEvent.click(screen.getByRole("button", {name: "Create Project"}));
        });

        await waitFor(() => expect(validationBodies).toHaveLength(2));
        expect(validationBodies[0].blueprint.manifest.name).toBe("Starter Slot");
        expect(validationBodies[1].blueprint.manifest.name).toBe("");
        expect(managedSaveBodies).toHaveLength(0);
    });

    it("releases a joined stale validation so Create Project saves the edited revision", async () => {
        const user = userEvent.setup();
        const validationBodies: unknown[] = [];
        const managedSaveBodies: unknown[] = [];
        let validationRequests = 0;
        let resolveInitialValidation: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/home/blueprints/validate") {
                validationBodies.push(JSON.parse(init?.body ?? "{}"));
                validationRequests += 1;
                if (validationRequests === 1) {
                    return new Promise((resolve) => {
                        resolveInitialValidation = resolve;
                    });
                }
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
            }
            if (url === "/api/home/blueprints/save-managed") {
                managedSaveBodies.push(JSON.parse(init?.body ?? "{}"));
                return Promise.resolve({
                    ok: true,
                    status: 201,
                    json: () => Promise.resolve({status: "ok", path: "/projects/edited-slot/blueprint.json", name: "edited-slot", blueprintHash: "edited-hash"}),
                });
            }
            throw new Error(`unexpected fetch to ${url}`);
        };

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});

        await waitFor(() => expect(validationRequests).toBe(1), {timeout: 1500});
        await user.click(screen.getByRole("button", {name: "Create Project"}));
        const gameNameInput = screen.getByLabelText("Game name");
        // This regression covers the revision boundary, not per-keystroke behavior. A single native
        // change event models the completed manual edit while avoiding eleven full editor rerenders
        // that can starve this timing-sensitive stale-request test under the two-worker gate.
        act(() => {
            fireEvent.change(gameNameInput, {target: {value: "Edited Slot"}});
            fireEvent.blur(gameNameInput);
        });

        expect(resolveInitialValidation).toBeDefined();
        await act(async () => {
            resolveInitialValidation?.({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
            await Promise.resolve();
        });
        expect(managedSaveBodies).toHaveLength(0);

        await user.click(screen.getByRole("button", {name: "Create Project"}));

        await waitFor(() => expect(managedSaveBodies).toHaveLength(1));
        expect(validationBodies.length).toBeGreaterThanOrEqual(2);
        expect((managedSaveBodies[0] as {blueprint: {manifest: {name: string}}}).blueprint.manifest.name).toBe("Edited Slot");
        expect((validationBodies[0] as {blueprint: {manifest: {name: string}}}).blueprint.manifest.name).toBe("Starter Slot");
        expect((validationBodies.at(-1) as {blueprint: {manifest: {name: string}}}).blueprint.manifest.name).toBe("Edited Slot");
    });

    it("automatically validates the seeded Random revision after it replaces Recommended", async () => {
        const user = userEvent.setup();
        const randomBlueprint = {
            manifest: {id: "seeded-slot", name: "Seeded Slot", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "K", "Q", "J", "10"],
            paytable: {A: {3: 5}, K: {3: 4}, Q: {3: 3}, J: {3: 2}, "10": {3: 1}},
            availableBets: [1],
            reelStripGeneration: [
                {type: "generated", length: 15, symbolWeights: {A: 1, K: 2, Q: 3, J: 4, "10": 5}, seed: 1},
                {type: "generated", length: 15, symbolWeights: {A: 1, K: 2, Q: 3, J: 4, "10": 5}, seed: 2},
                {type: "generated", length: 15, symbolWeights: {A: 1, K: 2, Q: 3, J: 4, "10": 5}, seed: 3},
            ],
        };
        const {fetchImpl, calls} = createFakeFetch((call) => {
            if (call.url === "/api/home/blueprints/random") {
                return {
                    ok: true,
                    status: 200,
                    body: {blueprint: randomBlueprint, seed: 20260815, preset: "default", provenance: {generatorVersion: "1.1.0", strategy: "default-line-pay", seed: 20260815}},
                };
            }
            if (call.url === "/api/home/blueprints/validate") {
                return {ok: true, status: 200, body: {status: "ok", warnings: []}};
            }
            throw new Error(`unexpected fetch to ${call.url}`);
        });

        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "New Blueprint"}));
        const dialogHeading = await screen.findByRole("heading", {name: "Create Blueprint Project"});
        expect(dialogHeading.tagName).toBe("H2");
        expect(dialogHeading.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
        await user.click(await screen.findByRole("button", {name: "Generate random"}));
        await user.click(screen.getByRole("button", {name: "Generate"}));
        await user.click(await screen.findByRole("button", {name: "Use this blueprint"}));

        await waitFor(() => {
            const randomValidation = calls.find(
                (call) =>
                    call.url === "/api/home/blueprints/validate" &&
                    JSON.parse(call.init?.body ?? "{}").blueprint?.manifest?.id === "seeded-slot",
            );
            expect(randomValidation).toBeDefined();
        }, {timeout: 1500});
        const validationBody = JSON.parse(
            calls.find(
                (call) =>
                    call.url === "/api/home/blueprints/validate" &&
                    JSON.parse(call.init?.body ?? "{}").blueprint?.manifest?.id === "seeded-slot",
            )?.init?.body ?? "{}",
        );
        expect(validationBody.blueprint).toEqual(randomBlueprint);
    });
});
