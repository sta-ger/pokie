import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {GameModelSections} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";
import {buildGameModelProjection} from "../../../../../../src/project/buildGameModelProjection";
import type {GameBlueprint} from "../../../../../../src/generated/GameBlueprint";

function home() {
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

it("Project edits remain unsaved until Save; reload and read-only inspection retain the same ordered rules", () => {
    const save = jest.fn();
    function Project() {
        const [saved, setSaved] = useState(initial);
        const [blueprint, update] = useState<Record<string, unknown>>(initial);
        const [editing, setEditing] = useState(true);
        return (
            <MantineProvider>
                <GameModelSections
                    projection={buildGameModelProjection(saved)}
                    edit={{
                        ready: true,
                        activeSection: editing ? "mechanics" : undefined,
                        blueprint,
                        mutate: (fn) =>
                            update((previous) => {
                                const next = JSON.parse(JSON.stringify(previous));
                                fn(next);
                                return next;
                            }),
                        saving: false,
                        onEdit: () => setEditing(true),
                        onSave: () => {
                            save(blueprint);
                            setSaved(blueprint as GameBlueprint);
                            setEditing(false);
                        },
                        onCancel: () => {
                            update(saved);
                            setEditing(false);
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
    render(<Project />);
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
    const buttons = screen.getAllByRole("button", {name: "Edit"});
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByLabelText("Rule 1 lifetime")).toHaveValue("6");
});
