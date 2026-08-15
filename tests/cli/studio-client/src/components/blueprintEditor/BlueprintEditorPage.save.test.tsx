import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useLocation} from "react-router-dom";
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
                return {ok: true, status: 200, body: {context: {status: "loaded"}, manifest: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"}}};
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
        await waitFor(() =>
            expect(screen.getByTestId("location")).toHaveTextContent("/project/%2Fprojects%2Fstarter-slot%2Fblueprint.json/overview"),
        );
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
