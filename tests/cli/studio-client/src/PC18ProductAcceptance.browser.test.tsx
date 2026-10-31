import {act, cleanup, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import {Worker} from "node:worker_threads";
import {StudioArtifactBuildService} from "../../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import http from "http";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioArtifactConversionPlanningService} from "../../../../cli/studio/artifacts/StudioArtifactConversionPlanningService.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import {computeGameBlueprintHash} from "../../../../src/generated/computeGameBlueprintHash.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {buildFixtureGame} from "../../../weightedoutcome/generate/GenerateTestFixtures.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

import {installNodeServiceTimers} from "./testUtils/nodeServiceTimers";

let restoreNodeServiceTimers: () => void;
beforeAll(() => {
    restoreNodeServiceTimers = installNodeServiceTimers();
});
afterAll(() => restoreNodeServiceTimers());

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "");
    fs.writeFileSync(path.join(root, "style.css"), "");
}

function createServerFetch(baseUrl: string): FetchLike {
    return (url, init) => new Promise((resolve, reject) => {
        const request = http.request(`${baseUrl}${url}`, {method: init?.method, headers: init?.headers}, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => resolve({
                ok: (response.statusCode ?? 500) < 300, status: response.statusCode ?? 500,
                json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
            }));
        });
        request.on("error", reject);
        request.end(init?.body);
    });
}

