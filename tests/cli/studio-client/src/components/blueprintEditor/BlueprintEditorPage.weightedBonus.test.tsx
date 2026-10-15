import userEvent from "@testing-library/user-event";
import {weightedBonusBlueprint} from "../../../../../v2/fixtures/WeightedBonusGame";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";

function home() {
    const writes = jest.fn();
    const service = new StudioBlueprintService(
        "1.3.0",
        process.cwd(),
        new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository()),
    );
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const result = service.validate(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(result)});
        }
        if (url === "/api/home/blueprints/game-model-preview") {
            const result = service.previewGameModel(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve(JSON.parse(JSON.stringify(result))),
            });
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

it("Home Form/JSON preserves identity, units, zero mass and malformed drafts without saving", async () => {
    const writes = home(),
        blueprint = weightedBonusBlueprint();
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(blueprint)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(screen.getByLabelText("Outcome 3 weight")).toHaveValue("0");
    fireEvent.change(screen.getByLabelText("Bonus feature ID"), {target: {value: "renamed-feature"}});
    fireEvent.change(screen.getByLabelText("Outcome 1 payout"), {target: {value: "0"}});
    const edited = JSON.parse((await jsonEditor()).value);
    expect(edited.mechanics.weightedBonus.outcomes.map((o: {targetId: string}) => o.targetId)).toEqual([
        "renamed-feature",
        "renamed-feature",
        "renamed-feature",
    ]);
    expect(edited.mechanics.weightedBonus.outcomes[0].payout).toBe(0);
    edited.mechanics.weightedBonus.outcomes[0].weight = {invalid: true};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(edited)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    form();
    expect(screen.getByText(/Correct mechanics.weightedBonus in JSON/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    expect(JSON.parse((await jsonEditor()).value)).toEqual(edited);
    fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
    await screen.findByText("Id: weighted-bonus");
    expect(screen.getByText(/These mechanics can't be previewed yet/)).toBeVisible();
    expect(writes).not.toHaveBeenCalled();
});

it("Project Game Model edits and validates the shared draft, saves explicitly and reopens targets", async () => {
    const user = userEvent.setup();
    let saved = weightedBonusBlueprint();
    const service = new StudioBlueprintService(
        "1.3.0",
        process.cwd(),
        new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository()),
    );
    const routes = createRoutedFakeFetch({
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {
                status: "loaded",
                projectRoot: "/games/bonus",
                game: saved.manifest,
                type: "blueprint",
                capabilities: ["blueprint.build"],
            },
        }),
        "/api/project/gameModel": () => ({ok: true, status: 200, body: buildGameModelProjection(saved)}),
        "/api/home/blueprints/load": () => ({
            ok: true,
            status: 200,
            body: {status: "ok", path: "/games/bonus", blueprint: saved, blueprintHash: "saved"},
        }),
        "/api/home/blueprints/validate": ({init}) => ({
            ok: true,
            status: 200,
            body: service.validate(JSON.parse(String(init?.body)).blueprint),
        }),
        "/api/home/blueprints/save": ({init}) => {
            saved = JSON.parse(String(init?.body)).blueprint;
            expect(service.validate(saved).status).toBe("ok");
            return {ok: true, status: 200, body: {status: "ok", path: "/games/bonus", blueprintHash: "updated"}};
        },
    });
    renderRoutedApp({fetchImpl: routes.fetchImpl, initialEntries: ["/project/gameModel"]});
    const section = (await screen.findByText("Mechanics", {selector: "span"})).closest("fieldset")!;
    await user.click(within(section).getByRole("button", {name: "Edit"}));
    const field = await within(section).findByLabelText("Outcome 1 weight");
    await user.clear(field);
    await user.type(field, "-1");
    await waitFor(() => expect(within(section).getByRole("button", {name: "Save"})).toBeDisabled());
    expect(within(section).getByText(/mechanics.weightedBonus.outcomes.0.weight/)).toBeVisible();
    expect(saved.mechanics!.weightedBonus!.outcomes[0].weight).toBe(1);
    await user.clear(field);
    await user.type(field, "2");
    const feature = within(section).getByLabelText("Bonus feature ID");
    await user.clear(feature);
    await user.type(feature, "prize-respins");
    await waitFor(() => expect(within(section).getByRole("button", {name: "Save"})).toBeEnabled());
    await user.click(within(section).getByRole("button", {name: "Save"}));
    await waitFor(() => expect(saved.mechanics!.weightedBonus!.outcomes[0].weight).toBe(2));
    expect(saved.mechanics!.weightedBonus!.outcomes.every((o) => o.targetId === "prize-respins")).toBe(true);
    await user.click(await within(section).findByRole("button", {name: "Edit"}));
    expect(await within(section).findByLabelText("Outcome 1 weight")).toHaveValue("2");
    expect(within(section).getByLabelText("Bonus feature ID")).toHaveValue("prize-respins");
});
