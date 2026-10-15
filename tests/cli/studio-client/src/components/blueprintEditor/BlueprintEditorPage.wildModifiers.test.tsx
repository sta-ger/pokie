import {ModalsProvider} from "@mantine/modals";
import {createMemoryRouter, RouterProvider} from "react-router-dom";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";
import {GameModelTab} from "../../../../../../cli/studio-client/src/components/project/GameModelTab";
import {MantineProvider} from "@mantine/core";
import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {useState} from "react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {renderWithProviders} from "../../testUtils/renderWithProviders";
import {GameModelSections, type GameModelSectionId} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";

function home(storage?: {blueprint?: GameBlueprint}) {
    const writes = jest.fn();
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/home/blueprints/validate") {
            const {blueprint} = JSON.parse(String(init?.body));
            const issues = new GameBlueprintValidator().validate(blueprint);
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                    Promise.resolve({
                        status: issues.some((i) => i.severity === "error") ? "invalid" : "ok",
                        errors: issues.filter((i) => i.severity === "error"),
                        warnings: issues.filter((i) => i.severity !== "error"),
                    }),
            });
        }
        if (storage && url === "/api/home/blueprints/save") {
            storage.blueprint = JSON.parse(String(init?.body)).blueprint;
            writes(url, storage.blueprint);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", path: "/games/modifiers.json", blueprintHash: "saved"})});
        }
        if (storage && url === "/api/home/blueprints/load") {
            writes(url);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", path: "/games/modifiers.json", blueprint: storage.blueprint, blueprintHash: "saved"})});
        }
        if (url.startsWith("/api/home/fs/browse")) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", resolvedPath: "/games/modifiers.json", displayPath: "/games/modifiers.json", isDirectory: false, entries: []})});
        if (!init?.method || init.method === "GET") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
        writes(url);
        return Promise.reject(new Error(`Unexpected write: ${url}`));
    };
    renderRoutedApp({fetchImpl});
    return writes;
}
async function jsonEditor(): Promise<HTMLTextAreaElement> {
    if (screen.queryByRole("button", {name: /Show advanced options/})) fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
    fireEvent.click(await screen.findByLabelText("JSON"));
    return screen.getByLabelText("Blueprint JSON") as HTMLTextAreaElement;
}
function showControls() {
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
}

