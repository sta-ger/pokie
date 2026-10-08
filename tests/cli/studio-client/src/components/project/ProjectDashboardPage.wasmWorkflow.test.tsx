import {webcrypto} from "crypto";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {TextEncoder, TextDecoder} from "util";
import {StudioServer} from "../../../../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioJobService} from "../../../../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {createProductionParityFixture} from "../../../../../fixtures/wasm/createProductionParityFixture.js";
import {screen, waitFor} from "@testing-library/react";
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
        expect(screen.getByText(/separate JavaScript evaluateWinMultiplier/)).toHaveTextContent("30 total stop bits across all reels");
        expect(screen.getByText(/separate JavaScript evaluateWinMultiplier/)).toHaveTextContent("Rejects ways, clusters, mechanics.freeGames, and nonempty betModes");
        expect(screen.getByText("Artifact ABI")).toBeInTheDocument();
        expect(screen.getByText("pokie/wasm")).toBeInTheDocument();
        expect(screen.getByText("4096")).toBeInTheDocument();
        expect(screen.getByText("sha256:component-bytes")).toBeInTheDocument();
        expect(screen.getByText("sha256:configuration")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Play"}));
        expect(await screen.findByText(/Play prepares this game/)).toBeInTheDocument();
    });

    it("renders the real built artifact's first and subsequent Node-compatible rounds over Studio HTTP", async () => {
        // jsdom omits these browser globals; use Node's equivalent implementation.
        const crypto = Reflect.getOwnPropertyDescriptor(globalThis, "crypto");
        Reflect.defineProperty(globalThis, "crypto", {value: webcrypto, configurable: true});
        const encoder = Reflect.getOwnPropertyDescriptor(globalThis, "TextEncoder");
        const decoder = Reflect.getOwnPropertyDescriptor(globalThis, "TextDecoder");
        Reflect.defineProperty(globalThis, "TextEncoder", {value: TextEncoder, configurable: true});
        Reflect.defineProperty(globalThis, "TextDecoder", {value: TextDecoder, configurable: true});
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-wasm-rendered-"));
        const fixture = await createProductionParityFixture(directory);
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: directory,
            homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            projectRegistrationService: new StudioProjectRegistrationService(),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs"))),
            initialContext: {mode: "project", projectRoot: fixture.artifact},
        });
        const address = await server.start();
        const responses: {url: string; body: unknown}[] = [];
        const fetchImpl: FetchLike = (url, init) => new Promise((resolve, reject) => {
            const request = http.request(`http://${address.host}:${address.port}${url}`, {method: init?.method, headers: init?.headers}, (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => {
                    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    responses.push({url, body});
                    resolve({ok: (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500, json: () => Promise.resolve(body)});
                });
            });
            request.on("error", reject);
            request.end(init?.body);
        });
        let unmount: (() => void) | undefined;
        try {
            const user = userEvent.setup();
            await waitFor(async () => {
                const context = await (await fetchImpl("/api/project/context")).json();
                if ((context as {status: string}).status === "error") throw new Error(JSON.stringify(context));
                expect(context).toMatchObject({status: "loaded"});
            });
            const rendered = renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(fixture.artifact)}/overview`]});
            unmount = rendered.unmount;
            await screen.findByRole("heading", {name: "rng-parity"});
            await user.click(screen.getByRole("button", {name: "Play"}));
            await user.click(await screen.findByRole("button", {name: "Show advanced details (seed)"}));
            await user.type(screen.getByLabelText("Seed (optional)"), "0");
            await user.click(screen.getByRole("button", {name: "New Play session"}));
            await user.click(await screen.findByRole("button", {name: "Spin"}));
            expect(await screen.findByText(/Round complete — no win/)).toBeVisible();
            await user.click(await screen.findByText("Inspect round artifact"));
            await user.click(await screen.findByRole("button", {name: "Show advanced details (raw JSON, debug data)"}));
            expect(await screen.findByText((content) => content.includes('"schemaVersion": "pokie.state.v2"') && content.includes('"drawCount": 4') && content.includes('"sequence": 1') && content.includes('"rngState": 3921318019'))).toBeVisible();
            await user.click(screen.getByRole("button", {name: "Spin"}));
            expect(await screen.findByText(/You won 1\.00/)).toBeVisible();
            expect(await screen.findByText((content) => content.includes('"sequence": 2') && content.includes('"rngState"'))).toBeVisible();
            const initial = responses.find(({url}) => url === "/api/project/play/session");
            expect(initial?.body).toMatchObject({session: {debug: {stateAfter: {schemaVersion: "pokie.state.v2", drawCount: 2, sequence: 0, rngState: 258186393}}}});
            const spins = responses.filter(({url}) => url.endsWith("/spin"));
            expect(spins.map(({body}) => body)).toEqual([
                expect.objectContaining({session: expect.objectContaining({screen: [["A"], ["B"]], win: 0, credits: 999})}),
                expect.objectContaining({session: expect.objectContaining({screen: [["B"], ["B"]], win: 1, credits: 999})}),
            ]);
        } finally {
            unmount?.();
            await server.stop();
            await fixture.release();
            fs.rmSync(directory, {recursive: true, force: true});
            if (crypto === undefined) Reflect.deleteProperty(globalThis, "crypto");
            else Reflect.defineProperty(globalThis, "crypto", crypto);
            if (encoder === undefined) Reflect.deleteProperty(globalThis, "TextEncoder");
            else Reflect.defineProperty(globalThis, "TextEncoder", encoder);
            if (decoder === undefined) Reflect.deleteProperty(globalThis, "TextDecoder");
            else Reflect.defineProperty(globalThis, "TextDecoder", decoder);
        }
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