describe("PC-18 Studio product acceptance", () => {
    it.each(["preview", "targets", "gameModel"].flatMap(surface =>
        ["shutdown", "project close"].map(action => ({surface, action})),
    ))("drains a disconnected $surface executor before $action completes", async ({surface, action}) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-preflight-drain-"));
        const project = path.join(root, "package");
        fs.mkdirSync(project);
        fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({name: "preflight-slot", version: "1.0.0", pokie: {entry: "index.js"}}));
        fs.writeFileSync(path.join(project, "index.js"), "module.exports = {};\n");
        writeStudioAssets(root);
        const loadGame = () => Promise.resolve({getManifest: () => ({id: "preflight-slot", name: "Preflight Slot", version: "1.0.0"})}) as never;
        const home = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        const repository = new FileStudioJobRepository(path.join(root, "jobs"));
        const artifacts = new StudioArtifactBuildService("1.0.0");
        let started!: () => void;
        const entered = new Promise<void>(resolve => {
            started = resolve;
        });
        let aborted!: () => void;
        const cancellation = new Promise<void>(resolve => {
            aborted = resolve;
        });
        let release!: () => void;
        const cleanupGate = new Promise<void>(resolve => {
            release = resolve;
        });
        let worker: Worker | undefined;
        let drained = false;
        const jobs = new StudioJobService(repository);
        const completeShutdown = jobs.completeGracefulShutdown.bind(jobs);
        const shutdownMarker = jest.spyOn(jobs, "completeGracefulShutdown").mockImplementation(async confirmed => {
            if (worker && confirmed !== false) expect(drained).toBe(true);
            await completeShutdown(confirmed);
        });
        const execute = async (signal?: AbortSignal): Promise<never> => {
            if (!signal) throw new Error("Preflight executor needs its request signal.");
            const ownedWorker = new Worker("require('node:worker_threads').parentPort.on('message', () => {});", {eval: true, execArgv: []});
            worker = ownedWorker;
            signal.addEventListener("abort", aborted, {once: true});
            if (signal.aborted) aborted();
            try {
                await new Promise<void>((resolve, reject) => {
                    ownedWorker.once("online", resolve);
                    ownedWorker.once("error", reject);
                });
                started();
                await cancellation;
                await cleanupGate;
            } finally {
                signal.removeEventListener("abort", aborted);
                await ownedWorker.terminate();
                drained = true;
            }
            throw new Error("Preflight cancelled after Worker cleanup.");
        };
        const preview = jest.spyOn(artifacts, "preview").mockImplementation((_root, _target, _out, signal) => execute(signal));
        const targets = jest.spyOn(artifacts, "listTargets").mockImplementation((_root, signal) => execute(signal));
        const model = jest.spyOn(artifacts, "extractPackageModel").mockImplementation((_root, signal) => execute(signal));
        const server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot: root, homeService: home,
            blueprintService: new StudioBlueprintService("1.0.0", root, home), loadGame,
            jobService: jobs, artifactBuildService: artifacts,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver, initialContext: {mode: "project", projectRoot: project},
        });
        let request: http.ClientRequest | undefined;
        let stopping: Promise<void> | undefined;
        try {
            const address = await server.start();
            const base = `http://${address.host}:${address.port}`;
            const urls: Record<string, string> = {preview: "/api/project/artifacts/preview", targets: "/api/project/artifacts/targets", gameModel: "/api/project/gameModel"};
            const url = urls[surface];
            request = http.request(`${base}${url}`, {method: surface === "preview" ? "POST" : "GET", headers: {"Content-Type": "application/json"}}, response => response.resume());
            // Destroying the client is the real HTTP disconnect, not an executor mock result.
            request.on("error", () => undefined);
            request.end(surface === "preview" ? JSON.stringify({target: "wasm"}) : undefined);
            await entered;
            request.destroy();
            await cancellation;
            let completed = false;
            const transition = action === "shutdown" ? (stopping = server.stop())
                : createServerFetch(base)("/api/projects/close", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({confirmActiveJobs: true})})
                    .then(async response => {
                        expect(drained).toBe(true);
                        expect(response.status).toBe(200);
                        expect(await response.json()).toMatchObject({context: {mode: "home"}});
                    });
            transition.then(() => {
                completed = true;
            }, () => {
                completed = true;
            });
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
            expect(completed).toBe(false);
            expect(drained).toBe(false);
            expect(worker!.threadId).toBeGreaterThan(0);
            expect(repository.getProcessState()?.status).not.toBe("gracefully-stopped");
            release();
            await transition;
            expect(drained).toBe(true);
            expect(worker!.threadId).toBe(-1);
            if (action === "shutdown") expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
        } finally {
            release();
            request?.destroy();
            await (stopping ?? server.stop());
            await worker?.terminate();
            preview.mockRestore();
            targets.mockRestore();
            model.mockRestore();
            shutdownMarker.mockRestore();
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("does not make a prior project's visible dashboard interactive after a project switch", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-browser-assets-"));
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-browser-projects-"));
        writeStudioAssets(studioRoot);
        const first = path.join(workDir, "first.blueprint.json");
        const second = path.join(workDir, "second.blueprint.json");
        for (const [project, id, name] of [[first, "first", "First PC-18 Slot"], [second, "second", "Second PC-18 Slot"]] as const) {
            fs.writeFileSync(project, JSON.stringify({
                manifest: {id, name, version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"],
                paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
        }
        const loadGame = (project: string) => Promise.resolve({getManifest: () => ({
            id: project === first ? "first" : "second", name: project === first ? "First PC-18 Slot" : "Second PC-18 Slot", version: "1.0.0",
        })}) as never;
        const home = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        // Use a private durable profile even when another Jest worker starts Studio.
        const repository = new FileStudioJobRepository(path.join(studioRoot, "jobs"));
        const server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot, homeService: home,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, home), loadGame,
            jobService: new StudioJobService(repository),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver, initialContext: {mode: "project", projectRoot: first},
        });
        try {
            const address = await server.start();
            const {router} = renderRoutedApp({fetchImpl: createServerFetch(`http://${address.host}:${address.port}`), initialEntries: [`/project/${encodeURIComponent(first)}/overview`]});
            await screen.findByRole("heading", {name: "First PC-18 Slot"});
            await act(async () => {
                await router.navigate(`/project/${encodeURIComponent(second)}/simulation`);
            });
            await screen.findByRole("heading", {name: "Second PC-18 Slot"});
            await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(second)}/simulation`));
            expect(screen.queryByRole("heading", {name: "First PC-18 Slot"})).not.toBeInTheDocument();
        } finally {
            cleanup();
            await server.stop();
            expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("hands a rendered managed Blueprint Outcome Library action to a fresh canonical Stake plan", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-outcome-assets-"));
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc18-outcome-project-"));
        const blueprint = path.join(projectRoot, "blueprint.json");
        const source = {
            manifest: {id: "fixture-slot", name: "Fixture Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 5}},
            reelStrips: [["A", "A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        fs.writeFileSync(blueprint, JSON.stringify(source));
        writeStudioAssets(studioRoot);
        const fixture = buildFixtureGame();
        const loadGame = jest.fn(() => Promise.resolve({
            ...fixture,
            getManifest: () => source.manifest,
            getConfigHash: () => computeGameBlueprintHash(source),
        }) as never);
        const prepare = jest.spyOn(StudioArtifactConversionPlanningService.prototype, "prepare");
        const repository = new FileStudioJobRepository(path.join(studioRoot, "jobs"));
        const server = new StudioServer({
            pokieVersion: "1.0.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            jobService: new StudioJobService(repository),
            homeService: new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver),
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver)),
            loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: blueprint},
        });
        try {
            const address = await server.start();
            const requests: string[] = [];
            const serverFetch = createServerFetch(`http://${address.host}:${address.port}`);
            const fetchImpl: FetchLike = (url, init) => {
                requests.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
                return serverFetch(url, init);
            };
            const user = userEvent.setup();
            renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(blueprint)}/exportDeploy`]});

            await user.click(await screen.findByRole("button", {name: "Configure Outcome library generator"}));
            await screen.findByRole("button", {name: "Generate exact outcome library (base)"});
            await waitFor(() => expect(requests.filter((request) => request === "POST /api/project/outcome-libraries/generate/estimate").length).toBeGreaterThan(1));
            const generate = screen.getByRole("button", {name: "Generate exact outcome library (base)"});
            await waitFor(() => expect(generate).toBeEnabled());
            await user.click(generate);
            expect(await screen.findByText(/Generated .* outcomes for mode "base" using exact/, {}, {timeout: 10000})).toBeInTheDocument();
            expect(repository.list()).toEqual([
                expect.objectContaining({operation: "outcome-library-generation", status: "completed"}),
            ]);

            expect(prepare).toHaveBeenCalledWith(
                blueprint,
                "outcomeLibrary",
                path.join(projectRoot, "outcomelibrary"),
                expect.objectContaining({generationSemantics: "exact"}),
            );
            await waitFor(() => expect(requests.filter((request) => request === "POST /api/project/artifacts/preview").length).toBeGreaterThan(4));

            const stakeCard = screen.getByText("Stake Engine export", {selector: "p"}).closest('[data-pokie-lifecycle-form="artifact-build"]');
            expect(stakeCard).not.toBeNull();
            await user.click(within(stakeCard!).getByRole("button", {name: "Configure Stake Engine export"}));
            const build = within(stakeCard!).getByRole("button", {name: "Build"});
            await waitFor(() => expect(build).toBeEnabled());
        } finally {
            cleanup();
            prepare.mockRestore();
            await server.stop();
            expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }, 30000);
});