it("Home authors all ordered rules and wild factors, retains unsaved edits and explicitly applies JSON", async () => {
    const writes = home();
    const start = await jsonEditor();
    fireEvent.change(start, {target: {value: JSON.stringify({...initial, rows: 3})}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    showControls();
    fireEvent.click(screen.getByRole("button", {name: "Add wild modifiers"}));
    for (const type of ["transform", "expand", "sticky", "reel"]) fireEvent.click(screen.getByRole("button", {name: `Add ${type} rule`}));
    fireEvent.change(screen.getByLabelText("W multiplier factor"), {target: {value: "0"}});
    fireEvent.change(screen.getByLabelText("Rule 3 lifetime"), {target: {value: "4"}});
    fireEvent.change(screen.getByLabelText("Rule 1 cell 1 row"), {target: {value: "1"}});
    fireEvent.click(screen.getByRole("button", {name: "Move rule 4 up"}));
    fireEvent.click(screen.getByRole("button", {name: "Move rule 3 up"}));
    const field = await jsonEditor();
    const b = JSON.parse(field.value);
    expect(b.mechanics.modifiers.wilds).toContainEqual({symbol: "W", factor: 0});
    expect(b.mechanics.modifiers.rules.map((r: {type: string}) => r.type)).toEqual([
        "transform",
        "reel",
        "expand",
        "sticky",
    ]);
    expect(b.mechanics.modifiers.rules[0].positions).toEqual([[0, 1]]);
    expect(b.mechanics.modifiers.rules[3].lifetime).toBe(4);
    b.mechanics.modifiers.wilds[0].substitutes = [];
    b.mechanics.modifiers.rules[3].lifetime = 7;
    fireEvent.change(field, {target: {value: JSON.stringify(b)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    showControls();
    expect(screen.getByLabelText("Rule 4 lifetime")).toHaveValue("7");
    expect(screen.getByRole("combobox", {name: "W substitution targets (empty forbids substitution)"})).toBeVisible();
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", {name: /^Layout/}));
    fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
    expect(screen.getByLabelText("Rule 4 lifetime")).toHaveValue("7");
}, 60000);

it.each([
    null,
    {wilds: null, rules: []},
    {wilds: [], rules: [null]},
    {wilds: [], rules: [{id: "broken", type: "sticky", positions: null}]},
])(
    "Home retains malformed modifier JSON %p and blocks creation",
    async (modifiers) => {
        const writes = home();
        const field = await jsonEditor();
        const b = JSON.parse(field.value);
        b.mechanics = {modifiers};
        fireEvent.change(field, {target: {value: JSON.stringify(b)}});
        fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
        showControls();
        expect(screen.getByText(/modifier draft is incomplete or malformed/)).toBeVisible();
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
        const retained = await jsonEditor();
        expect(JSON.parse(retained.value).mechanics.modifiers).toEqual(modifiers);
        expect(writes).not.toHaveBeenCalled();
    },
    60000,
);

const initial: GameBlueprint = {
    manifest: {id: "rules", name: "Rules", version: "1.0.0"},
    reels: 3,
    rows: 1,
    symbols: ["A", "W"],
    wilds: ["W"],
    paytable: {A: {3: 10}},
    reelStrips: [["A"], ["W"], ["A"]],
};

it("Project edits remain unsaved until Save; reload and read-only inspection retain the same ordered rules", async () => {
    const save = jest.fn();
    function Project() {
        const [saved, setSaved] = useState(initial);
        const [blueprint, update] = useState<Record<string, unknown>>(initial);
        const [section, setSection] = useState<GameModelSectionId | undefined>("mechanics");
        return (
            <MantineProvider>
                <GameModelSections
                    projection={buildGameModelProjection(saved)}
                    edit={{
                        ready: true,
                        activeSection: section,
                        blueprint,
                        mutate: (fn) =>
                            update((previous) => {
                                const next = JSON.parse(JSON.stringify(previous));
                                fn(next);
                                return next;
                            }),
                        saving: false,
                        onEdit: setSection,
                        onSave: () => {
                            save(blueprint);
                            setSaved(blueprint as GameBlueprint);
                            setSection(undefined);
                        },
                        onCancel: () => {
                            update(saved);
                            setSection(undefined);
                        },
                        drafts: {current: new Map()},
                        modeDrafts: {current: new Map()},
                        revision: 0,
                        validationView: {status: "idle"},
                    }}
                />
            </MantineProvider>
        );
    }
    renderWithProviders(<Project />);
    fireEvent.click(screen.getByRole("button", {name: "Add wild modifiers"}));
    fireEvent.click(screen.getByRole("button", {name: "Add sticky rule"}));
    fireEvent.change(screen.getByLabelText("Rule 1 lifetime"), {target: {value: "6"}});
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            mechanics: {modifiers: {wilds: [], rules: [expect.objectContaining({type: "sticky", lifetime: 6})]}},
        }),
    );
    expect(screen.getByText(/Rule 1: rule-1, sticky/)).toHaveTextContent("lifetime 6");
    fireEvent.click(document.getElementById("game-model-symbols-edit")!);
    fireEvent.change(screen.getByLabelText("Symbol 2 id"), {target: {value: "W4"}});
    fireEvent.blur(screen.getByLabelText("Symbol 2 id"));
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    const renamed = save.mock.calls[1][0];
    expect(renamed.mechanics.modifiers.rules[0].symbol).toBe("W4");
    expect(renamed.reelStrips[1]).toEqual(["W4"]);
    expect(new GameBlueprintValidator().validate(renamed).filter(issue => issue.severity === "error")).toEqual([]);
    const buttons = screen.getAllByRole("button", {name: "Edit"});
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByLabelText("Rule 1 lifetime")).toHaveValue("6");
    await act(async () => {
        await Promise.resolve();
    });
});


it("Home saves and reloads valid renamed modifier declarations without losing zero, empty restrictions or ordering", async () => {
    const storage: {blueprint?: GameBlueprint} = {};
    const writes = home(storage);
    const declaration: GameBlueprint = {...initial, mechanics: {modifiers: {
        wilds: [{symbol: "W", factor: 0, substitutes: []}],
        rules: [
            {id: "make", type: "transform", from: "A", to: "W", space: "evaluated", positions: [[0, 0]]},
            {id: "retain", type: "sticky", symbol: "W", lifetime: 3, space: "evaluated", positions: [[1, 0]]},
        ],
    }}};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(declaration)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    fireEvent.click(screen.getByLabelText("Form"));
    fireEvent.click(screen.getByRole("tab", {name: /^Symbols/}));
    fireEvent.change(screen.getByLabelText("Symbol 2 id"), {target: {value: "W4"}});
    fireEvent.blur(screen.getByLabelText("Symbol 2 id"));
    expect(writes).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Save to path"), {target: {value: "/games/modifiers.json"}});
    fireEvent.click(await screen.findByRole("button", {name: "Save", exact: true}));
    await screen.findByText('Saved to "/games/modifiers.json".');
    expect(storage.blueprint!.mechanics!.modifiers).toEqual({
        wilds: [{symbol: "W4", factor: 0, substitutes: []}],
        rules: [
            {id: "make", type: "transform", from: "A", to: "W4", space: "evaluated", positions: [[0, 0]]},
            {id: "retain", type: "sticky", symbol: "W4", lifetime: 3, space: "evaluated", positions: [[1, 0]]},
        ],
    });
    fireEvent.change(screen.getByLabelText("Load from path"), {target: {value: "/games/modifiers.json"}});
    fireEvent.click(screen.getByRole("button", {name: "Load", exact: true}));
    await waitFor(() => expect(writes).toHaveBeenCalledWith("/api/home/blueprints/load"));
    expect(JSON.parse((await jsonEditor()).value)).toEqual(storage.blueprint);
    expect(new GameBlueprintValidator().validate(storage.blueprint).filter(issue => issue.severity === "error")).toEqual([]);
}, 60000);


it.each([{}, [], true])("F6 Home retains malformed factor %p, repairs JSON to zero and explicitly removes it", async factor => {
    const writes = home();
    const malformed = {...initial, mechanics: {modifiers: {wilds: [{symbol: "W", factor}], rules: []}}};
    fireEvent.change(await jsonEditor(), {target: {value: JSON.stringify(malformed)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    showControls();
    expect(screen.getByText(/modifier draft is incomplete or malformed/)).toBeVisible();
    expect(screen.queryByLabelText("W multiplier factor")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
    expect(JSON.parse((await jsonEditor()).value)).toEqual(malformed);
    const repaired = {...initial, mechanics: {modifiers: {wilds: [{symbol: "W", factor: 0}], rules: []}}};
    fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(repaired)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    showControls();
    expect(screen.getByLabelText("W multiplier factor")).toHaveValue("0");
    expect(screen.queryByText(/modifier draft is incomplete or malformed/)).not.toBeInTheDocument();
    expect(JSON.parse((await jsonEditor()).value)).toEqual(repaired);
    fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: JSON.stringify(malformed)}});
    fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
    showControls();
    fireEvent.click(screen.getByRole("button", {name: "Remove wild modifiers"}));
    expect(screen.getByRole("button", {name: "Add wild modifiers"})).toBeEnabled();
    expect(JSON.parse((await jsonEditor()).value).mechanics.modifiers).toBeUndefined();
    expect(writes).not.toHaveBeenCalled();
}, 60000);

it.each([{}, [], true])("F6 actual Project retains malformed factor %p, blocks Save and permits explicit removal", async factor => {
    const malformed = {...initial, mechanics: {modifiers: {wilds: [{symbol: "W", factor}], rules: []}}};
    const writes = jest.fn();
    const response = (value: unknown) => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(value)});
    const fetchImpl: FetchLike = (url, init) => {
        if (url.includes("/api/project/gameModel")) return response(buildGameModelProjection(initial));
        if (url.endsWith("/load")) return response({status: "ok", path: "model.json", blueprint: malformed, blueprintHash: "before"});
        if (url.endsWith("/validate")) {
            const {blueprint} = JSON.parse(String(init?.body));
            const issues = new GameBlueprintValidator().validate(blueprint);
            return response({status: issues.some(i => i.severity === "error") ? "invalid" : "ok", errors: issues.filter(i => i.severity === "error"), warnings: []});
        }
        if (!init?.method || init.method === "GET") return response({});
        writes(url, init);
        if (url.endsWith("/save")) return response({status: "ok", path: "model.json", blueprintHash: "after"});
        return Promise.reject(new Error(`Unexpected request: ${url}`));
    };
    const router = createMemoryRouter([{path: "/project/gameModel", element: <GameModelTab editable projectRoot="model.json" />}], {initialEntries: ["/project/gameModel"]});
    render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ModalsProvider><RouterProvider router={router} /></ModalsProvider></StudioApiProvider></MantineProvider>);
    const section = (await screen.findByText("Mechanics", {selector: "span"})).closest("fieldset")!;
    fireEvent.click(within(section).getByRole("button", {name: "Edit"}));
    await screen.findByText(/modifier draft is incomplete or malformed/);
    expect(screen.queryByLabelText("W multiplier factor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save", exact: true})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
    expect(writes).not.toHaveBeenCalled();
    expect(malformed.mechanics.modifiers.wilds[0].factor).toEqual(factor);
    fireEvent.click(screen.getByRole("button", {name: "Remove wild modifiers"}));
    expect(screen.queryByText(/modifier draft is incomplete or malformed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Save", exact: true})).toBeEnabled();
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Save", exact: true}));
    await waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(writes.mock.calls[0][1].body)).blueprint.mechanics.modifiers).toBeUndefined();
    // The loaded draft itself remains untouched; removal was an explicit draft mutation.
    expect(malformed.mechanics.modifiers.wilds[0].factor).toEqual(factor);
}, 60000);
