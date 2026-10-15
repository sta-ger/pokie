import {AUTHORED_MECHANIC_CATALOG} from "../../../../../../src/generated/AuthoredMechanicCatalog";
import {existingMechanicsBlueprint} from "../../../../../v2/fixtures/ExistingMechanicsGame";
import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {GameModelSections} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";

function projectValidationSurface() {
    let saved: GameBlueprint = {
        manifest: {id: "v2c12-accum-recovery", name: "V2C12 Accumulating Recovery", version: "1.0.0"},
        reels: 3, rows: 1, symbols: ["A", "C", "M", "J", "S"], scatters: ["S"], paytable: {A: {3: 0}},
        availableBets: [0.05, 7.5, 1e-7], reelStrips: [["C", "A", "S", "J", "M"], ["A", "S", "J", "C", "M"], ["A", "S", "J", "C", "M"]],
        mechanics: {
            freeGames: {scatterSymbol: "S", awardsByCount: {2: 0, 3: 2}, retriggerPolicy: "additive"},
            jackpot: {pool: {id: "mini", type: "accumulating", seedValue: 10}, contribution: {type: "percentage", percentage: 0.1}, trigger: {type: "symbol-count", symbolId: "J", minimumCount: 1}, award: "single-tier"},
        },
        betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 1.5}, {id: "buy", runtimeType: "buyFeature", costMultiplier: 10, forcedFreeGames: 2}, {id: "buy-more", runtimeType: "buyFeature", costMultiplier: 25, forcedFreeGames: 4}],
    };
    const validator = new GameBlueprintValidator();
    expect(validator.validate(saved).filter(issue => issue.severity === "error")).toEqual([]);
    const routes = createRoutedFakeFetch({
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/recovery", game: saved.manifest, type: "blueprint", capabilities: ["blueprint.build"]}}),
        "/api/project/gameModel": () => ({ok: true, status: 200, body: buildGameModelProjection(saved)}),
        "/api/home/blueprints/load": () => ({ok: true, status: 200, body: {status: "ok", path: "/games/recovery", blueprint: saved, blueprintHash: "saved-hash"}}),
        "/api/home/blueprints/validate": ({init}) => {
            const issues = validator.validate(JSON.parse(String(init?.body)).blueprint);
            const errors = issues.filter(issue => issue.severity === "error");
            return {ok: true, status: 200, body: {status: errors.length ? "invalid" : "ok", errors, warnings: issues.filter(issue => issue.severity !== "error")}};
        },
        "/api/home/blueprints/save": ({init}) => {
            saved = JSON.parse(String(init?.body)).blueprint as GameBlueprint;
            expect(validator.validate(saved).filter(issue => issue.severity === "error")).toEqual([]);
            return {ok: true, status: 200, body: {status: "ok", path: "/games/recovery", blueprintHash: "updated-hash"}};
        },
    });
    return {...routes, getSaved: () => saved};
}

async function projectSection(legend: string): Promise<HTMLElement> {
    return (await screen.findByText(legend, {selector: "span"})).closest("fieldset")!;
}

