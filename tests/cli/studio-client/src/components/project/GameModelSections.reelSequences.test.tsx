import fs from "node:fs";
import path from "node:path";
import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";
import {validateBlueprintReelSequences} from "../../../../../../src/generated/validateBlueprintReelSequences";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {buildProjectGameModel} from "../../../../../../cli/studio/blueprint/buildProjectGameModel";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";
import {createRecommendedBlueprint} from "../../../../../../cli/studio-client/src/domain/blueprintEditorState";
import {GameModelSections} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameModelPreviewPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/GameModelPreviewPanel";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function service(): StudioBlueprintService {
    return new StudioBlueprintService("2.0.0", path.resolve("node_modules/.cache/pokie-tmp/studio-assets"),
        new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository()));
}

// Exact retained recheck input: recommended five-reel design, with the literal
// source removed and variant-1 / relative weight 1 / A,K,Q,J on every reel.
function savedReproducer(): GameBlueprint {
    const blueprint = createRecommendedBlueprint();
    Reflect.deleteProperty(blueprint, "reelStrips");
    return {...blueprint, reelSequences: Array.from({length: 5}, () => ({
        type: "weighted", variants: [{id: "variant-1", weight: 1, symbols: ["A", "K", "Q", "J"]}],
    }))} as GameBlueprint;
}

function mixed(): GameBlueprint {
    return {
        manifest: {id: "mixed", name: "Mixed", version: "1.0.0"},
        reels: 2, rows: 3, symbols: ["A", "K", "Q", "J"], paytable: {}, availableBets: [0.05],
        wilds: ["A"], scatters: ["K"],
        reelSequences: [
            {type: "weighted", variants: [
                {id: "disabled", weight: 0, symbols: ["Q", "Q", "Q", "Q"]},
                {id: "regular", weight: 0.05, symbols: ["A", "K", "Q", "J"]},
                {id: "tiny", weight: 1e-7, symbols: ["J", "Q", "K", "A"]},
            ]},
            {type: "exact", symbols: ["K", "J"]},
        ],
    };
}

function windowRows(): string[][] {
    return within(screen.getByRole("table", {name: "Inspected game window"})).getAllByRole("row")
        .map(row => within(row).getAllByRole("cell").map(cell => cell.textContent!));
}

