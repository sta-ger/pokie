import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
