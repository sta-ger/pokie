import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import {GameModelSections} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameModelPreviewPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/GameModelPreviewPanel";
import collectionExample from "../../../../../../examples/blueprints/bounded-collection.blueprint.json";
import combinedExample from "../../../../../../examples/blueprints/bounded-cascade-respins-collection.blueprint.json";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";

const combined = combinedExample as GameBlueprint;
const collection = collectionExample as GameBlueprint;
const empty = "No mechanics/features configured.";

function expectRules(blueprint: GameBlueprint): void {
    expect(screen.queryByText(empty)).toBeNull();
    const {cascade, respins, collection: rule} = blueprint.mechanics!;
    if (cascade) expect(screen.getByText(`Cascade: maximum ${cascade.maxCascades} winning removals; a terminal losing evaluation completes the cascade. A further win rejects and rolls back the subround.`)).toBeVisible();
    else expect(screen.queryByText(/^Cascade:/)).toBeNull();
    if (respins) expect(screen.getByText(`Respins: trigger symbol ${respins.trigger.symbolId}, minimum count ${respins.trigger.minimumCount}; grant ${respins.grant}; retrigger ${respins.retrigger}; maximum executed respins ${respins.maxRespins}.`)).toBeVisible();
    else expect(screen.queryByText(/^Respins:/)).toBeNull();
    if (rule) expect(screen.getByText(`Collection: symbol ${rule.symbolId}; contribution ${rule.contribution} per symbol; threshold ${rule.threshold}; cap ${rule.cap}; reset ${rule.reset}; payout ${rule.payout}.`)).toBeVisible();
    else expect(screen.queryByText(/^Collection:/)).toBeNull();
}

it.each([1, 2, 3, 4, 5, 6, 7])("renders the authored rules for bounded combination %i from the production projection", mask => {
    const keys = ["cascade", "respins", "collection"] as const;
    const blueprint: GameBlueprint = {...combined, mechanics: Object.fromEntries(keys.filter((_, i) => mask & (1 << i)).map(key => [key, combined.mechanics![key]]))};
    expect(new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error")).toEqual([]);
    const before = JSON.stringify(blueprint);
    render(<GameModelSections projection={buildGameModelProjection(blueprint)} />, {wrapper: MantineProvider});
    expectRules(blueprint);
    expect(JSON.stringify(blueprint)).toBe(before);
});

it("keeps empty, unavailable and populated projections distinct through repeated inspection", () => {
    const noRules = {...collection, mechanics: {}};
    const {rerender} = render(<GameModelSections projection={buildGameModelProjection(noRules)} />, {wrapper: MantineProvider});
    expect(screen.getByText(empty)).toBeVisible();
    const projection = buildGameModelProjection(collection);
    rerender(<GameModelSections projection={projection} />);
    expectRules(collection);
    rerender(<GameModelSections projection={{...projection, mechanics: {status: "unavailable", reason: "Unsupported package mechanic"}}} />);
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("Unsupported package mechanic")).toBeVisible();
    expect(screen.queryByText(/^Collection:/)).toBeNull();
    expect(screen.queryByText(empty)).toBeNull();
    const zero: GameBlueprint = {...combined, mechanics: {
        respins: {...combined.mechanics!.respins!, retrigger: "none"},
        collection: {...collection.mechanics!.collection!, contribution: 0, payout: 0, reset: "zero"},
    }};
    for (const blueprint of [zero, collection, noRules, combined]) {
        rerender(<GameModelSections projection={buildGameModelProjection(blueprint)} />);
        if (blueprint === noRules) expect(screen.getByText(empty)).toBeVisible();
        else expectRules(blueprint);
    }
});

it("shows collection details through the public Project Game Model route", async () => {
    const {fetchImpl} = createRoutedFakeFetch({
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/collection", game: collection.manifest, type: "blueprint", capabilities: ["blueprint.build"]}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/collection", valid: true}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/gameModel": () => ({ok: true, status: 200, body: buildGameModelProjection(collection)}),
    });
    renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
    fireEvent.click(await screen.findByRole("button", {name: "Game Model"}));
    await screen.findByText(/^Collection:/);
    expectRules(collection);
    expect(within(screen.getByText("Mechanics").closest("fieldset")!).getByRole("button", {name: "Edit"})).toBeEnabled();
});

it("refreshes the Project Game Model through valid, malformed and repaired rules without stale or unsafe rendering", async () => {
    let source: GameBlueprint = combined;
    const reads: GameBlueprint[] = [];
    const {fetchImpl} = createRoutedFakeFetch({
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/bounded", game: combined.manifest, type: "blueprint", capabilities: ["blueprint.build"]}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/bounded", valid: true}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/gameModel": () => {
            reads.push(source);
            return {ok: true, status: 200, body: buildGameModelProjection(source)};
        },
    });
    renderRoutedApp({fetchImpl, initialEntries: ["/project/gameModel"]});
    await screen.findByText(/^Collection:/);
    expectRules(combined);
    const malformedRules = [{respins: {grant: 2}}, {cascade: {maxCascades: {invalid: true}}}, {collection: {...collection.mechanics!.collection, reset: {invalid: true}}}];
    for (const mechanics of malformedRules) {
        source = {...combined, mechanics} as GameBlueprint;
        const before = JSON.stringify(source);
        fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("These mechanics can't be previewed yet.");
        expect(screen.getByText(`Id: ${combined.manifest.id}`)).toBeVisible();
        expect(screen.queryByText(empty)).toBeNull();
        expect(screen.queryByText(/^Collection:/)).toBeNull();
        expect(JSON.stringify(source)).toBe(before);
        for (let reuse = 0; reuse < 2; reuse++) {
            source = combined;
            await waitFor(() => expect(screen.getByRole("button", {name: "Refresh"})).toBeEnabled());
            fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
            await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
            expectRules(combined);
        }
    }
    expect(reads).toHaveLength(10);
});

it("previews the same combined rules through the editor API without saving", async () => {
    const requests: string[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        requests.push(url);
        if (url === "/api/project/symbol-artwork") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({artwork: {}})});
        if (url !== "/api/home/blueprints/game-model-preview") throw new Error(`Unexpected request: ${url}`);
        const blueprint = JSON.parse(init!.body!).blueprint as GameBlueprint;
        expect(blueprint).toEqual(combined);
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(buildGameModelProjection(blueprint))});
    };
    renderWithProviders(<GameModelPreviewPanel blueprint={combined} />, {fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
    await screen.findByText(/^Collection:/);
    expectRules(combined);
    expect(requests.filter(url => url !== "/api/project/symbol-artwork")).toEqual(["/api/home/blueprints/game-model-preview"]);
});