it.each(["save", "discard"])("V2C-12 exposes whitespace-only Project name validation and recovers through %s", async finish => {
    const user = userEvent.setup();
    const routes = projectValidationSurface();
    const original = routes.getSaved();
    renderRoutedApp({fetchImpl: routes.fetchImpl, initialEntries: ["/project/gameModel"]});
    const basics = await projectSection("Game basics");
    await user.click(await within(basics).findByRole("button", {name: "Edit"}));
    const name = await within(basics).findByLabelText("Game name");
    await user.clear(name);
    await user.type(name, " ");
    const save = within(basics).getByRole("button", {name: "Save"});
    await user.click(save);
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(within(basics).getByText('"manifest.name" must be a non-empty string.')).toBeVisible();
    expect(name).toHaveValue(" ");
    expect(save).toBeDisabled();
    expect(routes.getSaved()).toEqual(original);
    expect(routes.calls.some(call => call.url === "/api/home/blueprints/save")).toBe(false);
    expect(JSON.parse(String(routes.calls.find(call => call.url === "/api/home/blueprints/validate")?.init?.body)).blueprint.manifest.name).toBe(" ");
    if (finish === "save") {
        await user.clear(name);
        await user.type(name, "Recovered game");
        expect(name).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByText(/Save blocked/)).not.toBeInTheDocument();
        expect(save).toBeEnabled();
        expect(routes.getSaved()).toEqual(original);
        await user.click(save);
        await within(basics).findByRole("button", {name: "Edit"});
        expect(within(basics).getByText("Name: Recovered game")).toBeVisible();
        expect(routes.getSaved()).toEqual({...original, manifest: {...original.manifest, name: "Recovered game"}});
        expect(routes.calls.filter(call => call.url === "/api/home/blueprints/save")).toHaveLength(1);
        const body = JSON.parse(String(routes.calls.find(call => call.url === "/api/home/blueprints/save")?.init?.body));
        expect(body).toMatchObject({overwrite: true, expectedHash: "saved-hash", blueprint: routes.getSaved()});
    } else {
        await user.click(within(basics).getByRole("button", {name: "Cancel"}));
        await screen.findByText("Discard your unsaved changes to this section?");
        await user.click(screen.getByRole("button", {name: "Confirm"}));
        await within(basics).findByRole("button", {name: "Edit"});
        expect(within(basics).getByText(`Name: ${original.manifest.name}`)).toBeVisible();
        expect(routes.getSaved()).toEqual(original);
        expect(routes.calls.some(call => call.url === "/api/home/blueprints/save")).toBe(false);
    }
    await user.click(within(basics).getByRole("button", {name: "Edit"}));
    expect(await within(basics).findByLabelText("Game name")).toHaveValue(routes.getSaved().manifest.name);
    expect(screen.queryByText(/must be a non-empty string/)).not.toBeInTheDocument();
}, 60000);

it.each([
    {section: "Game basics", field: "Game id", path: "manifest.id"},
    {section: "Game basics", field: "Version", path: "manifest.version"},
    {section: "Layout", field: "Rows", path: "rows"},
    {section: "Layout", field: "Reels", path: "reels"},
])("V2C-12 retains actionable Project $path diagnostics at the real validator boundary", async ({section, field, path}) => {
    const user = userEvent.setup();
    const routes = projectValidationSurface();
    const original = routes.getSaved();
    renderRoutedApp({fetchImpl: routes.fetchImpl, initialEntries: ["/project/gameModel"]});
    const panel = await projectSection(section);
    await user.click(await within(panel).findByRole("button", {name: "Edit"}));
    const input = await within(panel).findByLabelText(field);
    await user.clear(input);
    if (section === "Game basics") await user.type(input, "   ");
    else await user.type(input, field === "Reels" ? "3.5" : "1.5");
    await user.click(within(panel).getByRole("button", {name: "Save"}));
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAccessibleDescription(new RegExp(path.replace(/\./g, "\\.")));
    const submitted = JSON.parse(String(routes.calls.find(call => call.url === "/api/home/blueprints/validate")?.init?.body)).blueprint;
    const summary = screen.getByText("Save blocked — correct these errors before saving").parentElement!;
    for (const issue of new GameBlueprintValidator().validate(submitted).filter(issue => issue.severity === "error")) {
        expect(summary).toHaveTextContent(`${issue.code}: ${issue.message}`);
    }
    expect(routes.getSaved()).toEqual(original);
    expect(routes.calls.some(call => call.url === "/api/home/blueprints/save")).toBe(false);
}, 60000);

