import {MantineProvider} from "@mantine/core";
import {ModalsProvider} from "@mantine/modals";
import {createMemoryRouter, RouterProvider} from "react-router-dom";
import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {GameModelTab} from "../../../../../../cli/studio-client/src/components/project/GameModelTab";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";
import {useBlueprintEditor} from "../../../../../../cli/studio-client/src/hooks/useBlueprintEditor";
import {ReelGenerationModeSelector} from "../../../../../../cli/studio-client/src/components/blueprintEditor/ReelGenerationModeSelector";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {useState} from "react";
import {HomePage} from "../../../../../../cli/studio-client/src/components/home/HomePage";
import {validateBlueprintReelSequences} from "../../../../../../src/generated/validateBlueprintReelSequences";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";

function response(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body)))});
}
function nativeInput(label: string, value: string) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    input.value = value;
    fireEvent.input(input, {inputType: "insertText"});
    expect(input).toHaveValue(value);
}
async function preview() {
    fireEvent.click(screen.getByRole("button", {name: "Preview whole sequences"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Apply whole sequences"})).toBeEnabled());
}
beforeEach(() => window.sessionStorage.clear());
it.each(["metadata", "coordinated model"])("retains a rejected same-event %s Apply after successful use and reuses the editor twice", async change => {
    const initial = JSON.parse(fs.readFileSync(path.resolve("tests/cli/fixtures/weighted-reels.blueprint.json"), "utf8"));
    const service = new StudioBlueprintService("2.0.0", process.cwd(),
        new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository()));
    let changeSource: () => void = () => undefined;
    const fetch: FetchLike = (url, init) => {
        const {blueprint} = JSON.parse(String(init?.body));
        if (String(url).endsWith("/validate")) return response(service.validate(blueprint));
        if (String(url).endsWith("/game-model-preview")) return response(service.previewGameModel(blueprint));
        throw new Error(`Unexpected request ${url}`);
    };
    function Editor() {
        const editor = useBlueprintEditor(initial);
        const [dirty, setDirty] = useState(false);
        changeSource = () => {
            editor.mutate(next => {
                next.manifest = {...(next.manifest as object), name: "Changed before Apply"};
                if (change === "coordinated model") {
                    next.rows = 2;
                    next.symbols = [...initial.symbols, "Z"];
                    next.reelSequences = [
                        {type: "weighted", variants: [{id: "source-change", weight: 7, symbols: ["Z", "K", "Q", "J", "10", "W", "S"]}]},
                        ...initial.reelSequences.slice(1),
                    ];
                }
            });
        };
        return <>
            <ReelGenerationModeSelector blueprint={editor.state.blueprint} mutate={editor.mutate} revision={editor.state.revision}
                drafts={editor.drafts} modeDrafts={editor.modeDrafts} onDirtyChange={setDirty} />
            <button disabled={dirty}>Save game</button>
            <output aria-label="applied draft">{JSON.stringify(editor.state.blueprint)}</output>
        </>;
    }
    renderWithProviders(<Editor />, {fetchImpl: fetch});
    nativeInput("Variant 1 relative weight", "1.5");
    await preview();
    fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
    expect(JSON.parse(screen.getByLabelText("applied draft").textContent!).reelSequences[0].variants[0].weight).toBe(1.5);
    nativeInput("Variant 1 relative weight", "2");
    await preview();
    // Match a buffered sibling commit and activation in the same React batch:
    // the current event-time source changes before new props can render.
    act(() => {
        changeSource();
        fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
    });
    expect(screen.getByText(/The game design changed after this preview/)).toBeVisible();
    expect(screen.getByLabelText("Variant 1 relative weight")).toHaveValue("2");
    expect(screen.getByRole("button", {name: "Save game"})).toBeDisabled();
    const rejected = JSON.parse(screen.getByLabelText("applied draft").textContent!);
    expect(rejected.reelSequences[0].variants[0]).toMatchObject(change === "metadata"
        ? {weight: 1.5, id: "variant-1"} : {weight: 7, id: "source-change", symbols: ["Z", "K", "Q", "J", "10", "W", "S"]});
    for (const weight of [2, 3]) {
        nativeInput("Variant 1 relative weight", String(weight));
        await preview();
        fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
        expect(JSON.parse(screen.getByLabelText("applied draft").textContent!)).toMatchObject({
            manifest: {name: "Changed before Apply"}, reelSequences: [{variants: [{weight}]}, ...initial.reelSequences.slice(1)],
            rows: change === "metadata" ? initial.rows : 2,
            symbols: change === "metadata" ? initial.symbols : [...initial.symbols, "Z"],
        });
        expect(screen.getByRole("button", {name: "Save game"})).toBeEnabled();
    }
});
it.each(["Home", "Project"])("persists the retained observer's weight 2 through %s Apply, Save and the settled projection", async surface => {
    const bytes = fs.readFileSync(path.resolve("tests/cli/fixtures/weighted-reels.blueprint.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("fe656f0214998f3bc0312b04026a46c8c0a3ffdc2d3e03631d3493e34af5073e");
    const directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/weighted-save-"));
    const target = path.join(directory, "blueprint.json");
    fs.writeFileSync(target, bytes);
    const service = new StudioBlueprintService("2.0.0", path.join(directory, "studio"),
        new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository()));
    const writes: unknown[] = [];
    const fetch: FetchLike = (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const loaded = () => {
            const result = service.load(target);
            if (result.status !== "ok") throw new Error(result.error);
            return result;
        };
        if (String(url).includes("/api/project/gameModel")) return response(service.previewGameModel(loaded().blueprint));
        if (String(url).endsWith("/load")) return response(loaded());
        if (String(url).endsWith("/validate")) return response(service.validate(body.blueprint));
        if (String(url).endsWith("/game-model-preview")) return response(service.previewGameModel(body.blueprint));
        if (String(url).endsWith("/save")) {
            writes.push(body);
            return response(service.save(body.path, body.blueprint, body.overwrite, body.expectedHash));
        }
        if (String(url).endsWith("/open")) return response({context: {mode: "project", projectRoot: target}, manifest: JSON.parse(bytes.toString()).manifest});
        if (String(url).includes("/registry")) return response([]);
        throw new Error(`Unexpected request ${url}`);
    };
    const router = createMemoryRouter([
        {path: "/project/:root/:tab", element: <GameModelTab editable projectRoot={target} />},
        {path: "/home/:tab", element: <HomePage />},
    ], {initialEntries: [surface === "Home"
        ? {pathname: "/home/design", state: {initialBlueprintPath: target}}
        : "/project/model/gameModel"]});
    const view = render(<MantineProvider><StudioApiProvider fetchImpl={fetch}><ModalsProvider><RouterProvider router={router} /></ModalsProvider></StudioApiProvider></MantineProvider>);
    try {
        if (surface === "Project") {
            const section = await screen.findByRole("group", {name: /^Reels/});
            fireEvent.click(within(section).getByRole("button", {name: "Edit"}));
        } else {
            await waitFor(() => expect(screen.getByRole("button", {name: "Save game"})).toBeEnabled());
            fireEvent.click(screen.getByRole("tab", {name: /^Reels/}));
        }
        const save = () => surface === "Home" ? screen.getByRole("button", {name: "Save game"})
            : within(screen.getByRole("group", {name: /^Reels/})).getByRole("button", {name: "Save"});
        await screen.findByLabelText("Variant 1 relative weight");
        nativeInput("Variant 1 relative weight", "0");
        expect(screen.getByText("reelSequences[0].variants: total weight must be positive.")).toBeVisible();
        expect(screen.getByRole("button", {name: "Preview whole sequences"})).toBeDisabled();
        expect(save()).toBeDisabled();
        if (surface === "Home") expect(save()).toHaveAccessibleDescription("Apply or cancel whole-sequence edits before saving.");
        nativeInput("Variant 1 relative weight", "2");
        await preview();
        expect(within(screen.getByRole("group", {name: "Inspected complete definitions"})).getByRole("cell", {name: "2", exact: true})).toBeVisible();
        fireEvent.click(screen.getByRole("button", {name: "Apply whole sequences"}));
        await waitFor(() => expect(save()).toBeEnabled());
        expect(fs.readFileSync(target)).toEqual(bytes);
        fireEvent.click(save());
        await screen.findByLabelText("Reel 1 inspection variant");
        const saved = JSON.parse(fs.readFileSync(target, "utf8"));
        expect(saved.reelSequences[0].variants[0].weight).toBe(2);
        expect(writes).toHaveLength(1);
        await waitFor(() => expect(screen.getByLabelText("Reel 1 inspection variant")).toHaveTextContent("relative weight 2"));
    } finally {
        view.unmount();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("rejects the identical retained zero-weight design at the shared authority and public services, then repairs and reuses them", () => {
    const initial = JSON.parse(fs.readFileSync(path.resolve("tests/cli/fixtures/weighted-reels.blueprint.json"), "utf8"));
    const malformed = JSON.parse(JSON.stringify(initial));
    malformed.reelSequences[0].variants[0].weight = 0;
    const before = JSON.stringify(malformed);
    const diagnostic = "reelSequences[0].variants: total weight must be positive.";
    const directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/weighted-validation-"));
    const target = path.join(directory, "blueprint.json");
    const service = new StudioBlueprintService("2.0.0", path.join(directory, "studio"),
        new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository()));
    try {
        expect(validateBlueprintReelSequences(malformed)).toEqual([diagnostic]);
        expect(new GameBlueprintValidator().validate(malformed)).toContainEqual(expect.objectContaining({
            code: "blueprint-reel-sequences-invalid", severity: "error", message: diagnostic,
        }));
        expect(service.validate(malformed)).toMatchObject({status: "invalid", errors: [expect.objectContaining({message: diagnostic})]});
        expect(service.save(target, malformed, false)).toEqual({status: "error", error: diagnostic});
        expect(service.saveManaged(malformed)).toEqual({status: "error", error: diagnostic});
        expect(fs.existsSync(target)).toBe(false);
        for (const projection of [buildGameModelProjection(malformed as GameBlueprint), service.previewGameModel(malformed)]) {
            if (projection.reels.status !== "available") throw new Error("Expected inspectable authored reels");
            expect(projection.reels.data.reels[0]).toMatchObject({weightedVariants: [{weight: 0}]});
        }
        expect(JSON.stringify(malformed)).toBe(before);
        for (const weight of [2, 3]) {
            malformed.reelSequences[0].variants[0].weight = weight;
            expect(validateBlueprintReelSequences(malformed)).toEqual([]);
            expect(service.validate(malformed).status).toBe("ok");
            expect(service.save(target, malformed, true).status).toBe("ok");
            expect(JSON.parse(fs.readFileSync(target, "utf8")).reelSequences[0].variants[0].weight).toBe(weight);
            expect(service.previewGameModel(malformed).reels).toMatchObject({status: "available"});
        }
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
