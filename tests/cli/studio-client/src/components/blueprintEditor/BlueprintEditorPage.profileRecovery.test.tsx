import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {MemoryRouter} from "react-router-dom";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {clearPersistedBlueprintDraft, loadPersistedBlueprintDraft, savePersistedBlueprintDraft, validatePersistedBlueprintDraft} from "../../../../../../cli/studio-client/src/domain/blueprintDraftStorage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const storageKey = "pokie-studio:design-draft:v1";
const recoveryMessage = "Recovered an unsaved draft from your last session in this tab.";
const retained = {...createRecommendedBlueprint(), manifest: {id: "tab-draft", name: "Tab Draft", version: "0.1.0"}};
const evidence = {metaSheet: [], facts: [], losslessEligible: true, importedBlueprintHash: "sha256:imported", provenanceHashMatches: true};
const malformed = [
    {value: null, diagnostic: '"draft" must be an object.'},
    {value: {blueprint: []}, diagnostic: '"draft.blueprint" must be a JSON object.'},
    {value: {blueprint: {}, importedFromParSheetPath: 7}, diagnostic: '"draft.importedFromParSheetPath" must be a string when given.'},
];

function api() {
    return createRoutedFakeFetch({
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
        "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/explicit.json", blueprint: {...retained, manifest: {...retained.manifest, name: "Explicit Source"}}, blueprintHash: "explicit"}}),
        "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "unchanged"}}),
        "/api/home/blueprints/par-import": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/import.xlsx", blueprint: retained, conversionEvidence: evidence, errors: [], warnings: []}}),
        "/api/home/blueprints/save-managed": () => ({ok: true, status: 201, body: {status: "ok", path: "/games/saved/blueprint.json", name: "saved", blueprintHash: "saved"}}),
        "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: "/games/saved/blueprint.json"}, manifest: retained.manifest}}),
    });
}

function editName(name: string): void {
    fireEvent.change(screen.getByLabelText("Game name"), {target: {value: name}});
    fireEvent.blur(screen.getByLabelText("Game name"));
}

