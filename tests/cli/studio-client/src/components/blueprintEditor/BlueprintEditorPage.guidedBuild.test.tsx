import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import userEvent from "@testing-library/user-event";
import {BlueprintEditorPage} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";

const recoveredBlueprint = {...createRecommendedBlueprint(), manifest: {id: "recovered-b", name: "Recovered B", version: "1.0.0"}};
const recoveryRequest = {blueprint: recoveredBlueprint, sourcePath: "/games/B.json", destinationPath: "/games/B-package"};

function RecoveryHarness({initialPath}: {initialPath?: string}) {
    const [request, setRequest] = useState<Readonly<Record<string, unknown>>>();
    return <>
        <button onClick={() => setRequest({...recoveryRequest})}>Recover B</button>
        <BlueprintEditorPage guided initialPath={initialPath} recoveryRequest={request} initialBuildOutDir={request === undefined ? undefined : "/games/B-package"} />
    </>;
}

async function replaceDraft(replacement: string, user: ReturnType<typeof userEvent.setup>): Promise<void> {
    if (replacement === "Recover") {
        await user.click(screen.getByRole("button", {name: "Recover B"}));
    } else if (replacement === "Load") {
        fireEvent.change(screen.getByLabelText("Load from path"), {target: {value: "/games/B.json"}});
        await user.click(screen.getByRole("button", {name: "Load", exact: true}));
    } else {
        await user.click(screen.getByRole("button", {name: "Choose a different start", exact: true}));
        await user.click(await screen.findByRole("button", {name: "Use the starter game"}));
    }
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
    it.each([[1100, 800], [900, 700], [390, 844]])("keeps native Output directory focus visible after expanded Home layout moves at %sx%s", async (width, height) => {
        const user = userEvent.setup();
        const layout = jobFocusLayout();
        const originalWidth = window.innerWidth;
        const originalHeight = window.innerHeight;
        Object.assign(window, {innerWidth: width, innerHeight: height});
        const {fetchImpl, calls} = validRoutes();
        const view = renderWithProviders(<><button>Outside Design</button><BlueprintEditorPage guided /></>, {fetchImpl});
        try {
            await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
            const output = screen.getByLabelText("Output directory (optional)");
            const region = output.closest(".studio-design-editor") as HTMLElement;
            const bounds = layout.place(output, 100);
            try {
                // Use the actual editor's native tab order, without programmatic focus.
                for (let tabs = 0; document.activeElement !== output && tabs < 100; tabs++) await user.tab();
                expect(output).toHaveFocus();
                await layout.expand(region);
                layout.scroll.mockClear();
                // The earlier advanced section grows after native Tab already scrolled.
                bounds.moveTo(height + 100);
                await layout.expand(region);
                expect(layout.scroll).toHaveBeenCalledTimes(1);
                expect(layout.scroll.mock.instances[0]).toBe(output);
                expect(layout.scroll).toHaveBeenCalledWith({block: "nearest", inline: "nearest", behavior: "instant"});
                expect(output).toHaveFocus();
                bounds.moveTo(100);
                layout.scroll.mockClear();
                await layout.expand(region);
                expect(layout.scroll).not.toHaveBeenCalled();
                await user.click(screen.getByRole("button", {name: "Outside Design"}));
                bounds.moveTo(height + 100);
                await layout.expand(region);
                expect(layout.scroll).not.toHaveBeenCalled();
                expect(screen.getByRole("button", {name: "Outside Design"})).toHaveFocus();
                expect(calls.some(call => call.url === "/api/home/blueprints/build" || call.url === "/api/home/blueprints/build-preview")).toBe(false);
                view.unmount();
                expect(layout.observing(region)).toBe(false);
            } finally {
                bounds.restore();
            }
        } finally {
            view.unmount();
            layout.restore();
            Object.assign(window, {innerWidth: originalWidth, innerHeight: originalHeight});
        }
    });

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

    it.each(["Recover", "New", "Load"])("isolates delayed preview and submitted build responses across %s replacement", async (replacement) => {
        const user = userEvent.setup();
        const original = createRecommendedBlueprint();
        const manifest = original.manifest;
        const preview = {status: "ok", manifest, warnings: [], reels: 3, rows: 3, symbolsCount: 2, blueprintHash: "A", expectedFiles: ["package.json"], projectRoot: "/games/A-package", destinationHasContent: false, createFiles: ["package.json"], updateFiles: [], deleteFiles: []};
        const built = {status: "ok", manifest, warnings: [], projectRoot: "/games/A-package", createdFiles: ["package.json"], buildInfo: {schemaVersion: 1, generatedBy: "pokie build", pokieVersion: "1.0.0", generatedAt: "2026-01-01T00:00:00.000Z", blueprintHash: "A", game: manifest}, unchanged: false};
        const base = createRoutedFakeFetch({
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/B.json", blueprint: recoveredBlueprint, blueprintHash: "B"}}),
            "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "unchanged", blueprintHash: "B"}}),
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: preview}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: built}),
        });
        const responses: Array<(body: unknown) => void> = [];
        const fetchImpl: typeof base.fetchImpl = (url, init) => base.fetchImpl(url, init).then((response) => url === "/api/home/blueprints/build" || url === "/api/home/blueprints/build-preview"
            ? {...response, json: () => new Promise((resolve) => {
                responses.push(resolve);
            })}
            : response);
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        // Two checks are outstanding: the explicit preview and Build's fallback.
        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(responses).toHaveLength(2));
        // The fallback authorizes one durable publication, leaving the advisory preview pending.
        await act(async () => {
            responses[1](preview);
            await Promise.resolve();
        });
        await waitFor(() => expect(responses).toHaveLength(3));
        await replaceDraft(replacement, user);
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        const validationsBefore = base.calls.filter((call) => call.url === "/api/home/blueprints/validate").length;
        await act(async () => {
            responses[0](preview);
            responses[2](built);
            await Promise.resolve();
        });
        expect(screen.queryByText(/Last built/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Restore built blueprint"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Discard unbuilt changes"})).not.toBeInTheDocument();
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue(replacement === "Recover" ? "/games/B-package" : "");
        expect(screen.getByLabelText("Game name")).toHaveValue(replacement === "New" ? manifest.name : "Recovered B");
        expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled();
        expect(base.calls.filter((call) => call.url === "/api/home/blueprints/validate")).toHaveLength(validationsBefore);
        expect(base.calls.filter((call) => call.url === "/api/home/blueprints/build")).toHaveLength(1);
        expect(base.calls.some((call) => call.url.includes("cancel"))).toBe(false);
    });

    it.each(["Recover", "New", "Load"])("does not submit A when its fallback preview settles after %s replacement", async (replacement) => {
        const user = userEvent.setup();
        const base = createRoutedFakeFetch({
            "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/B.json", blueprint: recoveredBlueprint, blueprintHash: "B"}}),
            "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
            "/api/home/blueprints/check-source": () => ({ok: true, status: 200, body: {status: "unchanged", blueprintHash: "B"}}),
            "/api/home/blueprints/build": () => ({ok: true, status: 200, body: {status: "error", error: "Stale build submitted"}}),
        });
        let finish!: (body: unknown) => void;
        const fetchImpl: typeof base.fetchImpl = (url, init) => url === "/api/home/blueprints/build-preview"
            ? Promise.resolve({ok: true, status: 200, json: () => new Promise((resolve) => {
                finish = resolve;
            })})
            : base.fetchImpl(url, init);
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Build Package"}));
        await waitFor(() => expect(finish).toBeDefined());
        await replaceDraft(replacement, user);
        await waitFor(() => expect(screen.getByRole("button", {name: "Build Package"})).toBeEnabled());
        await act(async () => {
            finish({status: "ok", manifest: createRecommendedBlueprint().manifest, warnings: [], projectRoot: "/games/A-package", destinationHasContent: false, expectedFiles: [], createFiles: [], updateFiles: [], deleteFiles: []});
            await Promise.resolve();
        });
        expect(base.calls.some((call) => call.url === "/api/home/blueprints/build")).toBe(false);
        expect(screen.getByLabelText("Output directory (optional)")).toHaveValue(replacement === "Recover" ? "/games/B-package" : "");
    });

    it.each(["Recover", "Load"])("cancels an unsubmitted guided save on %s and leaves both save actions usable", async (replacement) => {
        const user = userEvent.setup();
        const base = validRoutes();
        let finishLoad!: (body: unknown) => void;
        let finishSave: ((body: unknown) => void) | undefined;
        const fetchImpl: typeof base.fetchImpl = (url, init) => {
            if (url === "/api/home/blueprints/load") return Promise.resolve({ok: true, status: 200, json: () => new Promise((resolve) => {
                finishLoad = resolve;
            })});
            if (url === "/api/home/blueprints/check-source") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "unchanged", blueprintHash: "B"})});
            return base.fetchImpl(url, init).then((response) => url === "/api/home/blueprints/save" && JSON.parse(init?.body ?? "{}").path === "/games/explicit-B.json" && finishSave === undefined
                ? {...response, json: () => new Promise((resolve) => {
                    finishSave = resolve;
                })}
                : response);
        };
        const view = renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        if (replacement === "Load") {
            fireEvent.change(screen.getByLabelText("Load from path"), {target: {value: "/games/B.json"}});
            await user.click(screen.getByRole("button", {name: "Load", exact: true}));
            await waitFor(() => expect(finishLoad).toBeDefined());
        }
        jest.useFakeTimers();
        try {
            fireEvent.click(screen.getByRole("button", {name: "Create game"}));
            if (replacement === "Recover") fireEvent.click(screen.getByRole("button", {name: "Recover B"}));
            else await act(async () => {
                finishLoad({status: "ok", path: "/games/B.json", blueprint: recoveredBlueprint, blueprintHash: "B"});
                await Promise.resolve();
            });
            await act(async () => {
                jest.advanceTimersByTime(0);
                await Promise.resolve();
            });
            expect(base.calls.filter((call) => call.url.includes("/save"))).toHaveLength(0);
            await act(async () => {
                jest.advanceTimersByTime(600);
                await Promise.resolve();
            });
            const primary = screen.getByRole("button", {name: replacement === "Load" ? "Save game" : "Create game"});
            expect(primary).toBeEnabled();
            fireEvent.click(primary);
            await act(async () => {
                jest.advanceTimersByTime(1);
                await Promise.resolve();
            });
            const saves = base.calls.filter((call) => call.url.includes("/save"));
            expect(saves).toHaveLength(1);
            expect(JSON.parse(saves[0].init!.body!).blueprint).toEqual(recoveredBlueprint);
            fireEvent.change(screen.getByLabelText("Save to path"), {target: {value: "/games/explicit-B.json"}});
            await act(async () => {
                fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
                await Promise.resolve();
            });
            expect(base.calls.filter((call) => call.url.includes("/save"))).toHaveLength(2);
            expect(finishSave).toBeDefined();
            // The cancelled timer must not retain a reference that can unlock this real Save.
            fireEvent.click(screen.getByRole("button", {name: "Recover B"}));
            const confirmation = screen.queryByRole("button", {name: "Confirm", exact: true});
            if (confirmation) fireEvent.click(confirmation);
            await act(async () => {
                jest.advanceTimersByTime(600);
                await Promise.resolve();
            });
            fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
            fireEvent.click(screen.getByRole("button", {name: "Create game"}));
            await act(async () => {
                jest.advanceTimersByTime(1);
                await Promise.resolve();
            });
            expect(base.calls.filter((call) => call.url.includes("/save"))).toHaveLength(2);
            await act(async () => {
                finishSave?.({status: "error", error: "Old save failed"});
                await Promise.resolve();
            });
            await act(async () => {
                fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
                await Promise.resolve();
            });
            expect(base.calls.filter((call) => call.url.includes("/save"))).toHaveLength(3);
            expect(screen.queryByText(/Old save failed/)).not.toBeInTheDocument();
        } finally {
            view.unmount();
            jest.useRealTimers();
        }
    });

    it.each(["save", "save-managed"])("keeps a submitted %s guarded across repeated replacement until that request settles", async (operation) => {
        const user = userEvent.setup();
        const base = validRoutes();
        let finish!: (body: unknown) => void;
        let submitted = 0;
        const fetchImpl: typeof base.fetchImpl = (url, init) => {
            if (url === `/api/home/blueprints/${operation}`) {
                submitted += 1;
                if (submitted === 1) return Promise.resolve({ok: true, status: 200, json: () => new Promise((resolve) => {
                    finish = resolve;
                })});
            }
            return base.fetchImpl(url, init);
        };
        renderWithProviders(<RecoveryHarness />, {fetchImpl});
        await user.click(screen.getByRole("button", {name: "Show advanced options (file and JSON tools)"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        if (operation === "save") fireEvent.change(screen.getByLabelText("Save to path"), {target: {value: "/games/A.json"}});
        await user.click(screen.getByRole("button", {name: operation === "save" ? "Save" : "Create game", exact: true}));
        await waitFor(() => expect(finish).toBeDefined());
        for (let i = 0; i < 2; i++) {
            await user.click(screen.getByRole("button", {name: "Recover B"}));
            const confirmation = screen.queryByRole("button", {name: "Confirm", exact: true});
            if (confirmation) await user.click(confirmation);
            await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
            fireEvent.click(screen.getByRole("button", {name: "Create game"}));
            fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
            expect(submitted).toBe(1);
            expect(base.calls.some((call) => call.url === `/api/home/blueprints/${operation === "save" ? "save-managed" : "save"}`)).toBe(false);
        }
        await act(async () => {
            finish({status: "error", error: "A failed"});
            await Promise.resolve();
        });
        await user.click(screen.getByRole("button", {name: operation === "save" ? "Save" : "Create game", exact: true}));
        await waitFor(() => expect(submitted).toBe(2));
        expect(screen.queryByText(/A failed/)).not.toBeInTheDocument();
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
            await user.click(await screen.findByRole("button", {name: "Use the starter game"}));
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
