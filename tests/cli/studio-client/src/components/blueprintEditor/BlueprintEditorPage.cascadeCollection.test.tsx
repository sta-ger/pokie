import {fireEvent, screen, waitFor} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";

const initial = {manifest: {id: "bounded", name: "Bounded", version: "1.0.0"}, reels: 3, rows: 1, symbols: ["A", "C"], wilds: [], scatters: [], availableBets: [0.05], paytable: {A: {3: 0}}, reelStrips: [["C"], ["C"], ["C"]]};
function home() {
    const writes = jest.fn();
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const issues = new GameBlueprintValidator().validate(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: issues.some(i => i.severity === "error") ? "invalid" : "ok", errors: issues.filter(i => i.severity === "error"), warnings: []})});
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
