import {cleanup, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {resolvePokieGameDependencyRoots} from "@fromstan/pokie";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {BuildCommand} from "../../../../cli/commands/BuildCommand.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {createStudioGameLoader} from "../../../../cli/studio/loadStudioGame.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../../../v2/fixtures/PackageExtractionFixture.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

function createServerFetch(baseUrl: string, observe: (url: string, method: string, status: number, body: unknown) => void): FetchLike {
    return (url, init) => new Promise((resolve, reject) => {
        const signal = init?.signal;
        const release = () => signal?.removeEventListener("abort", abort);
        const fail = (error: Error) => {
            release();
            reject(error);
        };
        const request = http.request(`${baseUrl}${url}`, {
            method: init?.method, headers: {...init?.headers, Connection: "close"}, agent: false,
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("error", fail);
            response.on("end", () => {
                release();
                try {
                    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    observe(url, init?.method ?? "GET", response.statusCode ?? 500, body);
                    resolve({
                        ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
                        status: response.statusCode ?? 500,
                        json: () => Promise.resolve(body),
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
        const abort = () => request.destroy(Object.assign(new Error("Studio test request aborted"), {name: "AbortError"}));
        request.on("error", fail);
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, {once: true});
        request.end(init?.body);
    });
}

describe("PC-16 Studio product sweep (browser, real Studio HTTP)", () => {
    let restoreTemporaryDirectory: () => void;
    let studioRoot: string;
    let projectRoot: string;
    let workDir: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let simulationAdmission: {status: number; body: unknown} | undefined;
    let simulationStatus: unknown;
    let simulationSubmissions: number;
    let repository: FileStudioJobRepository;
    let shutdown: Promise<void> | undefined;
    let shutdownPhase: "mounted" | "http" | "server" | "removed";
    let afterNextGameLoad: (() => Promise<void>) | undefined;
    const pendingRequests = new Set<ReturnType<FetchLike>>();
    const requestTimings: Array<{url: string; elapsedMs: number; outcome: number | string}> = [];

    function runtimeSnapshots(): string[] {
        return fs.readdirSync(path.dirname(workDir)).filter(name => name.startsWith("pokie-runtime-"));
    }

    function stopStudio(): Promise<void> {
        shutdown ??= (async () => {
            // Unmount stops producers, but does not await their already-started
            // estimate/validation requests. HTTP listener closure also precedes
            // delivery of the final response to this Node client.
            cleanup();
            const started = performance.now();
            shutdownPhase = "http";
            while (pendingRequests.size > 0) await Promise.allSettled([...pendingRequests]);
            console.info(`PC16 HTTP drain: ${JSON.stringify({elapsedMs: Math.round(performance.now() - started), requests: requestTimings.filter(request => request.url !== "/api/project/context")})}`);
            shutdownPhase = "server";
            await server.stop();
            expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
            expect(repository.list().every(job => !["queued", "running", "cancelling"].includes(job.status))).toBe(true);
            expect(runtimeSnapshots()).toEqual([]);
            expect(pendingRequests.size).toBe(0);
            console.info(`PC16 shutdown completed: ${Math.round(performance.now() - started)}ms`);
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
            shutdownPhase = "removed";
        })();
        return shutdown;
    }

    beforeAll(() => {
        // These real HTTP/Studio consumers execute generated JavaScript;
        // no workflow compiles against declarations or reads source maps.
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment({runtimeFilesOnly: true, memoryBacked: true});
    });

    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(async () => {
        shutdown = undefined;
        shutdownPhase = "mounted";
        afterNextGameLoad = undefined;
        pendingRequests.clear();
        requestTimings.length = 0;
        simulationAdmission = undefined;
        simulationStatus = undefined;
        simulationSubmissions = 0;
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-sweep-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-sweep-project-"));
        writeStudioAssets(studioRoot);
        const blueprintPath = path.join(workDir, "sweep.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify({
            manifest: {id: "sweep", name: "Sweep Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 2}},
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        const generatedPackage = path.join(workDir, "generated-package");
        expect(await new BuildCommand("1.0.0").run([blueprintPath, "--target", "tsPackage", "--out", generatedPackage])).toBe(0);
        projectRoot = generatedPackage;
        const homeService = new StudioHomeService("1.0.0");
        repository = new FileStudioJobRepository(path.join(workDir, "jobs"));
        const loadGame = createStudioGameLoader(process.cwd());
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            jobService: new StudioJobService(repository),
            loadGame: async root => {
                const game = await loadGame(root);
                const afterLoad = afterNextGameLoad;
                afterNextGameLoad = undefined;
                await afterLoad?.();
                return game;
            },
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot},
        });
        const address = await server.start();
        const network = createServerFetch(`http://${address.host}:${address.port}`, (url, method, status, body) => {
            if (url === "/api/project/simulations" && method === "POST") simulationAdmission = {status, body};
            if (url.startsWith("/api/project/simulations/") && method === "GET") simulationStatus = body;
        });
        fetchImpl = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") simulationSubmissions++;
            const started = performance.now();
            const request = network(url, init);
            pendingRequests.add(request);
            const settled = (outcome: number | string) => {
                pendingRequests.delete(request);
                requestTimings.push({url, elapsedMs: Math.round(performance.now() - started), outcome});
            };
            // Both branches settle the tracker without creating an unhandled
            // rejection; the caller still receives the original HTTP result.
            request.then(response => settled(response.status), error => settled(String(error)));
            return request;
        };
    });

    // These real snapshot reads already have a 120s phase budget. The default
    // 60s hook truncated their cleanup under the controller's concurrent lane.
    // Join the same drain if a timed-out test callback is still in its finally.
    afterEach(() => stopStudio(), 300000);

    it("drains an unfinished real Outcome Library estimate before retiring its runtime fixtures", async () => {
        await waitFor(async () => {
            const response = await fetchImpl("/api/project/context");
            expect(await response.json()).toMatchObject({status: "loaded"});
        }, {timeout: PACKAGE_EXTRACTION_TEST_TIMEOUT - 10_000});
        let resume!: () => void;
        const gate = new Promise<void>(resolve => {
            resume = resolve;
        });
        let loaded = false;
        afterNextGameLoad = async () => {
            loaded = true;
            await gate;
        };
        const estimate = fetchImpl("/api/project/outcome-libraries/generate/estimate", {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({generation: "default"}),
        });
        try {
            await waitFor(() => expect(loaded).toBe(true), {timeout: PACKAGE_EXTRACTION_TEST_TIMEOUT - 10_000});
            expect(runtimeSnapshots().length).toBeGreaterThan(0);
            const stopping = stopStudio();
            expect(shutdownPhase).toBe("http");
            expect(repository.getProcessState()?.status).not.toBe("gracefully-stopped");
            expect(fs.existsSync(projectRoot)).toBe(true);
            resume();
            const response = await estimate;
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({status: "ok"});
            await stopping;
            expect(shutdownPhase).toBe("removed");
        } finally {
            resume();
            await estimate;
            await stopStudio();
        }
    }, 300000);

    it("turns a retired deep link into one visible recovery path without mounting a duplicate workflow", async () => {
        expect((await resolvePokieGameDependencyRoots(projectRoot))["@fromstan/pokie"])
            .toBe(fs.realpathSync(path.join(os.tmpdir(), "node_modules/@fromstan/pokie")));
        const user = userEvent.setup();
        const route = `/project/${encodeURIComponent(projectRoot)}/deployment`;
        // Startup snapshots the installed runtime/dependency graph. Observe its actual
        // terminal context before the short rendered-navigation assertion starts.
        await waitFor(async () => {
            const context = await fetchImpl("/api/project/context");
            expect(context.status).toBe(200);
            expect(await context.json()).toMatchObject({status: "loaded", projectRoot, game: {name: "Sweep Slot"}});
        }, {timeout: PACKAGE_EXTRACTION_TEST_TIMEOUT - 10_000});
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [route]});

        await screen.findByRole("heading", {name: "Sweep Slot"}, {timeout: 30000});
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(projectRoot)}/exportDeploy`));
        expect(screen.getByText("Deployment has moved into Build/Export. Choose Remote delivery there to preview or publish to a configured target.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Build/Export"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByRole("button", {name: "Deployment"})).not.toBeInTheDocument();

        const runSimulation = screen.getByRole("button", {name: "Simulation"});
        await user.click(runSimulation);
        const rounds = await screen.findByRole("textbox", {name: "Rounds"});
        await user.clear(rounds);
        await user.type(rounds, "2");
        const run = screen.getByRole("button", {name: "Run Simulation"});
        await waitFor(() => expect(run).toBeEnabled());
        await user.click(run);
        await waitFor(() => expect(simulationSubmissions).toBe(1));
        // The capability check resolves package configuration provenance before
        // admission returns, acquiring its own real runtime snapshot.
        const simulationWait = {
            timeout: PACKAGE_EXTRACTION_TEST_TIMEOUT - 10_000,
            onTimeout: (error: Error) => new Error(`${error.message}\nActual simulation request/admission/status: ${JSON.stringify({simulationSubmissions, simulationAdmission, simulationStatus})}\nRendered state: ${document.body.textContent}`),
        };
        await waitFor(() => expect(simulationAdmission).toMatchObject({status: 202, body: {id: expect.any(String)}}), simulationWait);
        // Keep the HTTP/service event loop available during runtime preparation.
        // Repeated accessible-name scans of the full live dashboard can starve
        // its real copier and cleanup while the report control does not exist.
        await waitFor(() => expect(simulationStatus).toMatchObject({status: "completed", rounds: 2, report: {rounds: 2}}), simulationWait);
        // Completion opens Review automatically; still prove the rendered result.
        await screen.findByRole("button", {name: "Open full report"});
        expect(simulationSubmissions).toBe(1);
        expect(screen.queryByText(/Deployment has moved into Build\/Export/)).not.toBeInTheDocument();
    }, 300000);
});
