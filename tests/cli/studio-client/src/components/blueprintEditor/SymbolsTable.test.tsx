import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {SymbolsTable} from "../../../../../../cli/studio-client/src/components/blueprintEditor/SymbolsTable";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

function Harness({initial = {symbols: ["A"], paytable: {A: {3: 1}}}}: {initial?: Record<string, unknown>}) {
    const [blueprint, setBlueprint] = useState<Record<string, unknown>>(initial);
    return <><output aria-label="Retained draft">{JSON.stringify(blueprint)}</output><SymbolsTable blueprint={blueprint} mutate={(change) => setBlueprint((current) => {
        const draft = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
        change(draft);
        return draft;
    })} /></>;
}

describe("SymbolsTable", () => {
    it("renders malformed retained reels and displays a failed rename diagnostic without changing the symbol", async () => {
        const user = userEvent.setup();
        renderWithProviders(<Harness initial={{symbols: ["A", "B"], reelSequences: [null, {type: "weighted", variants: [null, {symbols: ["A"]}]}]}} />);
        const input = screen.getByRole("textbox", {name: "Symbol 1 id"});
        await user.clear(input);
        await user.type(input, "B");
        await user.tab();
        expect(await screen.findByText(/already exists/)).toBeVisible();
        expect(JSON.parse(screen.getByLabelText("Retained draft").textContent!)).toEqual({symbols: ["A", "B"], reelSequences: [null, {type: "weighted", variants: [null, {symbols: ["A"]}]}]});
    });
    it("falls back to the rendered server filesystem browser when native artwork picking is unavailable", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "No graphical display."}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/assets",
                    displayPath: "/assets",
                    entries: [{name: "symbol.png", isDirectory: false}],
                },
            }),
            "/api/home/blueprints/symbol-artwork/import": () => ({ok: true, status: 200, body: {status: "ok", reference: "assets/symbols/A.png"}}),
        });

        renderWithProviders(<Harness />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Select PNG"}));

        await user.click(await screen.findByRole("button", {name: "symbol.png"}));

        expect(await screen.findByRole("button", {name: "Change"})).toBeVisible();
        const imported = calls.find((call) => call.url === "/api/home/blueprints/symbol-artwork/import");
        expect(JSON.parse(imported!.init!.body!)).toEqual({sourcePath: "/assets/symbol.png"});
    });
});
