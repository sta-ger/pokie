import fs from "fs";
import os from "os";
import path from "path";
import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {BlueprintDraftPersistence} from "../../../../../../cli/studio-client/src/domain/BlueprintDraftPersistence";
import {loadPersistedBlueprintDraft} from "../../../../../../cli/studio-client/src/domain/blueprintDraftStorage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {FileStudioBlueprintDraftStore} from "../../../../../../cli/studio/blueprint/FileStudioBlueprintDraftStore";
import {validateStudioBlueprintDraftSnapshot, type StudioBlueprintDraftSnapshot} from "../../../../../../cli/studio/blueprint/StudioBlueprintDraft";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const retained = {...createRecommendedBlueprint(), manifest: {id: "verifier-draft-recovery-updated", name: "Verifier Draft Recovery Updated", version: "0.1.0"}};
const endpoint = "/api/home/blueprints/draft";
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return {promise, resolve};
}
function response(body: unknown, status = 200) {
    return {ok: status === 200, status, json: () => Promise.resolve(body)};
}

describe("Design recovery from the Studio profile", () => {
    let root: string, file: string, store: FileStudioBlueprintDraftStore;
    function api() {
        return createRoutedFakeFetch({
            [endpoint]: ({init}) => {
                if (init?.method !== "POST") return {ok: true, status: 200, body: store.read()};
                const saved = store.replace(validateStudioBlueprintDraftSnapshot(JSON.parse(init.body!)));
                return saved === undefined ? {ok: false, status: 409, body: {error: "Draft changed."}} : {ok: true, status: 200, body: saved};
            },
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/explicit.json", blueprint: createRecommendedBlueprint(), blueprintHash: "explicit"}}),
            "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "unchanged"}}),
        });
    }
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "draft-profile-ui-"));
        file = path.join(root, "config", "pokie", "studio-design-draft-v1.json");
        store = new FileStudioBlueprintDraftStore(file);
        window.sessionStorage.clear();
    });
    afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
        jest.restoreAllMocks();
    });

    it("persists real editor edits and offers explicit Restore in a fresh tab/profile; restored edits stay unsaved", async () => {
        const first = api();
        const mounted = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl: first.fetchImpl});
        fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Verifier Draft Recovery Updated"}});
        fireEvent.blur(screen.getByLabelText("Game name"));
        await waitFor(() => expect(store.read().draft?.blueprint.manifest).toMatchObject({name: "Verifier Draft Recovery Updated"}));
        const original = store.read();
        mounted.unmount();
        // Config-only copy is what the retained-profile handoff actually carries. No browser storage.
        const copiedConfig = path.join(root, "fresh-config");
        fs.cpSync(path.join(root, "config"), copiedConfig, {recursive: true});
        store = new FileStudioBlueprintDraftStore(path.join(copiedConfig, "pokie", path.basename(file)));
        window.sessionStorage.clear();
        const fresh = api();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl: fresh.fetchImpl});
        await screen.findByText("Recovered an unsaved draft from your last Studio session.");
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        expect(store.read()).toEqual(original); // Neither initial render nor a GET rewrites the slot.
        fireEvent.click(screen.getByRole("button", {name: "Restore", exact: true}));
        expect(screen.getByLabelText("Game name")).toHaveValue("Verifier Draft Recovery Updated");
        await waitFor(() => expect(store.read().version).not.toBe(original.version));
        expect(loadPersistedBlueprintDraft()?.blueprint).toEqual(store.read().draft?.blueprint);
        expect(fresh.calls.some(call => (/\/(save|save-managed|build)$/).test(call.url))).toBe(false);
        expect(screen.queryByText("Recovered an unsaved draft from your last Studio session.")).not.toBeInTheDocument();
    });

    it("preserves newer edits when Restore is cancelled; explicit Discard clears durable and tab recovery", async () => {
        const saved = store.replace({version: null, draft: {blueprint: retained}})!;
        const {fetchImpl} = api();
        const user = userEvent.setup();
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        await screen.findByRole("button", {name: "Restore", exact: true});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await user.click(screen.getByRole("radio", {name: "JSON"}));
        fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: "unfinished JSON"}});
        await user.click(screen.getByRole("button", {name: "Restore", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Cancel", exact: true}));
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unfinished JSON");
        expect(store.read()).toEqual(saved);
        await user.click(screen.getByRole("button", {name: "Discard", exact: true}));
        await waitFor(() => expect(store.read().draft).toBeUndefined());
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        expect(screen.getByLabelText("Blueprint JSON")).toHaveValue("unfinished JSON");
    });

    it("does not offer a late profile read after an edit or explicit source opening", async () => {
        const saved = store.replace({version: null, draft: {blueprint: retained}})!;
        const waiting = deferred<Awaited<ReturnType<FetchLike>>>();
        const base = api();
        const fetchImpl: FetchLike = (url, init) => url === endpoint && init?.method !== "POST" ? waiting.promise : base.fetchImpl(url, init);
        const mounted = renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Newer edit"}});
        fireEvent.blur(screen.getByLabelText("Game name"));
        await act(async () => {
            waiting.resolve(response(saved));
            await waiting.promise;
        });
        await waitFor(() => expect(store.read().draft?.blueprint.manifest).toMatchObject({name: "Newer edit"}));
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(screen.getByLabelText("Game name")).toHaveValue("Newer edit");
        mounted.unmount();
        window.sessionStorage.clear();
        renderWithProviders(<BlueprintEditorPage guided initialPath="/games/explicit.json" />, {fetchImpl: base.fetchImpl});
        await waitFor(() => expect(base.calls.some(call => call.url.endsWith("/load"))).toBe(true));
        expect(screen.queryByRole("button", {name: "Restore", exact: true})).not.toBeInTheDocument();
        expect(screen.getByLabelText("Game name")).toHaveValue("Starter Slot");
        await waitFor(() => expect(store.read().draft?.blueprint.manifest).toMatchObject({name: "Starter Slot"}));
    });

    it("keeps editing usable and reports unavailable profile persistence", async () => {
        const base = api();
        let offline = true;
        const fetchImpl: FetchLike = (url, init) => url === endpoint && offline ? Promise.resolve(response({error: "offline"}, 503)) : base.fetchImpl(url, init);
        renderWithProviders(<BlueprintEditorPage guided />, {fetchImpl});
        expect(await screen.findByText(/Draft recovery is unavailable/)).toHaveTextContent("Could not read");
        fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Local edit"}});
        fireEvent.blur(screen.getByLabelText("Game name"));
        await waitFor(() => expect(loadPersistedBlueprintDraft()?.blueprint.manifest).toMatchObject({name: "Local edit"}));
        expect(fs.existsSync(file)).toBe(false);
        // A subsequent edit retries the failed read; success must retire the unavailable status.
        await act(async () => {
            await Promise.resolve();
        });
        offline = false;
        fireEvent.change(screen.getByLabelText("Game name"), {target: {value: "Connected again"}});
        fireEvent.blur(screen.getByLabelText("Game name"));
        await waitFor(() => expect(store.read().draft?.blueprint.manifest).toMatchObject({name: "Connected again"}));
        expect(screen.queryByText(/Draft recovery is unavailable/)).not.toBeInTheDocument();
    });

    it("serializes captured edits -> clear -> later edits and does not resurrect the cleared document", async () => {
        const waiting = deferred<Awaited<ReturnType<FetchLike>>>();
        const base = api();
        let firstWrite = true;
        const writes: StudioBlueprintDraftSnapshot[] = [];
        const fetchImpl: FetchLike = async (url, init) => {
            if (url === endpoint && init?.method === "POST") {
                writes.push(JSON.parse(init.body!));
                if (firstWrite) {
                    firstWrite = false;
                    await waiting.promise;
                }
            }
            return base.fetchImpl(url, init);
        };
        const errors = jest.fn();
        const persistence = new BlueprintDraftPersistence(fetchImpl, errors);
        await persistence.recover();
        const mutable = {name: "first"};
        const saved = persistence.save(mutable);
        mutable.name = "changed after request";
        const cleared = persistence.clear();
        const edited = persistence.save({name: "second"});
        waiting.resolve(response({}));
        await Promise.all([saved, cleared, edited]);
        expect(writes.map(value => value.draft?.blueprint)).toEqual([{name: "first"}, undefined, {name: "second"}]);
        expect(store.read().draft?.blueprint).toEqual({name: "second"});
        expect(errors).not.toHaveBeenCalled();
    });

    it("prevents an old editor from overwriting/clearing another editor and allows fresh explicit recovery", async () => {
        const errors = jest.fn();
        const {fetchImpl} = api();
        const first = new BlueprintDraftPersistence(fetchImpl, errors);
        const second = new BlueprintDraftPersistence(fetchImpl, errors);
        await Promise.all([first.recover(), second.recover()]);
        await second.save(retained);
        const saved = store.read();
        await first.save({name: "stale"});
        await first.clear();
        await first.save({name: "still stale"});
        expect(store.read()).toEqual(saved);
        expect(errors).toHaveBeenCalledTimes(3);
        expect(String(errors.mock.calls[0][0])).toContain("changed in another editor");
        const fresh = new BlueprintDraftPersistence(fetchImpl, errors);
        expect(await fresh.recover()).toEqual({blueprint: retained});
        await fresh.save(retained);
        await fresh.save({name: "continued"});
        expect(store.read().draft?.blueprint).toEqual({name: "continued"});
    });

    it("rejects the same malformed envelope through the browser reader, diagnoses bad saves, then accepts repeated repair", async () => {
        const malformed = {version: null, draft: {blueprint: []}};
        const base = api();
        let corrupt = true;
        const fetchImpl: FetchLike = (url, init) => corrupt && init?.method !== "POST" ? Promise.resolve(response(malformed)) : base.fetchImpl(url, init);
        const errors = jest.fn();
        const persistence = new BlueprintDraftPersistence(fetchImpl, errors);
        await expect(persistence.recover()).rejects.toThrow('"draft.blueprint" must be a JSON object.');
        await persistence.save([]);
        expect(String(errors.mock.calls[0][0])).toContain('"draft.blueprint" must be a JSON object.');
        expect(fs.existsSync(file)).toBe(false);
        expect(loadPersistedBlueprintDraft()).toBeUndefined();
        corrupt = false;
        await persistence.save(retained);
        await persistence.save({name: "repaired again"});
        expect(store.read().draft?.blueprint).toEqual({name: "repaired again"});
    });
});