it.each(["validate", "save"])("V2C-12 renders Project %s request failure and permits an explicit retry", async endpoint => {
    const user = userEvent.setup();
    const routes = projectValidationSurface();
    const original = routes.getSaved();
    let fail = true;
    const fetchImpl: FetchLike = (url, init) => {
        if (url === `/api/home/blueprints/${endpoint}` && fail) {
            fail = false;
            return Promise.reject(new Error("Failed to fetch"));
        }
        return routes.fetchImpl(url, init);
    };
    renderRoutedApp({fetchImpl, initialEntries: ["/project/gameModel"]});
    const basics = await projectSection("Game basics");
    await user.click(await within(basics).findByRole("button", {name: "Edit"}));
    const name = await within(basics).findByLabelText("Game name");
    await user.clear(name);
    await user.type(name, "Retry game");
    await user.click(within(basics).getByRole("button", {name: "Save"}));
    expect(await screen.findByText("This game model save couldn't reach POKIE Studio. Start or restart Studio, then try again.")).toBeVisible();
    expect(name).toHaveValue("Retry game");
    expect(routes.getSaved()).toEqual(original);
    await user.click(within(basics).getByRole("button", {name: "Save"}));
    await within(basics).findByRole("button", {name: "Edit"});
    expect(within(basics).getByText("Name: Retry game")).toBeVisible();
    expect(routes.calls.filter(call => call.url === "/api/home/blueprints/save")).toHaveLength(1);
}, 60000);

it("authors Hold&Win and jackpot in Home, preserves JSON equivalence and applies JSON explicitly", async () => {
    const writes: unknown[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url.startsWith("/api/home/projects/registry")) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        if (url === "/api/home/blueprints/validate") {
            const {blueprint} = JSON.parse(String(init?.body));
            const issues = new GameBlueprintValidator().validate(blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: issues.some(i => i.severity === "error") ? "invalid" : "ok", errors: issues.filter(i => i.severity === "error"), warnings: issues.filter(i => i.severity !== "error")})});
        }
        if (!init?.method || init.method === "GET") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        writes.push(url);
        return Promise.reject(new Error(`Unexpected write: ${url}`));
    };
    renderRoutedApp({fetchImpl});
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
    fireEvent.click(screen.getByRole("button", {name: "Add Hold & Win"}));
    fireEvent.click(screen.getByRole("button", {name: "Add jackpot"}));
    fireEvent.change(screen.getByLabelText("Initial and reset respins"), {target: {value: "4"}});
    fireEvent.change(screen.getByLabelText("Jackpot contribution fraction"), {target: {value: "0.05"}});
    fireEvent.click(screen.getByLabelText("Values are entry bet multiples"));
    expect(screen.getByText(/Retrigger policy: reset-on-new-lock/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
    fireEvent.click(await screen.findByLabelText("JSON"));
    const field = screen.getByLabelText("Blueprint JSON");
    const blueprint = JSON.parse((field as HTMLTextAreaElement).value);
    expect(blueprint.mechanics.holdAndWin).toMatchObject({initialRespins: 4, retriggerPolicy: "reset-on-new-lock", payout: {amountsAreBetMultiples: true}});
    expect(blueprint.mechanics.jackpot.contribution.percentage).toBe(0.05);
    blueprint.mechanics.holdAndWin.initialRespins = 7;
    fireEvent.change(field, {target: {value: JSON.stringify(blueprint)}});
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
    await waitFor(() => expect(screen.getByLabelText("Initial and reset respins")).toHaveValue("7"));
    expect(writes).toEqual([]);
}, 60000);

it("uses the same controls in Project Game Model and keeps mutation separate from Save", () => {
    const save = jest.fn();
    function ProjectEditor() {
        const [blueprint, update] = useState<Record<string, unknown>>({symbols: ["C", "J"], mechanics: {}});
        const unavailable = {status: "unavailable" as const, reason: "Not supplied"};
        return <MantineProvider><GameModelSections projection={{basics: unavailable, layout: unavailable, symbols: unavailable, reels: unavailable, paytable: unavailable, betsAndModes: unavailable, limits: unavailable, mechanics: {status: "available", data: {}}}} edit={{ready: true, activeSection: "mechanics", blueprint, mutate: fn => update(previous => {
            const next = JSON.parse(JSON.stringify(previous));
            fn(next);
            return next;
        }), saving: false, onEdit: () => undefined, onSave: () => save(blueprint), onCancel: () => undefined, drafts: {current: new Map()}, modeDrafts: {current: new Map()}, revision: 0, validationView: {status: "idle"}}} /></MantineProvider>;
    }
    render(<ProjectEditor />);
    fireEvent.click(screen.getByRole("button", {name: "Add jackpot"}));
    fireEvent.change(screen.getByLabelText("Jackpot pool id"), {target: {value: "grand"}});
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({mechanics: expect.objectContaining({jackpot: expect.objectContaining({pool: expect.objectContaining({id: "grand"})})})}));
});

