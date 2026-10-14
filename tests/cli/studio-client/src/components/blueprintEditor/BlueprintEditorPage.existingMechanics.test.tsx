import {MantineProvider} from "@mantine/core";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {GameModelSections} from "../../../../../../cli/studio-client/src/components/project/GameModelSections";
import {GameBlueprintValidator} from "../../../../../../src/generated/GameBlueprintValidator";

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
