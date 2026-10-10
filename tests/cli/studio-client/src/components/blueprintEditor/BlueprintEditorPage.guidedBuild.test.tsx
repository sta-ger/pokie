import {fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("Guided draft package safety", () => {
    it.each(["invalid", "error"])("keeps package publication disabled after %s validation with preview available", async (status) => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: status === "invalid"
                ? {status, errors: [{code: "invalid-design", severity: "error", message: "Repair the design."}], warnings: []}
                : {status, message: "Validation unavailable."}}),
        });
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toHaveAttribute("data-pokie-validation-state", status));
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Build Preview"})).toBeEnabled();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build-preview" || call.url === "/api/home/blueprints/build")).toHaveLength(0);
    });

    it("blocks unapplied JSON edits even when the in-memory design is valid", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        });
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
        expect(screen.getByText("Apply or discard the JSON edit before building.")).toBeVisible();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build-preview" || call.url === "/api/home/blueprints/build")).toHaveLength(0);
    });

    it("blocks a drifted saved source after successful revalidation of its older draft", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {
                status: "ok", path: "/games/source.json", blueprint: createRecommendedBlueprint(), blueprintHash: "original",
            }}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "changed", blueprintHash: "external-edit"}}),
        });
        renderWithProviders(<BlueprintEditorPage guided initialPath="/games/source.json" />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await screen.findByText("Reload or save the changed source before building.");
        await screen.findByText("Valid — no issues found.");
        expect(screen.getByRole("button", {name: "Build Package"})).toBeDisabled();
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        expect(calls.filter((call) => call.url === "/api/home/blueprints/build-preview" || call.url === "/api/home/blueprints/build")).toHaveLength(0);
    });
});
