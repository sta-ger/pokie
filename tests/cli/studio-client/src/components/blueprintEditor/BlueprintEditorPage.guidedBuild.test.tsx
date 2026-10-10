import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const recoveredBlueprint = {...createRecommendedBlueprint(), manifest: {id: "recovered-b", name: "Recovered B", version: "1.0.0"}};
const recoveryRequest = {blueprint: recoveredBlueprint, sourcePath: "/games/B.json", destinationPath: "/games/B-package"};

function RecoveryHarness({initialPath}: {initialPath?: string}) {
    const [request, setRequest] = useState<Readonly<Record<string, unknown>>>();
    return <>
        <button onClick={() => setRequest({...recoveryRequest})}>Recover B</button>
        <BlueprintEditorPage guided initialPath={initialPath} recoveryRequest={request} initialBuildOutDir={request === undefined ? undefined : "/games/B-package"} />
    </>;
}

function validRoutes() {
    return createRoutedFakeFetch({
        "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/A.json", blueprint: createRecommendedBlueprint(), blueprintHash: "A"}}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "changed", blueprintHash: "external-A"}}),
        "/api/home/blueprints/save": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/A.json", blueprintHash: "A"}}),
        "/api/home/blueprints/save-managed": () => ({ok: true, status: 200, body: {status: "error", error: "Save unavailable."}}),
    });
}

describe("Guided draft package safety", () => {
    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => window.sessionStorage.clear());
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
    it("recovers B after A drifted, clears overwrite authority, and revalidates B for publication", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = validRoutes();
        renderWithProviders(<RecoveryHarness initialPath="/games/A.json" />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await screen.findByText("Reload or save the changed source before building.");
        await user.click(screen.getByRole("button", {name: "Recover B"}));
        await screen.findByDisplayValue("Recovered B");
        expect(screen.queryByText("Reload or save the changed source before building.")).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        fireEvent.change(screen.getByLabelText("Save to path"), {target: {value: "/games/A.json"}});
        await user.click(screen.getByRole("button", {name: "Save", exact: true}));
        const request = JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/save")!.init!.body!);
        expect(request).toMatchObject({path: "/games/A.json", blueprint: recoveredBlueprint, overwrite: false});
        expect(request).not.toHaveProperty("expectedHash");
    });

    it("ignores A's outstanding source-check response after recovery of B", async () => {
        const user = userEvent.setup();
        const base = validRoutes();
        let resolveCheck!: (value: unknown) => void;
        const response = new Promise<unknown>((resolve) => {
            resolveCheck = resolve;
        });
        let checkStarted = false;
        const fetchImpl: typeof base.fetchImpl = (url, init) => {
            if (url === "/api/home/blueprints/check-source") {
                checkStarted = true;
                return Promise.resolve({ok: true, status: 200, json: () => response});
            }
            return base.fetchImpl(url, init);
        };
        renderWithProviders(<RecoveryHarness initialPath="/games/A.json" />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(checkStarted).toBe(true));
        await user.click(screen.getByRole("button", {name: "Recover B"}));
        await screen.findByDisplayValue("Recovered B");
        await act(async () => {
            resolveCheck({status: "changed", blueprintHash: "external-A"});
            await response;
        });
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        expect(screen.queryByText("Reload or save the changed source before building.")).not.toBeInTheDocument();
    });

    it.each(["load", "save", "save-managed"])("ignores a late %s response for A after recovery of B", async (operation) => {
        const user = userEvent.setup();
        const base = validRoutes();
        let resolveRequest!: (value: unknown) => void;
        const response = new Promise<unknown>((resolve) => {
            resolveRequest = resolve;
        });
        const fetchImpl: typeof base.fetchImpl = (url, init) => url === `/api/home/blueprints/${operation}`
            ? Promise.resolve({ok: true, status: 200, json: () => response})
            : base.fetchImpl(url, init);
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        if (operation === "save-managed") {
            await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
            await user.click(screen.getByRole("button", {name: "Create game"}));
        } else {
            fireEvent.change(screen.getByLabelText(operation === "load" ? "Load from path" : "Save to path"), {target: {value: "/games/A.json"}});
            await user.click(screen.getByRole("button", {name: operation === "load" ? "Load" : "Save", exact: true}));
        }
        await user.click(screen.getByRole("button", {name: "Recover B"}));
        await screen.findByDisplayValue("Recovered B");
        await act(async () => {
            resolveRequest({status: "ok", path: "/games/A.json", blueprint: createRecommendedBlueprint(), blueprintHash: "A"});
            await response;
        });
        expect(screen.getByLabelText("Game name")).toHaveValue("Recovered B");
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("/games/B-package");
        expect(JSON.parse(window.sessionStorage.getItem("pokie-studio:design-draft:v1")!).blueprint).toEqual(recoveredBlueprint);
        expect(base.calls.some((call) => call.url === "/api/home/projects/open")).toBe(false);
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
    });

    it("clears unrelated PAR provenance before saving the recovered draft", async () => {
        const user = userEvent.setup();
        window.sessionStorage.setItem("pokie-studio:design-draft:v1", JSON.stringify({blueprint: createRecommendedBlueprint(), importedFromParSheetPath: "/games/A.xlsx"}));
        const {fetchImpl, calls} = validRoutes();
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(await screen.findByText("Imported from PAR")).toBeVisible();
        await user.click(screen.getByRole("button", {name: "Recover B"}));
        await user.click(await screen.findByRole("button", {name: "Confirm", exact: true}));
        await screen.findByDisplayValue("Recovered B");
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Create game"}));
        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/blueprints/save-managed")).toBe(true));
        expect(JSON.parse(calls.find((call) => call.url === "/api/home/blueprints/save-managed")!.init!.body!)).toEqual({blueprint: recoveredBlueprint, operationId: expect.any(String)});
    });

    it.each(["New", "Load"])("does not retain the recovered destination after %s", async (operation) => {
        const user = userEvent.setup();
        const {fetchImpl} = validRoutes();
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Recover B"}));
        await screen.findByDisplayValue("Recovered B");
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue("/games/B-package");
        if (operation === "Load") {
            fireEvent.change(screen.getByLabelText("Load from path"), {target: {value: "/games/A.json"}});
            await user.click(screen.getByRole("button", {name: "Load", exact: true}));
        } else {
            await user.click(screen.getByRole("button", {name: "Choose a different start", exact: true}));
            await user.click(await screen.findByRole("button", {name: "Discard", exact: true}));
            await user.click(screen.getByRole("button", {name: "Use the starter game"}));
        }
        await waitFor(() => expect(screen.getByLabelText("Output directory (optional)")).toHaveValue(""));
        expect(screen.queryByText(/Recovered the draft for the previous artifact destination/)).not.toBeInTheDocument();
    });

    it.each(["job", "stored draft"])("preserves unapplied JSON and retained storage when standalone %s recovery is cancelled", async (kind) => {
        const user = userEvent.setup();
        const stored = JSON.stringify({blueprint: recoveredBlueprint});
        window.sessionStorage.setItem("pokie-studio:design-draft:v1", stored);
        const {fetchImpl} = validRoutes();
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
        await user.click(screen.getByRole("button", {name: kind === "job" ? "Recover B" : "Restore", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Cancel", exact: true}));
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unfinished JSON");
        expect(window.sessionStorage.getItem("pokie-studio:design-draft:v1")).toBe(stored);
        expect(screen.queryByText(/Recovered the draft for the previous artifact destination/)).not.toBeInTheDocument();
    });

});
