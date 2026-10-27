import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {StrictMode} from "react";
import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {createMemoryRouter, MemoryRouter, RouterProvider} from "react-router-dom";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {loadPersistedProjectBlueprintDraft, savePersistedProjectBlueprintDraft, validatePersistedProjectBlueprintDraft, clearPersistedBlueprintDraft, loadPersistedBlueprintDraft, savePersistedBlueprintDraft, validatePersistedBlueprintDraft} from "../../../../../../cli/studio-client/src/domain/blueprintDraftStorage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

import {GameModelTab} from "../../../../../../cli/studio-client/src/components/project/GameModelTab";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";

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
        await user.click(screen.getByRole("button", {name: /Apply.*Update the draft/}));
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

    it("loads an explicit source without overwriting recovery, then restores it as unsaved", async () => {
        savePersistedBlueprintDraft(retained, "/games/unrelated.xlsx");
        const saved = window.sessionStorage.getItem(storageKey);
        const {fetchImpl, calls} = api();
        const dirty = jest.fn();
        renderWithProviders(<BlueprintEditorPage guided initialPath="/games/explicit.json" onDirtyChange={dirty} />, {fetchImpl});
        await screen.findByDisplayValue("Explicit Source");
        expect(screen.getByRole("button", {name: "Restore", exact: true})).toBeVisible();
        expect(window.sessionStorage.getItem(storageKey)).toBe(saved);
        expect(screen.queryByText("Imported from PAR")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Tab Draft");
        expect(dirty).toHaveBeenLastCalledWith(true);
        expect(calls.some(call => (/\/(save|save-managed|build)$/).test(call.url))).toBe(false);
    });

    it("retires a delayed initial source after Restore and keeps the saved source on Discard", async () => {
        savePersistedBlueprintDraft(retained);
        const api = projectApi();
        let release: ((response: Awaited<ReturnType<FetchLike>>) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => url.endsWith("/load") ? new Promise(resolve => {
            release = resolve;
        }) : api.fetchImpl(url, init);
        const first = renderWithProviders(<BlueprintEditorPage guided initialPath={projectRoot} />, {fetchImpl});
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await act(() => Promise.resolve(release!({ok: true, status: 200, json: () => Promise.resolve({status: "ok", path: projectRoot, blueprint: {...retained, manifest: {...retained.manifest, name: "Late source"}}, blueprintHash: "late"})})));
        expect(screen.getByLabelText("Game name")).toHaveValue("Tab Draft");
        first.unmount();
        const second = renderWithProviders(<BlueprintEditorPage guided initialPath={projectRoot} />, {fetchImpl: api.fetchImpl});
        await screen.findByDisplayValue("Tab Draft");
        fireEvent.click(screen.getByRole("button", {name: "Discard", exact: true}));
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        expect(screen.getByLabelText("Game name")).toHaveValue("Tab Draft");
        expect(api.calls.some(call => (/\/(save|save-managed|build)$/).test(call.url))).toBe(false);
        second.unmount();
    });

    it("gives an explicit job initial document precedence over the tab slot", async () => {
        savePersistedBlueprintDraft(retained, "/games/unrelated.xlsx");
        const {fetchImpl} = api();
        renderWithProviders(<BlueprintEditorPage guided recoveryRequest={{blueprint: {...retained, manifest: {...retained.manifest, name: "Explicit Job"}}}} />, {fetchImpl});
        await screen.findByDisplayValue("Explicit Job");
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
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


const projectRoot = "/games/explicit.json";
const projectRecoveryMessage = "An unsaved game model draft is available in this tab. Restore it to continue editing, or Discard it. Restoring does not save changes.";
const projectDraftKey = `pokie-studio:project-draft:v1:${projectRoot}`;

function projectApi(blueprint: typeof retained & Record<string, unknown> = retained) {
    const server = {blueprint, hash: "original", validation: "ok"};
    const transport = createRoutedFakeFetch({
        "/api/project/gameModel": () => ({ok: true, status: 200, body: buildGameModelProjection(server.blueprint as unknown as GameBlueprint)}),
        "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: projectRoot, blueprint: server.blueprint, blueprintHash: server.hash}}),
        "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: server.validation === "ok" ? {status: "ok", warnings: []} : {status: "invalid", errors: [{code: "blueprint-manifest-name", severity: "error", message: "Repair this name"}], warnings: []}}),
        "/api/home/blueprints/save": ({init}) => {
            const request = JSON.parse(init!.body!);
            if (request.expectedHash !== server.hash) return {ok: true, status: 200, body: {status: "error", error: "Source changed on disk"}};
            server.blueprint = request.blueprint;
            server.hash += "-saved";
            return {ok: true, status: 200, body: {status: "ok", path: projectRoot, blueprintHash: server.hash}};
        },
    });
    return {...transport, server};
}

function renderProject(fetchImpl: FetchLike, root = projectRoot, editable = true) {
    const dirty = jest.fn();
    const router = createMemoryRouter([
        {path: "/project/gameModel", element: <GameModelTab editable={editable} projectRoot={root} onDirtyChange={dirty} />},
        {path: "/project/overview", element: <p>Project overview</p>},
    ], {initialEntries: ["/project/overview", "/project/gameModel"]});
    const view = render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ModalsProvider><RouterProvider router={router} /></ModalsProvider></StudioApiProvider></MantineProvider>);
    return {...view, dirty, router};
}

function gameModelAction(action: "edit" | "save" | "cancel"): HTMLElement {
    const control = document.getElementById(`game-model-basics-${action}`);
    if (!control) throw new Error(`Missing Game basics ${action}`);
    return control;
}

const malformedProject = [
    ...malformed,
    {value: {blueprint: {}, section: "limits", sourceHash: "hash"}, diagnostic: '"draft.section" must be an editable Game Model section.'},
    {value: {blueprint: {}, section: "basics", sourceHash: 7}, diagnostic: '"draft.sourceHash" must be a string.'},
];

describe("Project Game Model tab-local recovery", () => {
    beforeEach(() => window.sessionStorage.clear());
    afterEach(() => window.sessionStorage.clear());

    it("retains an applied Save, then a focused unsaved edit across remount, explicit Restore, Save and Discard", async () => {
        const api = projectApi();
        const first = renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        fireEvent.click(gameModelAction("edit"));
        await screen.findByLabelText("Description (optional)");
        fireEvent.input(screen.getByLabelText("Description (optional)"), {target: {value: "Recovered then discarded project draft"}});
        fireEvent.click(gameModelAction("save"));
        await screen.findByText("Description: Recovered then discarded project draft");
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        fireEvent.click(gameModelAction("edit"));
        const description = await screen.findByLabelText("Description (optional)");
        description.focus();
        fireEvent.input(description, {target: {value: "Temporary same-tab recovery choice"}});
        expect(description).toHaveFocus();
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({description: "Temporary same-tab recovery choice"});
        const event = new Event("beforeunload", {cancelable: true});
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        first.unmount();
        const callsBefore = api.calls.length;
        const next = renderProject(api.fetchImpl);
        await screen.findByText("Description: Recovered then discarded project draft");
        expect(screen.getByText(projectRecoveryMessage)).toBeVisible();
        expect(api.calls.slice(callsBefore).some(call => (/\/(save|validate|build)$/).test(call.url))).toBe(false);
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Description (optional)")).toHaveValue("Temporary same-tab recovery choice");
        expect(next.dirty).toHaveBeenLastCalledWith(true);
        expect(api.server.blueprint.manifest).not.toHaveProperty("description", "Temporary same-tab recovery choice");
        fireEvent.click(gameModelAction("save"));
        await screen.findByText("Description: Temporary same-tab recovery choice");
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        fireEvent.click(gameModelAction("edit"));
        await screen.findByLabelText("Game name");
        editName("Discard this edit");
        next.unmount();
        const last = renderProject(api.fetchImpl);
        await screen.findByText(projectRecoveryMessage);
        fireEvent.click(screen.getByRole("button", {name: "Discard", exact: true}));
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        expect(screen.getByText("Name: Tab Draft")).toBeVisible();
        expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
        last.unmount();
        renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
    });

    it.each(["history Leave", "refresh"])("distinguishes %s from recovery, then recovers a subsequent undiscarded edit", async (exit) => {
        const user = userEvent.setup();
        const api = projectApi();
        savePersistedBlueprintDraft(retained);
        savePersistedProjectBlueprintDraft("/games/other.json", {blueprint: retained, section: "basics", sourceHash: "other"});
        const first = renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        fireEvent.click(gameModelAction("edit"));
        const description = await screen.findByLabelText("Description (optional)");
        description.focus();
        fireEvent.input(description, {target: {value: "Fresh affected navigation draft"}});
        const saved = window.sessionStorage.getItem(projectDraftKey);
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({description: "Fresh affected navigation draft"});
        const unload = new Event("beforeunload", {cancelable: true});
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
        expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);

        if (exit === "history Leave") {
            await act(async () => {
                await first.router.navigate(-1);
            });
            await user.click(await screen.findByRole("button", {name: "Stay"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            await waitFor(() => expect(description).toHaveFocus());
            expect(description).toHaveValue("Fresh affected navigation draft");
            expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
            await act(async () => {
                await first.router.navigate(-1);
            });
            await user.click(await screen.findByRole("button", {name: "Leave"}));
            await screen.findByText("Project overview");
            expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
            await act(async () => {
                await first.router.navigate(1);
            });
            await screen.findByText("Name: Tab Draft");
            expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
            expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
            const cleanUnload = new Event("beforeunload", {cancelable: true});
            window.dispatchEvent(cleanUnload);
            expect(cleanUnload.defaultPrevented).toBe(false);
        }
        first.unmount();
        // Same sessionStorage + a new mount models the client lifetime across F5. A real browser
        // F5 and installed asset identity remain the controller's independent workflow evidence.
        const next = renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        if (exit === "refresh") {
            expect(screen.getByText(projectRecoveryMessage)).toBeVisible();
            expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
            const restore = screen.getByRole("button", {name: "Restore", exact: true});
            act(() => restore.focus());
            await user.keyboard("{Enter}");
            expect(screen.getByLabelText("Description (optional)")).toHaveValue("Fresh affected navigation draft");
            expect(next.dirty).toHaveBeenLastCalledWith(true);
            expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
        } else {
            expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
            fireEvent.click(gameModelAction("edit"));
            await screen.findByLabelText("Description (optional)");
        }
        fireEvent.input(screen.getByLabelText("Description (optional)"), {target: {value: "Subsequent recoverable edit"}});
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({description: "Subsequent recoverable edit"});
        next.unmount();
        renderProject(api.fetchImpl);
        await screen.findByText(projectRecoveryMessage);
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Description (optional)")).toHaveValue("Subsequent recoverable edit");
        expect(loadPersistedBlueprintDraft()).toEqual({blueprint: retained});
        expect(loadPersistedProjectBlueprintDraft("/games/other.json")?.sourceHash).toBe("other");
        expect(api.calls.some(call => (/\/(save|validate|build)$/).test(call.url))).toBe(false);
        expect(api.server.blueprint).toEqual(retained);
    });

    it("preserves Design and other-project drafts, and never exposes recovery in read-only projects", async () => {
        savePersistedBlueprintDraft(retained);
        savePersistedProjectBlueprintDraft(projectRoot, {blueprint: retained, section: "basics", sourceHash: "original"});
        const saved = window.sessionStorage.getItem(projectDraftKey);
        const api = projectApi();
        const other = renderProject(api.fetchImpl, "/games/other.json");
        await screen.findByText("Name: Tab Draft");
        expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
        other.unmount();
        const readonly = renderProject(api.fetchImpl, projectRoot, false);
        await screen.findByText("Name: Tab Draft");
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        readonly.unmount();
        renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        fireEvent.click(screen.getByRole("button", {name: "Discard", exact: true}));
        expect(saved).not.toBeNull();
        expect(loadPersistedBlueprintDraft()).toEqual({blueprint: retained});
    });

    it("rejects stale-source Save, retains the restored edit, then permits repaired repeated Save", async () => {
        savePersistedProjectBlueprintDraft(projectRoot, {blueprint: retained, section: "basics", sourceHash: "old"});
        const api = projectApi();
        renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        fireEvent.click(gameModelAction("save"));
        await screen.findByText(/Source changed on disk/);
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.sourceHash).toBe("old");
        fireEvent.click(gameModelAction("cancel"));
        fireEvent.click(await screen.findByRole("button", {name: "Confirm", exact: true}));
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        for (const name of ["First repair", "Second repair"]) {
            fireEvent.click(gameModelAction("edit"));
            await screen.findByLabelText("Game name");
            editName(name);
            fireEvent.click(gameModelAction("save"));
            await screen.findByText(`Name: ${name}`);
            expect(api.server.blueprint.manifest.name).toBe(name);
            expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        }
    });

    it.each(["Edit", "Convert"])("retires a pending %s load on explicit Restore, and preserves edits after validation rejection", async (action) => {
        savePersistedProjectBlueprintDraft(projectRoot, {blueprint: {...retained, manifest: {...retained.manifest, name: "Restored"}}, section: "basics", sourceHash: "original"});
        const api = projectApi({...retained, reelStrips: undefined, symbolWeights: {A: 1, K: 1, Q: 1, J: 1}});
        let release: ((response: Awaited<ReturnType<FetchLike>>) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => url.endsWith("/load") ? new Promise(resolve => {
            release = resolve;
        }) : api.fetchImpl(url, init);
        const mounted = renderProject(fetchImpl);
        await screen.findByText("Name: Tab Draft");
        if (action === "Edit") fireEvent.click(gameModelAction("edit"));
        else fireEvent.click(screen.getByRole("button", {name: "Convert this sample to generated reels…"}));
        expect(release).toBeDefined();
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await act(() => Promise.resolve(release!({ok: true, status: 200, json: () => Promise.resolve({status: "ok", path: projectRoot, blueprint: retained, blueprintHash: "late"})})));
        expect(screen.getByLabelText("Game name")).toHaveValue("Restored");
        api.server.validation = "invalid";
        fireEvent.click(gameModelAction("save"));
        await screen.findByText("Save blocked — correct these errors before saving");
        expect(api.calls.some(call => call.url.endsWith("/save"))).toBe(false);
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({name: "Restored"});
        api.server.validation = "ok";
        editName("Repaired restored draft");
        fireEvent.click(gameModelAction("save"));
        await screen.findByText("Name: Repaired restored draft");
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        mounted.unmount();
    });

    it("preserves an unanswered recovery through no-op Edit/Cancel and cancelled dirty replacement", async () => {
        const user = userEvent.setup();
        savePersistedProjectBlueprintDraft(projectRoot, {blueprint: {...retained, manifest: {...retained.manifest, name: "Retained choice"}}, section: "basics", sourceHash: "original"});
        const saved = window.sessionStorage.getItem(projectDraftKey);
        const api = projectApi();
        renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        fireEvent.click(gameModelAction("edit"));
        await screen.findByLabelText("Game name");
        fireEvent.click(gameModelAction("cancel"));
        expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
        fireEvent.click(gameModelAction("edit"));
        await screen.findByLabelText("Game name");
        editName("Current edit");
        expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Cancel", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Current edit");
        expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Confirm", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Retained choice");
        expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({name: "Retained choice"});
    });

    it.each(malformedProject)("rejects $diagnostic at storage and consumer boundaries, then reuses the same editor", async ({value, diagnostic}) => {
        expect(() => validatePersistedProjectBlueprintDraft(value)).toThrow(diagnostic);
        window.sessionStorage.setItem(projectDraftKey, JSON.stringify(value));
        expect(loadPersistedProjectBlueprintDraft(projectRoot)).toBeUndefined();
        const api = projectApi();
        const mounted = renderProject(api.fetchImpl);
        await screen.findByText("Name: Tab Draft");
        expect(screen.queryByText(projectRecoveryMessage)).not.toBeInTheDocument();
        fireEvent.click(gameModelAction("edit"));
        await screen.findByLabelText("Game name");
        for (const name of ["Repaired project", "Repaired again"]) {
            editName(name);
            expect(loadPersistedProjectBlueprintDraft(projectRoot)?.blueprint.manifest).toMatchObject({name});
            const saved = window.sessionStorage.getItem(projectDraftKey);
            savePersistedProjectBlueprintDraft(projectRoot, value as never);
            expect(window.sessionStorage.getItem(projectDraftKey)).toBe(saved);
        }
        mounted.unmount();
        renderProject(api.fetchImpl);
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await screen.findByDisplayValue("Repaired again");
    });
});