it("renders the saved five-reel whole-sequence reproducer through the actual project reader without changing source", async () => {
    const directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/v35-weighted-window-"));
    try {
        const api = service();
        const blueprint = savedReproducer();
        const source = path.join(directory, "weighted-recheck.blueprint.json");
        expect(api.validate(blueprint).status).toBe("ok");
        expect(api.save(source, blueprint, false).status).toBe("ok");
        const bytes = fs.readFileSync(source);
        const unused = (): never => {
            throw new Error("Unexpected format reader");
        };
        const projection = await buildProjectGameModel(source, undefined, true, {
            loadBlueprint: filename => api.load(filename), inspectPackage: unused,
            importParWorkbook: unused, readWasmManifest: unused,
        });
        const before = JSON.stringify(projection);
        expect(projection.reels).toMatchObject({status: "available", data: {
            generationMode: "reelSequences", gameWindow: {grid: [[], [], [], [], []]},
        }});
        render(<GameModelSections projection={projection} />, {wrapper: MantineProvider});
        expect(screen.getByText("Generation mode: Whole-sequence variants")).toBeVisible();
        expect(screen.queryByText("No reels configured yet.")).toBeNull();
        expect(screen.getByText(/Inspection only: choose a whole-sequence variant/)).toBeVisible();
        expect(screen.getAllByRole("combobox", {name: /inspection variant/})).toHaveLength(5);
        expect(windowRows()).toEqual([["A", "A", "A", "A", "A"], ["K", "K", "K", "K", "K"], ["Q", "Q", "Q", "Q", "Q"]]);
        fireEvent.click(screen.getByRole("button", {name: "Previous stop"}));
        expect(windowRows()[0]).toEqual(["J", "J", "J", "J", "J"]);
        fireEvent.click(screen.getByRole("button", {name: "Next stop"}));
        expect(windowRows()[0]).toEqual(["A", "A", "A", "A", "A"]);
        for (const tab of ["Full strips", "Analysis"]) {
            fireEvent.click(screen.getByRole("tab", {name: tab}));
            expect(within(screen.getByRole("tabpanel", {name: tab})).getAllByText("variant-1: weight 1; [A, K, Q, J]")).toHaveLength(5);
        }
        expect(JSON.stringify(projection)).toBe(before);
        expect(fs.readFileSync(source)).toEqual(bytes);
        expect(api.load(source)).toMatchObject({status: "ok", blueprint});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("uses the same weighted window in the public draft-preview panel and sends no authoring or execution request", async () => {
    const api = service();
    const writes: string[] = [];
    const blueprint = savedReproducer();
    const before = JSON.stringify(blueprint);
    const fetchImpl: FetchLike = (url, init) => {
        if (init?.method !== "POST") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({artwork: {}})});
        writes.push(url);
        if (url !== "/api/home/blueprints/game-model-preview") throw new Error(`Unexpected mutation: ${url}`);
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(api.previewGameModel(JSON.parse(init.body!).blueprint))});
    };
    renderWithProviders(<GameModelPreviewPanel blueprint={blueprint} />, {fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
    await screen.findByRole("table", {name: "Inspected game window"});
    expect(windowRows()[0]).toEqual(["A", "A", "A", "A", "A"]);
    fireEvent.click(screen.getByRole("button", {name: "Next stop"}));
    expect(windowRows()[0]).toEqual(["K", "K", "K", "K", "K"]);
    expect(writes).toEqual(["/api/home/blueprints/game-model-preview"]);
    expect(JSON.stringify(blueprint)).toBe(before);
});

it("lets the reader inspect positive fractional variants with keyboard controls, preserving exact reels and special symbols", async () => {
    const user = userEvent.setup();
    const blueprint = mixed();
    expect(validateBlueprintReelSequences(blueprint as unknown as Record<string, unknown>)).toEqual([]);
    const projection = buildGameModelProjection(blueprint);
    const before = JSON.stringify(projection);
    render(<GameModelSections projection={projection} />, {wrapper: MantineProvider});
    const choice = screen.getByRole("combobox", {name: "Reel 1 inspection variant"});
    expect(choice).toHaveValue("regular");
    expect(screen.getByRole("option", {name: "disabled (relative weight 0)"})).toBeDisabled();
    expect(screen.queryByLabelText("Reel 2 inspection variant")).toBeNull();
    expect(windowRows()).toEqual([["A", "K"], ["K", "J"], ["Q", "K"]]);
    const table = screen.getByRole("table", {name: "Inspected game window"});
    expect(within(table).getByText("A").closest('[data-variant="filled"]')).not.toBeNull();
    expect(within(table).getByText("Q").closest('[data-variant="outline"]')).not.toBeNull();
    await user.selectOptions(choice, "tiny");
    expect(windowRows()).toEqual([["J", "K"], ["Q", "J"], ["K", "K"]]);
    const next = screen.getByRole("button", {name: "Next stop"});
    next.focus();
    await user.keyboard("{Enter}");
    expect(next).toHaveFocus();
    expect(windowRows()).toEqual([["Q", "J"], ["K", "K"], ["A", "J"]]);
    expect(JSON.stringify(projection)).toBe(before);
});

it("reads current symbols, weights, roles and geometry on coordinated edits and recovers repeatedly from ineligible selections", () => {
    const blueprint = mixed();
    const api = service();
    const view = render(<GameModelSections projection={api.previewGameModel(blueprint)} />, {wrapper: MantineProvider});
    fireEvent.change(screen.getByLabelText("Reel 1 inspection variant"), {target: {value: "tiny"}});
    expect(windowRows()[0][0]).toBe("J");
    const symbolsChanged = mixed();
    const weighted = symbolsChanged.reelSequences![0];
    if (weighted.type !== "weighted") throw new Error("Expected weighted fixture");
    weighted.variants = weighted.variants.map(variant => variant.id === "tiny" ? {...variant, symbols: ["K", "A", "Q", "J"]} : variant);
    view.rerender(<GameModelSections projection={api.previewGameModel(symbolsChanged)} />);
    expect(screen.getByLabelText("Reel 1 inspection variant")).toHaveValue("tiny");
    expect(windowRows()[0][0]).toBe("K");
    const changed: GameBlueprint = {...mixed(), wilds: [], scatters: [], screenGeometry: {
        generated: {reels: 2, rows: 4}, visible: {rowOffset: 1, rows: 3},
        evaluated: {rowOffset: 1, rows: 3}, paylineSpace: "evaluated",
    }, reelSequences: [
        {type: "weighted", variants: [
            {id: "regular", weight: 1, symbols: ["Q", "A", "J", "K"]},
            {id: "tiny", weight: 0, symbols: ["A", "J", "K", "Q"]},
        ]},
        {type: "exact", symbols: ["J", "Q"]},
    ]};
    expect(validateBlueprintReelSequences(changed as unknown as Record<string, unknown>)).toEqual([]);
    view.rerender(<GameModelSections projection={api.previewGameModel(changed)} />);
    expect(screen.getByLabelText("Reel 1 inspection variant")).toHaveValue("regular");
    expect(windowRows()).toEqual([["A", "Q"], ["J", "J"], ["K", "Q"]]);
    expect(within(screen.getByRole("table", {name: "Inspected game window"})).getByText("A").closest('[data-variant="outline"]')).not.toBeNull();
    // The inspection is tolerant of incomplete drafts; shared validation and
    // Save still reject this exact all-zero payload without normalizing it.
    const invalid = {...changed, reelSequences: [{type: "weighted" as const, variants: [{id: "regular", weight: 0, symbols: ["Q", "A", "J", "K"]}]}, changed.reelSequences![1]]};
    expect(validateBlueprintReelSequences(invalid as unknown as Record<string, unknown>)).toEqual(["reelSequences[0].variants: total weight must be positive."]);
    expect(api.validate(invalid).status).toBe("invalid");
    expect(api.save("unused-invalid-weighted-design.json", invalid, false)).toEqual({status: "error", error: "reelSequences[0].variants: total weight must be positive."});
    view.rerender(<GameModelSections projection={api.previewGameModel(invalid)} />);
    expect(screen.getByLabelText("Reel 1 inspection variant")).toBeDisabled();
    expect(screen.getByText(/This reel has no positive-weight variant to inspect/)).toBeVisible();
    expect(screen.queryByText("No reels configured yet.")).toBeNull();
    for (let repeat = 0; repeat < 2; repeat++) {
        view.rerender(<GameModelSections projection={api.previewGameModel(blueprint)} />);
        fireEvent.change(screen.getByLabelText("Reel 1 inspection variant"), {target: {value: "tiny"}});
        expect(windowRows()[0][0]).toBe("J");
        view.rerender(<GameModelSections projection={api.previewGameModel(changed)} />);
        expect(windowRows()[0][0]).toBe("A");
    }
    view.rerender(<GameModelSections projection={api.previewGameModel({...changed, reelSequences: [
        {type: "weighted", variants: [{id: "replacement", weight: 1, symbols: ["J", "K", "Q", "A"]}]}, changed.reelSequences![1],
    ]})} />);
    expect(screen.getByLabelText("Reel 1 inspection variant")).toHaveValue("replacement");
    expect(windowRows()[0][0]).toBe("K");
    expect(invalid.reelSequences[0]).toMatchObject({variants: [{weight: 0}]});
});

it("keeps literal, shared-weight sample, failed-generation, empty and unavailable views distinct", () => {
    const view = render(<GameModelSections projection={buildGameModelProjection(createRecommendedBlueprint() as GameBlueprint)} />, {wrapper: MantineProvider});
    expect(screen.queryByRole("combobox", {name: /inspection variant/})).toBeNull();
    expect(windowRows()).toHaveLength(3);
    const base = {...mixed()};
    Reflect.deleteProperty(base, "reelSequences");
    view.rerender(<GameModelSections projection={buildGameModelProjection({...base, symbolWeights: {A: 1, K: 1, Q: 1, J: 1}})} />);
    expect(screen.getByText(/views below show one reproducible, seeded sample/)).toBeVisible();
    expect(windowRows()).toHaveLength(3);
    view.rerender(<GameModelSections projection={buildGameModelProjection({...base, reelStripGeneration: [
        {type: "generated", length: 2, symbolCounts: {A: 3}, seed: 1},
        {type: "literal", strip: ["K", "J"]},
    ]})} />);
    expect(within(screen.getByRole("tabpanel", {name: "Game window"})).getByText(/This reel couldn't be generated/)).toBeVisible();
    expect(windowRows()[0]).toEqual(["—", "K"]);
    view.rerender(<GameModelSections projection={buildGameModelProjection({...base, reels: 0, reelStrips: []})} />);
    expect(within(screen.getByRole("tabpanel", {name: "Game window"})).getByText("No reels configured yet.")).toBeVisible();
    view.rerender(<GameModelSections projection={buildGameModelProjection(undefined)} />);
    expect(screen.queryByRole("table", {name: "Inspected game window"})).toBeNull();
    expect(screen.queryByText("No reels configured yet.")).toBeNull();
});
