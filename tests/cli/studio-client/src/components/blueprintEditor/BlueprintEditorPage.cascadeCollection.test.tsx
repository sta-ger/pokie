import {AUTHORED_BOUNDED_MECHANIC_CATALOG} from "../../../../../../src/generated/AuthoredMechanicCatalog";
import {boundedBlueprint} from "../../../../../v2/fixtures/BoundedMechanicsGame";
import {fireEvent, screen, waitFor} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";

const initial = {manifest: {id: "bounded", name: "Bounded", version: "1.0.0"}, reels: 3, rows: 1, symbols: ["A", "C"], wilds: [], scatters: [], availableBets: [0.05], paytable: {A: {3: 0}}, reelStrips: [["C"], ["C"], ["C"]]};
function home() {
    const writes = jest.fn();
    const service = new StudioBlueprintService("1.3.0", process.cwd(), new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository()));
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const result = service.validate(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(result)});
        }
        if (url === "/api/home/blueprints/game-model-preview") {
            const result = service.previewGameModel(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(result)))});
        }
        if (!init?.method || init.method === "GET") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        writes(url);
        return Promise.reject(new Error(`Unexpected write: ${url}`));
    };
    renderRoutedApp({fetchImpl});
    return writes;
}
async function jsonEditor() {
    if (screen.queryByRole("button", {name: /Show advanced options/})) fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
    fireEvent.click(await screen.findByLabelText("JSON"));
    return screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement;
}
function form() {
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
}
it("guides all bounded rules, preserves explicit zeros and JSON changes without saving", async () => {
    const writes = home();
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(initial)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    for (const key of ["cascade", "respins", "collection"]) fireEvent.click(screen.getByRole("button", {name: `Add ${key}`}));
    fireEvent.change(screen.getByLabelText("Maximum winning cascades"), {target: {value: "5"}});
    fireEvent.change(screen.getByLabelText("Maximum executed respins"), {target: {value: "8"}});
    fireEvent.change(screen.getByLabelText("Collection payout"), {target: {value: "0"}});
    const field = await jsonEditor();
    const blueprint = JSON.parse(field.value);
    expect(blueprint.mechanics).toMatchObject({cascade: {maxCascades: 5}, respins: {maxRespins: 8}, collection: {payout: 0}});
    blueprint.mechanics.collection.reset = "subtract-threshold";
    blueprint.mechanics.collection.contribution = 0;
    fireEvent.change(field, {target: {value: JSON.stringify(blueprint)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(screen.getByLabelText("Collection contribution")).toHaveValue("0");
    expect(screen.getByRole("combobox", {name: "Collection reset"})).toHaveValue("subtract-threshold");
    expect(JSON.parse((await jsonEditor()).value).mechanics).toEqual(blueprint.mechanics);
    expect(writes).not.toHaveBeenCalled();
});
it("retains malformed rules, exposes field diagnostics, repairs numeric validation and removes explicitly", async () => {
    const writes = home();
    const malformed = {...initial, mechanics: {respins: {grant: 2}, collection: {symbolId: "C", contribution: 1, threshold: 4, cap: 3, reset: "zero", payout: 0}}};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(malformed)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(screen.getByText(/Correct mechanics.respins in JSON/)).toBeVisible();
    expect(screen.getByLabelText("Collection cap")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    fireEvent.change(screen.getByLabelText("Collection cap"), {target: {value: "5"}});
    fireEvent.click(screen.getByRole("button", {name: "Remove respins"}));
    const blueprint = JSON.parse((await jsonEditor()).value);
    expect(blueprint.mechanics).toEqual({collection: {...malformed.mechanics.collection, cap: 5}});
    expect(writes).not.toHaveBeenCalled();
});

it.each([{policy: ["reset"]}, {policy: {policy: "reset"}}, {policy: null}, {policy: 0}, {policy: true}, {policy: "unknown"}])("retains malformed policy drafts safely: %j", async ({policy}) => {
    const writes = home();
    const malformed = {...initial, mechanics: {
        respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 2, maxRespins: 8, retrigger: policy},
        collection: {symbolId: "C", contribution: 1, threshold: 4, cap: 5, payout: 0, reset: policy},
    }};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(malformed)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(screen.getByText(/Correct mechanics.respins in JSON/)).toBeVisible();
    expect(screen.getByText(/Correct mechanics.collection in JSON/)).toBeVisible();
    expect(screen.queryByRole("combobox", {name: "Respin retrigger"})).toBeNull();
    expect(screen.queryByRole("combobox", {name: "Collection reset"})).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    expect(JSON.parse((await jsonEditor()).value)).toEqual(malformed);
    expect(writes).not.toHaveBeenCalled();
});


it.each(["respins", "collection"] as const)("repairs object-valued %s numeric drafts through Form/JSON and real preview, then reuses the editor", async mechanic => {
    const writes = home();
    const valid = {...initial, mechanics: {
        respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 2, retrigger: "none", maxRespins: 8},
        collection: {symbolId: "C", contribution: 0, threshold: 4, cap: 5, reset: "zero", payout: 0},
    }};
    const malformed = JSON.parse(JSON.stringify(valid));
    const field = mechanic === "respins" ? "maxRespins" : "threshold";
    malformed.mechanics[mechanic][field] = {toString: null, valueOf: null};
    for (const draft of [valid, malformed, valid, valid]) {
        fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(draft)}});
        fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
        form();
        if (draft === malformed) {
            expect(screen.getByText(new RegExp(`Correct mechanics.${mechanic} in JSON`))).toBeVisible();
            expect(screen.getByText(new RegExp(`mechanics.${mechanic}.${field}:`))).toBeVisible();
            await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
        } else {
            expect(screen.getByLabelText("Maximum executed respins")).toHaveValue("8");
            expect(screen.getByLabelText("Collection threshold")).toHaveValue("4");
            await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        }
        const editor = await jsonEditor();
        expect(JSON.parse(editor.value)).toEqual(draft);
        fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
        await screen.findByText(`Id: ${valid.manifest.id}`);
        if (draft === malformed) {
            expect(screen.getByText(/These mechanics can't be previewed yet/)).toBeVisible();
            expect(screen.queryByText(/^Respins: trigger/)).toBeNull();
        } else {
            expect(screen.getByText(/^Respins: trigger/)).toBeVisible();
            expect(screen.getByText(/^Collection: symbol/)).toHaveTextContent(/contribution 0 per symbol;.*payout 0/);
        }
        expect(JSON.parse(editor.value)).toEqual(draft);
    }
    expect(writes).not.toHaveBeenCalled();
});

it.each(AUTHORED_BOUNDED_MECHANIC_CATALOG)("%s: Home JSON retains catalogue rules and blocks invalid publication", async id => {
    const writes = home(), 
        blueprint = boundedBlueprint(id);
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(blueprint)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(JSON.parse((await jsonEditor()).value).mechanics).toEqual(blueprint.mechanics);
    const invalid = {...blueprint, mechanics: {...blueprint.mechanics, unknown: {}}};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(invalid)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    expect(JSON.parse((await jsonEditor()).value).mechanics).toEqual(invalid.mechanics);
    expect(writes).not.toHaveBeenCalled();
});
