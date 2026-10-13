import {renameSymbol} from "../../../../../../cli/studio-client/src/domain/blueprintFormOps";
import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {createMemoryRouter, RouterProvider} from "react-router-dom";
import {GameModelTab} from "../../../../../../cli/studio-client/src/components/project/GameModelTab";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";
import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {useState} from "react";
import {saveBlueprint, type FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {ReelGenerationModeSelector} from "../../../../../../cli/studio-client/src/components/blueprintEditor/ReelGenerationModeSelector";
import {useBlueprintEditor} from "../../../../../../cli/studio-client/src/hooks/useBlueprintEditor";
import {useStudioApi, StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {validateBlueprintReelSequences} from "../../../../../../src/generated/validateBlueprintReelSequences";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

const original = {
    manifest: {id: "test", name: "Test", version: "1"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {},
    reelSequences: [
        {
            type: "weighted",
            variants: [
                {id: "a", weight: 0.25, symbols: ["A", "A"]},
                {id: "b", weight: 0.75, symbols: ["B", "B"]},
            ],
        },
        {type: "exact", symbols: ["A", "B"]},
    ],
};
let source: string;
function response(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}
const fetchImpl: FetchLike = (_url, init) => {
    const url = String(_url),
        body = JSON.parse(String(init?.body ?? "{}")) as {blueprint: Record<string, unknown>};
    if (url.endsWith("/validate")) {
        const errors = validateBlueprintReelSequences(body.blueprint).map((message) => ({
            code: "blueprint-reel-sequences-invalid",
            severity: "error",
            message,
        }));
        return response(errors.length ? {status: "invalid", errors, warnings: []} : {status: "ok", warnings: []});
    }
    if (url.endsWith("/game-model-preview")) return response({});
    if (url.endsWith("/save")) {
        source = JSON.stringify(body.blueprint);
        return response({status: "ok", path: "model.json", blueprintHash: "saved"});
    }
    throw new Error(`Unexpected request ${url}`);
};
function Editor({initial = original}: {initial?: Record<string, unknown>}) {
    const editor = useBlueprintEditor(initial);
    const fetch = useStudioApi();
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    return (
        <>
            <ReelGenerationModeSelector
                key={editor.formGeneration}
                blueprint={editor.state.blueprint}
                mutate={editor.mutate}
                drafts={editor.drafts}
                modeDrafts={editor.modeDrafts}
                revision={editor.state.revision}
                onDirtyChange={setDirty}
            />
            <button
                disabled={dirty}
                onClick={() => {
                    saveBlueprint(fetch, "model.json", editor.getCurrentState().blueprint, true, "loaded").then(() =>
                        setSaved(true),
                    );
                }}
            >
                Save game
            </button>
            <button
                onClick={() =>
                    editor.mutate((blueprint) => {
                        blueprint.manifest = {...(blueprint.manifest as object), name: "Other edit"};
                    })
                }
            >
                Unrelated edit
            </button>
            <button
                onClick={() =>
                    editor.mutate((blueprint) => {
                        renameSymbol(blueprint, "A", "Renamed");
                    })
                }
            >
                Rename symbol
            </button>
            <button onClick={() => editor.loadFrom(original)}>Replace model</button>
            {saved && <span>Saved source</span>}
            <output aria-label="applied draft">{JSON.stringify(editor.state.blueprint)}</output>
        </>
    );
}
function change(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), {target: {value}});
}
async function preview() {
    fireEvent.click(screen.getByRole("button", {name: "Preview whole sequences"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeEnabled());
}
beforeEach(() => {
    source = JSON.stringify(original);
});
it("renders add/edit/remove, retains drafts across rerenders, previews complete definitions and explicitly Applies then Saves", async () => {
    renderWithProviders(<Editor />, {fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: "Add variant"}));
    change("Variant 3 ID", "Case");
    change("Variant 3 relative weight", "0");
    change("Variant 3 ordered symbols (one per line)", "A\nB");
    change("Variant 1 relative weight", "1e308");
    change("Variant 2 relative weight", "1e308");
    fireEvent.click(screen.getByRole("button", {name: "Unrelated edit"}));
    expect(screen.getByLabelText("Variant 3 ID")).toHaveValue("Case");
    expect(source).toBe(JSON.stringify(original));
    expect(screen.getByRole("button", {name: "Save game"})).toBeDisabled();
    await preview();
    expect(screen.getByText(/Variant inspection only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Remove variant 3"}));
    expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeDisabled();
    await preview();
    fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
    expect(source).toBe(JSON.stringify(original));
    fireEvent.click(screen.getByRole("button", {name: "Save game"}));
    await screen.findByText("Saved source");
    expect(JSON.parse(source).reelSequences[0].variants).toEqual([
        {id: "a", weight: 1e308, symbols: ["A", "A"]},
        {id: "b", weight: 1e308, symbols: ["B", "B"]},
    ]);
    expect(JSON.parse(source).reelSequences[1]).toEqual(original.reelSequences[1]);
});
it("refreshes a clean inspection draft after an applied symbol rename without inventing unapplied changes", async () => {
    renderWithProviders(<Editor />, {fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: "Rename symbol"}));
    await waitFor(() =>
        expect(screen.getByLabelText("Variant 1 ordered symbols (one per line)")).toHaveValue("Renamed\nRenamed"),
    );
    expect(screen.getByRole("button", {name: "Save game"})).toBeEnabled();
    expect(source).toBe(JSON.stringify(original));
});
it.each([
    "all zero",
    "negative",
    "nonfinite",
    "empty",
    "unknown symbol",
    "unequal lengths",
    "duplicate ID",
    "duplicate array",
    "empty variants",
    "ambiguous source",
])("rejects canonical invalid %s and protects authored source", (kind) => {
    const initial = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    if (kind === "empty variants") (initial.reelSequences as {variants: unknown[]}[])[0].variants = [];
    if (kind === "ambiguous source") initial.reelStrips = [["A"], ["A"]];
    renderWithProviders(<Editor initial={initial} />, {fetchImpl});
    if (kind === "all zero") {
        change("Variant 1 relative weight", "0");
        change("Variant 2 relative weight", "0");
    }
    if (kind === "negative") change("Variant 1 relative weight", "-1");
    if (kind === "nonfinite") change("Variant 1 relative weight", "Infinity");
    if (kind === "empty") change("Variant 1 ordered symbols (one per line)", "");
    if (kind === "unknown symbol") change("Variant 1 ordered symbols (one per line)", "Missing\nA");
    if (kind === "unequal lengths") change("Variant 1 ordered symbols (one per line)", "A");
    if (kind === "duplicate ID") change("Variant 1 ID", "b");
    if (kind === "duplicate array") change("Variant 1 ordered symbols (one per line)", "B\nB");
    expect(screen.getByText("Invalid whole sequences")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Preview whole sequences"})).toBeDisabled();
    expect(source).toBe(JSON.stringify(original));
});
it("cancel discards local edits; edits after preview invalidate Apply", async () => {
    renderWithProviders(<Editor />, {fetchImpl});
    change("Variant 1 ID", "Changed");
    await preview();
    change("Variant 1 ID", "Changed again");
    expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Cancel sequence changes"}));
    expect(screen.getByLabelText("Variant 1 ID")).toHaveValue("a");
    expect(screen.getByLabelText("applied draft")).toHaveTextContent(JSON.stringify(original));
    expect(source).toBe(JSON.stringify(original));
});
it.each(["edit", "cancel", "replace", "unmount"])(
    "ignores asynchronous preview after %s and releases local busy state",
    async (action) => {
        let resolve: (value: {ok: boolean; status: number; json: () => Promise<unknown>}) => void = () => undefined;
        const delayed: FetchLike = (url, init) =>
            String(url).endsWith("/validate")
                ? new Promise((done) => {
                    resolve = done;
                })
                : fetchImpl(url, init);
        const rendered = renderWithProviders(<Editor />, {fetchImpl: delayed});
        change("Variant 1 ID", "Changed");
        fireEvent.click(screen.getByRole("button", {name: "Preview whole sequences"}));
        if (action === "edit") change("Variant 1 ID", "newer");
        if (action === "cancel") fireEvent.click(screen.getByRole("button", {name: "Cancel sequence changes"}));
        if (action === "replace") fireEvent.click(screen.getByRole("button", {name: "Replace model"}));
        if (action === "unmount") rendered.unmount();
        await act(async () => {
            resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", warnings: []})});
            await Promise.resolve();
        });
        if (action !== "unmount") {
            expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeDisabled();
            expect(screen.getByRole("button", {name: "Preview whole sequences"})).toBeEnabled();
        }
        expect(source).toBe(JSON.stringify(original));
    },
);

it("Project Reels Apply works, Save uses expectedHash and retains local edits made during a pending save", async () => {
    let finish: (value: {ok: boolean; status: number; json: () => Promise<unknown>}) => void = () => undefined;
    let savedBody: {blueprint: typeof original; expectedHash: string} | undefined;
    const projectFetch: FetchLike = (url, init) => {
        if (String(url).includes("/api/project/gameModel")) return response(buildGameModelProjection(original as GameBlueprint));
        if (String(url).endsWith("/load")) return response({status: "ok", path: "model.json", blueprint: original, blueprintHash: "loaded-version"});
        if (String(url).endsWith("/save")) {
            savedBody = JSON.parse(String(init?.body));
            return new Promise((done) => {
                finish = done;
            });
        }
        return fetchImpl(url, init);
    };
    const router = createMemoryRouter(
        [{path: "/project/gameModel", element: <GameModelTab editable projectRoot="model.json" />}],
        {initialEntries: ["/project/gameModel"]},
    );
    render(
        <MantineProvider>
            <StudioApiProvider fetchImpl={projectFetch}>
                <ModalsProvider>
                    <RouterProvider router={router} />
                </ModalsProvider>
            </StudioApiProvider>
        </MantineProvider>,
    );
    const reelSection = await screen.findByRole("group", {name: /^Reels/});
    fireEvent.click(within(reelSection).getByRole("button", {name: "Edit"}));
    await screen.findByLabelText("Variant 1 ID");
    change("Variant 1 ID", "applied");
    await preview();
    fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
    await waitFor(() => expect(within(reelSection).getByRole("button", {name: "Save"})).toBeEnabled());
    fireEvent.click(within(reelSection).getByRole("button", {name: "Save"}));
    await waitFor(() => expect(savedBody?.expectedHash).toBe("loaded-version"));
    expect(savedBody?.blueprint.reelSequences[0].variants?.[0].id).toBe("applied");
    change("Variant 1 ID", "concurrent");
    await act(async () => {
        finish({
            ok: true,
            status: 200,
            json: () => Promise.resolve({status: "ok", path: "model.json", blueprintHash: "new-version"}),
        });
        await Promise.resolve();
    });
    expect(screen.getByLabelText("Variant 1 ID")).toHaveValue("concurrent");
    expect(within(reelSection).getByRole("button", {name: "Save"})).toBeDisabled();
    expect(source).toBe(JSON.stringify(original));
});
