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
                body: {status: "loaded", projectRoot: "/games/game.wasm", game, type: "wasm", capabilities: ["wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.runtime.replay", "wasm.runtime.execute", "wasm.manifest.read", "wasm.artifact.inspect"]},
            }),
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/game.wasm",
                    valid: true,
                    wasmManifest: {
                        component: game,
                        schemaVersion: "1.0.0",
                        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
                        host: {rng: "pokie.rng.v1", services: ["clock.v1"]},
                        capabilities: ["round.play", "round.replay"],
                        minPokieVersion: "1.2.3",
                        artifact: {
                            format: "pokie.wasm.v1",
                            abiVersion: "1.0.0",
                            adapter: "pokie/wasm",
                            bytes: 4096,
                            sha256: "sha256:component-bytes",
                            configurationHash: "sha256:configuration",
                        },
                    },
                },
            }),
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
        expect(screen.queryByRole("button", {name: "Build / Export"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Certification"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Provably Fair"})).not.toBeInTheDocument();
        expect(await screen.findByRole("table", {name: "Declared WASM component manifest"})).toBeInTheDocument();
        expect(screen.getAllByText("wasm-slot").length).toBeGreaterThan(1);
        expect(screen.getByText("pokie.session.v1")).toBeInTheDocument();
        expect(screen.getByText("clock.v1")).toBeInTheDocument();
        expect(screen.getByText("round.play, round.replay")).toBeInTheDocument();
        expect(screen.getByText("1.2.3")).toBeInTheDocument();
        expect(screen.getAllByText("1.0.0").length).toBeGreaterThan(1);
        expect(screen.getByText("Artifact ABI")).toBeInTheDocument();
        expect(screen.getByText("pokie/wasm")).toBeInTheDocument();
        expect(screen.getByText("4096")).toBeInTheDocument();
        expect(screen.getByText("sha256:component-bytes")).toBeInTheDocument();
        expect(screen.getByText("sha256:configuration")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Play"}));
        expect(await screen.findByText(/Play prepares this game/)).toBeInTheDocument();
    });

    it.each([
        ["replay-only", ["wasm.canonical", "wasm.runtime.replay", "wasm.manifest.read"], false, false, true],
        ["play-only", ["wasm.canonical", "wasm.runtime.play", "wasm.manifest.read"], true, true, false],
        ["serialize-only", ["wasm.canonical", "wasm.runtime.serialize", "wasm.manifest.read"], false, false, false],
        ["complete bundle", ["wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.runtime.replay", "wasm.runtime.execute", "wasm.manifest.read"], true, true, true],
    ])("shows only executable controls for a %s canonical artifact", async (_name, capabilities, play, simulation, replay) => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/game.wasm", game, type: "wasm", capabilities},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/game.wasm", valid: true}}),
            "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: "/games/game.wasm", valid: true, game, errors: [], warnings: [], suggestions: []}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "wasm-slot"});
        expect(screen.queryByRole("button", {name: "Play"})).toEqual(play ? expect.anything() : null);
        expect(screen.queryByRole("button", {name: "Simulation"})).toEqual(simulation ? expect.anything() : null);
        expect(screen.queryByRole("button", {name: "Replay"})).toEqual(replay ? expect.anything() : null);
    });
});
