import {act, cleanup, screen, waitFor} from "@testing-library/react";
import fs from "fs";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {PokiePathResolver} from "../../../../cli/paths/PokiePathResolver.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {createStudioHttpTestClient} from "./testUtils/createStudioHttpTestClient";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

describe("PC-16 Studio context lifecycle (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let workDir: string;
    let firstProject: string;
    let secondProject: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let client: ReturnType<typeof createStudioHttpTestClient>;
    let repository: FileStudioJobRepository;
    let jobs: StudioJobService;
    let foreignRepository: FileStudioJobRepository;
    let foreignJob: ReturnType<StudioJobService["markRunning"]>;
    let defaultDirectory: jest.SpyInstance;
    let shutdown: Promise<void> | undefined;
    let expectCleanupFailure: boolean;
    let afterNextLoad: (() => Promise<void>) | undefined;

    function stopStudio(): Promise<void> {
        shutdown ??= (async () => {
            cleanup();
            const started = performance.now();
            await client.drain();
            const httpMs = Math.round(performance.now() - started);
            await server.stop();
            console.info(`Studio fixture drained: ${JSON.stringify({httpMs, shutdownMs: Math.round(performance.now() - started), requests: client.timings})}`);
        })();
        return shutdown;
    }

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-context-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc16-context-projects-"));
        writeStudioAssets(studioRoot);
        shutdown = undefined;
        expectCleanupFailure = false;
        afterNextLoad = undefined;
        const appData = path.join(workDir, "profile");
        defaultDirectory = jest.spyOn(PokiePathResolver.prototype, "resolveAppDataDirectory").mockReturnValue(appData);
        repository = new FileStudioJobRepository(path.join(workDir, "jobs"));
        jobs = new StudioJobService(repository);
        foreignRepository = new FileStudioJobRepository(path.join(appData, "studio-jobs"));
        firstProject = path.join(workDir, "first.blueprint.json");
        secondProject = path.join(workDir, "second.blueprint.json");
        for (const [projectRoot, id, name] of [[firstProject, "first", "First Slot"], [secondProject, "second", "Second Slot"]] as const) {
            fs.writeFileSync(projectRoot, JSON.stringify({
                manifest: {id, name, version: "1.0.0"},
                reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}},
                reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
        }
        const loadGame = (async (projectRoot: string) => {
            const afterLoad = afterNextLoad;
            afterNextLoad = undefined;
            await afterLoad?.();
            return {getManifest: () => ({
                id: projectRoot === firstProject ? "first" : "second",
                name: projectRoot === firstProject ? "First Slot" : "Second Slot",
                version: "1.0.0",
            })};
        }) as never;
        const homeService = new StudioHomeService("1.0.0", undefined, loadGame, undefined, passthroughRuntimePackageResolver);
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            jobService: jobs,
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            loadGame,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot: firstProject},
        });
        const address = await server.start();
        client = createStudioHttpTestClient(`http://${address.host}:${address.port}`);
        fetchImpl = client.fetchImpl;
        // Another listener can publish after this listener's restart reconciliation.
        const foreignJobs = new StudioJobService(foreignRepository);
        const started = foreignJobs.start({projectId: workDir, operation: "project-open-materialization", request: {}, conflictKey: workDir});
        if (started.status !== "created") throw new Error("Expected an unrelated fixture job.");
        foreignJob = foreignJobs.markRunning(started.job.id);
    });

    afterEach(async () => {
        try {
            if (expectCleanupFailure) {
                await expect(stopStudio()).rejects.toThrow("Studio shutdown could not confirm executor cleanup. Retained jobs require recovery.");
                expect(repository.getProcessState()?.status).toBe("running");
            } else {
                await stopStudio();
                expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
                expect(repository.list().every(job => !["queued", "running", "cancelling"].includes(job.status))).toBe(true);
            }
            expect(client.pending.size).toBe(0);
            expect(foreignRepository.list()).toEqual([foreignJob]);
            expect(foreignRepository.getProcessState()?.status).toBe("running");
        } finally {
            defaultDirectory.mockRestore();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("restores the exact historical project before its tab becomes interactive", async () => {
        const firstRoute = `/project/${encodeURIComponent(firstProject)}/overview`;
        const secondRoute = `/project/${encodeURIComponent(secondProject)}/overview`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [firstRoute]});

        await screen.findByRole("heading", {name: "First Slot"});
        await act(async () => {
            await router.navigate(secondRoute);
        });
        await screen.findByRole("heading", {name: "Second Slot"});
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        expect(screen.queryByText("First Slot")).not.toBeInTheDocument();

        await act(async () => {
            await router.navigate(-1);
        });
        await screen.findByRole("heading", {name: "First Slot"});
        await waitFor(() => expect(router.state.location.pathname).toBe(firstRoute));
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
    });

    it("drains an accepted project-open response before closing HTTP and removing fixtures", async () => {
        renderRoutedApp({fetchImpl, initialEntries: [`/project/${encodeURIComponent(firstProject)}/overview`]});
        await screen.findByRole("heading", {name: "First Slot"});
        let release!: () => void;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        let entered = false;
        afterNextLoad = async () => {
            entered = true;
            await gate;
        };
        const opening = fetchImpl("/api/home/projects/open", {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({projectRoot: secondProject}),
        });
        try {
            await waitFor(() => expect(entered).toBe(true));
            const stopping = stopStudio();
            expect(client.pending.size).toBeGreaterThan(0);
            expect(repository.getProcessState()?.status).toBe("running");
            expect(fs.existsSync(secondProject)).toBe(true);
            release();
            const response = await opening;
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({context: {mode: "project", projectRoot: secondProject}, manifest: {name: "Second Slot"}});
            await stopping;
            expect(repository.list()).toEqual(expect.arrayContaining([expect.objectContaining({operation: "project-open-materialization", status: "completed"})]));
            expect(client.pending.size).toBe(0);
        } finally {
            release();
            await opening;
            await stopStudio();
        }
    });

    it("settles aborted HTTP requests before shutdown", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(fetchImpl("/api/context", {signal: controller.signal})).rejects.toMatchObject({name: "AbortError"});
        await client.drain();
        expect(client.pending.size).toBe(0);
    });

    it("rejects shutdown when this listener's own executor never confirms cleanup", async () => {
        const started = jobs.start({projectId: workDir, operation: "project-open-materialization", request: {}, conflictKey: workDir});
        if (started.status !== "created") throw new Error("Expected an owned fixture job.");
        jobs.markRunning(started.job.id);
        expectCleanupFailure = true;
        await expect(stopStudio()).rejects.toThrow("Studio shutdown could not confirm executor cleanup. Retained jobs require recovery.");
        expect(repository.get(started.job.id)).toMatchObject({status: "recovery-required", recovery: {action: "retry"}});
        expect(repository.getProcessState()?.status).toBe("running");
    });
});