// Keep the review's named file, but exercise the original tab-local contract, not profile copying.
describe("Design recovery in the same browser tab", () => {
    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => {
        jest.restoreAllMocks();
        window.sessionStorage.clear();
    });

    it("retains rendered applied edits across a same-tab remount and restores only by explicit choice, unsaved", async () => {
        const first = api();
        const mounted = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl: first.fetchImpl});
        editName("Applied Tab Edit");
        await waitFor(() => expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Applied Tab Edit"}));
        const saved = window.sessionStorage.getItem(storageKey);
        mounted.unmount();
        const fresh = api();
        const dirty = jest.fn();
        renderWithProviders(<BlueprintEditorPage guided onDirtyChange={dirty} />, {fetchImpl: fresh.fetchImpl});
        expect(screen.getByText(recoveryMessage)).toBeVisible();
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        expect(window.sessionStorage.getItem(storageKey)).toBe(saved);
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Applied Tab Edit");
        await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(true));
        expect(screen.queryByText(recoveryMessage)).not.toBeInTheDocument();
        expect(fresh.calls.some(call => (/\/(save|save-managed|build|draft)$/).test(call.url))).toBe(false);
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Applied Tab Edit"});
    });

    it("preserves applied PAR provenance through edits and remount; Save forwards the path, never browser evidence", async () => {
        const user = userEvent.setup();
        const first = api();
        const mounted = renderWithProviders(<BlueprintEditorPage guided initialParSheetPath="/games/import.xlsx" />, {fetchImpl: first.fetchImpl});
        await screen.findByText("Imported successfully");
        await user.click(screen.getByRole("button", {name: /Apply \/ Export.*Commit or write out/}));
        await user.click(screen.getByRole("button", {name: "Apply", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Confirm", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Tab Draft");
        editName("Edited PAR Draft");
        await waitFor(() => expect(loadPersistedBlueprintDraft()).toMatchObject({blueprint: {manifest: {name: "Edited PAR Draft"}}, importedFromParSheetPath: "/games/import.xlsx"}));
        mounted.unmount();
        const saved = loadPersistedBlueprintDraft()!;
        expect(saved.importedFromParSheetPath).toBe("/games/import.xlsx");
        expect(saved.conversionEvidence).toMatchObject({facts: [], importedBlueprintHash: "sha256:imported"});
        const fresh = api();
        const dirty = jest.fn();
        renderWithProviders(<BlueprintEditorPage guided onDirtyChange={dirty} />, {fetchImpl: fresh.fetchImpl});
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Edited PAR Draft");
        expect(screen.getByText("Imported from PAR")).toBeVisible();
        expect(dirty).toHaveBeenLastCalledWith(true);
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Create game"}));
        await waitFor(() => expect(fresh.calls.some(call => call.url.endsWith("/save-managed"))).toBe(true));
        expect(JSON.parse(fresh.calls.find(call => call.url.endsWith("/save-managed"))!.init!.body!)).toEqual({blueprint: saved.blueprint, sourceWorkbookPath: "/games/import.xlsx", operationId: expect.any(String)});
        await waitFor(() => expect(loadPersistedBlueprintDraft()).toBeUndefined());
    });

    it.each([false, true])("does not promote browser evidence to Save authority after coordinated edits=%s", async (coordinated) => {
        const forged = {...evidence, importedBlueprintHash: "sha256:forged"};
        const blueprint = coordinated ? {...retained, manifest: {...retained.manifest, name: "Coordinated Edit"}} : retained;
        const path = coordinated ? "/games/other.xlsx" : "/games/import.xlsx";
        savePersistedBlueprintDraft(blueprint, path, forged);
        const {fetchImpl, calls} = api();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        fireEvent.click(screen.getByRole("button", {name: "Create game"}));
        await waitFor(() => expect(calls.some(call => call.url.endsWith("/save-managed"))).toBe(true));
        expect(JSON.parse(calls.find(call => call.url.endsWith("/save-managed"))!.init!.body!)).toEqual({blueprint, sourceWorkbookPath: path, operationId: expect.any(String)});
        await waitFor(() => expect(loadPersistedBlueprintDraft()).toBeUndefined());
    });

    it("preserves recovery on StrictMode mount and no-op visibility changes; subsequent edits persist", () => {
        savePersistedBlueprintDraft(retained);
        const saved = window.sessionStorage.getItem(storageKey);
        const {fetchImpl, calls} = api();
        const tree = (visible: boolean) => <StrictMode><MantineProvider><MemoryRouter><StudioApiProvider fetchImpl={fetchImpl}><ModalsProvider><BlueprintEditorPage guided isVisible={visible} /></ModalsProvider></StudioApiProvider></MemoryRouter></MantineProvider></StrictMode>;
        const mounted = render(tree(true));
        mounted.rerender(tree(false));
        mounted.rerender(tree(true));
        expect(screen.getByRole("button", {name: "Restore", exact: true})).toBeVisible();
        expect(window.sessionStorage.getItem(storageKey)).toBe(saved);
        expect(calls.some(call => call.url.endsWith("/draft"))).toBe(false);
        editName("An actual edit");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "An actual edit"});
    });

    it("keeps unapplied JSON when replacement is cancelled; Discard clears recovery and permits subsequent edits", async () => {
        savePersistedBlueprintDraft(retained);
        const saved = window.sessionStorage.getItem(storageKey);
        const {fetchImpl} = api();
        const user = userEvent.setup();
        const mounted = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Cancel", exact: true}));
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unfinished JSON");
        expect(window.sessionStorage.getItem(storageKey)).toBe(saved);
        await user.click(screen.getByRole("button", {name: "Discard", exact: true}));
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unfinished JSON");
        mounted.unmount();
        const next = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        expect(screen.queryByText(recoveryMessage)).not.toBeInTheDocument();
        editName("After Discard");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "After Discard"});
        next.unmount();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("After Discard");
    });

    it.each(["source", "job"])("gives an explicit %s initial document precedence over the tab slot", async (kind) => {
        savePersistedBlueprintDraft(retained, "/games/unrelated.xlsx");
        const {fetchImpl} = api();
        renderWithProviders(<BlueprintEditorPage guided
            initialPath={kind === "source" ? "/games/explicit.json" : undefined}
            recoveryRequest={kind === "job" ? {blueprint: {...retained, manifest: {...retained.manifest, name: "Explicit Job"}}} : undefined}
        />, {fetchImpl});
        await screen.findByDisplayValue(kind === "source" ? "Explicit Source" : "Explicit Job");
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();
        expect(loadPersistedBlueprintDraft()?.importedFromParSheetPath).toBeUndefined();
    });

    it("fresh-tab edits, Restore, Discard and Save cannot expose or change another tab's document", async () => {
        // Browser-provided sessionStorage determines ownership. Use separate Storage instances at
        // that seam; this is a component regression, not an independent browser observation.
        const firstTab = window.sessionStorage;
        savePersistedBlueprintDraft(retained);
        const savedFirstTab = firstTab.getItem(storageKey);
        const secondData = new Map<string, string>();
        const secondTab: Storage = {
            get length() {
                return secondData.size;
            },
            clear: () => secondData.clear(),
            getItem: key => secondData.get(key) ?? null,
            key: index => [...secondData.keys()][index] ?? null,
            removeItem: key => {
                secondData.delete(key);
            },
            setItem: (key, value) => {
                secondData.set(key, value);
            },
        };
        jest.spyOn(window, "sessionStorage", "get").mockReturnValue(secondTab);
        const {fetchImpl, calls} = api();
        const mounted = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        editName("Second Tab");
        mounted.unmount();
        const restored = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Second Tab");
        expect(firstTab.getItem(storageKey)).toBe(savedFirstTab);
        restored.unmount();
        const discarded = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        fireEvent.click(screen.getByRole("button", {name: "Discard", exact: true}));
        expect(secondTab.getItem(storageKey)).toBeNull();
        expect(firstTab.getItem(storageKey)).toBe(savedFirstTab);
        editName("Second Tab Saved");
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        fireEvent.click(screen.getByRole("button", {name: "Create game"}));
        await waitFor(() => expect(calls.some(call => call.url.endsWith("/projects/open"))).toBe(true));
        await waitFor(() => expect(secondTab.getItem(storageKey)).toBeNull());
        expect(firstTab.getItem(storageKey)).toBe(savedFirstTab);
        expect(calls.some(call => call.url.endsWith("/draft"))).toBe(false);
        discarded.unmount();
        jest.restoreAllMocks();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Tab Draft");
    });

    it.each(malformed)("rejects $diagnostic without coercion and permits repeated repaired use in the mounted editor", ({value, diagnostic}) => {
        expect(() => validatePersistedBlueprintDraft(value)).toThrow(diagnostic);
        window.sessionStorage.setItem(storageKey, JSON.stringify(value));
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        const {fetchImpl} = api();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        editName("Repaired");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Repaired"});
        const saved = window.sessionStorage.getItem(storageKey);
        savePersistedBlueprintDraft([], undefined, undefined);
        expect(window.sessionStorage.getItem(storageKey)).toBe(saved);
        editName("Repaired Again");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Repaired Again"});
    });

    it("keeps optional metadata presence and recoverable model errors separate from executable validity", () => {
        expect(validatePersistedBlueprintDraft({blueprint: {}})).toEqual({blueprint: {}});
        savePersistedBlueprintDraft({}, "/games/input.xlsx", null);
        expect(loadPersistedBlueprintDraft()).toEqual({blueprint: {}, importedFromParSheetPath: "/games/input.xlsx", conversionEvidence: null});
        clearPersistedBlueprintDraft();
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        savePersistedBlueprintDraft(retained);
        expect(loadPersistedBlueprintDraft()).toEqual({blueprint: retained});
        expect(loadPersistedBlueprintDraft()).not.toHaveProperty("conversionEvidence");
        window.sessionStorage.setItem(storageKey, "{unfinished");
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        savePersistedBlueprintDraft(retained);
        expect(loadPersistedBlueprintDraft()).toEqual({blueprint: retained});
    });

    it("keeps the editor usable when storage fails, then persists later edits after storage recovers", () => {
        const {fetchImpl} = api();
        const storage = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Storage disabled");
        });
        const reading = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("Storage disabled");
        });
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        editName("In-memory edit");
        expect(screen.getByLabelText("Game name")).toHaveValue("In-memory edit");
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(() => clearPersistedBlueprintDraft()).not.toThrow();
        storage.mockRestore();
        reading.mockRestore();
        editName("Recovered storage");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Recovered storage"});
        editName("Continued edit");
        expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Continued edit"});
    });
});