it.each([{holdAndWin: {}}, {jackpot: {}}, {holdAndWin: {payout: null, symbolEffects: []}}, {jackpot: {pool: null, contribution: [], trigger: null}}])("F3 retains malformed Home JSON %p, opens Form safely and prevents Create", async mechanics => {
    const writes = jest.fn();
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const {blueprint} = JSON.parse(String(init?.body));
            const issues = new GameBlueprintValidator().validate(blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "invalid", errors: issues.filter(i => i.severity === "error"), warnings: issues.filter(i => i.severity !== "error")})});
        }
        if (!init?.method || init.method === "GET") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        writes(url);
        return Promise.reject(new Error(`Unexpected write: ${url}`));
    };
    renderRoutedApp({fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
    fireEvent.click(await screen.findByLabelText("JSON"));
    const field = screen.getByLabelText("Blueprint JSON");
    const blueprint = {...JSON.parse((field as HTMLTextAreaElement).value), mechanics};
    fireEvent.change(field, {target: {value: JSON.stringify(blueprint)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
    expect(screen.getByText(/draft is incomplete or malformed/)).toBeVisible();
    expect(screen.getByText("Mechanic validation")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    fireEvent.click(screen.getByLabelText("JSON"));
    expect(JSON.parse((screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value).mechanics).toEqual(mechanics);
    expect(writes).not.toHaveBeenCalled();
}, 60000);

it.each([{holdAndWin: {}}, {jackpot: {}}])("F3 opens malformed Project mechanics %p without discarding the draft or enabling Save", mechanics => {
    const blueprint = {symbols: ["C"], mechanics};
    const save = jest.fn(),
        mutate = jest.fn();
    const unavailable = {status: "unavailable" as const, reason: "Not supplied"};
    render(<MantineProvider><GameModelSections projection={{basics: unavailable, layout: unavailable, symbols: unavailable, reels: unavailable, paytable: unavailable, betsAndModes: unavailable, limits: unavailable, mechanics: {status: "available", data: {}}}} edit={{ready: true, activeSection: "mechanics", blueprint, mutate, saving: false, onEdit: () => undefined, onSave: save, onCancel: () => undefined, drafts: {current: new Map()}, modeDrafts: {current: new Map()}, revision: 0, validationView: {status: "idle"}}} /></MantineProvider>);
    expect(screen.getByText(/draft is incomplete or malformed/)).toBeVisible();
    expect(screen.getByText("Mechanic validation")).toBeVisible();
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    expect(save).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(blueprint.mechanics).toEqual(mechanics);
});

it.each(AUTHORED_MECHANIC_CATALOG)("$id: Home JSON retains catalogue rules and blocks invalid publication", async row => {
    const blueprint = existingMechanicsBlueprint(row), 
        writes = jest.fn();
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const issues = new GameBlueprintValidator().validate(JSON.parse(String(init?.body)).blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: issues.some(issue => issue.severity === "error") ? "invalid" : "ok", errors: issues.filter(issue => issue.severity === "error"), warnings: []})});
        }
        if (!init?.method || init.method === "GET") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        writes(url);
        return Promise.reject(new Error(`Unexpected write: ${url}`));
    };
    renderRoutedApp({fetchImpl});
    fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
    fireEvent.click(await screen.findByLabelText("JSON"));
    fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(blueprint)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
    fireEvent.click(screen.getByLabelText("JSON"));
    const retained = JSON.parse((screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value);
    expect(retained.mechanics).toEqual(blueprint.mechanics);
    if (row.modes) expect(retained.betModes).toEqual(blueprint.betModes);
    retained.mechanics.unknown = {};
    fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(retained)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    fireEvent.click(screen.getByLabelText("Form"));
    expect((await screen.findAllByText(/mechanics\.unknown: unknown field/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    fireEvent.click(screen.getByLabelText("JSON"));
    expect(JSON.parse((screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement).value).mechanics).toEqual(retained.mechanics);
    expect(writes).not.toHaveBeenCalled();
});
