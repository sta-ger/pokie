import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const game = {id: "wasm-slot", name: "wasm-slot", version: "1.0.0"};

describe("ProjectDashboardPage canonical WASM workflow", () => {
    it("renders the ordinary capability-driven play, simulation, and replay navigation", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/game.wasm", game, type: "wasm", capabilities: ["runtime.execute", "wasm.manifest.read"]},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/game.wasm", valid: true, wasmManifest: {component: game}}}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/game.wasm", valid: true, game, errors: [], warnings: [], suggestions: []}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "wasm-slot"});
        expect(screen.getByRole("button", {name: "Play"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Simulation"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Replay"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Play"}));
        expect(await screen.findByText(/Play prepares this game/)).toBeInTheDocument();
    });
});
