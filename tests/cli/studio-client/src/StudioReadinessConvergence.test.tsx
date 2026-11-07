import {cleanup, screen, waitFor} from "@testing-library/react";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {passthroughRuntimePackageResolver} from "../../../../cli/materialize/materializeRuntimePackage.js";
import {PokiePathResolver} from "../../../../cli/paths/PokiePathResolver.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient.js";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";

function writeStudioAssets(root: string): void {
    fs.writeFileSync(path.join(root, "index.html"), "<html>studio</html>");
    fs.writeFileSync(path.join(root, "main.js"), "console.log('studio');");
    fs.writeFileSync(path.join(root, "style.css"), "body { margin: 0; }");
}

function createServerFetch(baseUrl: string): FetchLike {
    return (url, init) => new Promise((resolve, reject) => {
        const request = http.request(`${baseUrl}${url}`, {
            method: init?.method,
            headers: init?.headers,
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                resolve({
                    ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
                    status: response.statusCode ?? 500,
                    json: () => Promise.resolve(JSON.parse(body)),
                });
            });
        });
        request.on("error", reject);
        request.end(init?.body);
    });
}

describe("Studio readiness convergence (browser, real Studio HTTP)", () => {
    let studioRoot: string;
    let workDir: string;
    let projectRoot: string;
    let server: StudioServer;
    let fetchImpl: FetchLike;
    let repository: FileStudioJobRepository;
    let appDataDirectory: jest.SpyInstance;
    let shutdown: Promise<void> | undefined;

    async function stopServer(): Promise<void> {
        cleanup();
        shutdown ??= server.stop();
        await shutdown;
        expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
    }

    beforeEach(async () => {
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-readiness-assets-"));
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-readiness-project-"));
        appDataDirectory = jest.spyOn(PokiePathResolver.prototype, "resolveAppDataDirectory")
            .mockReturnValue(path.join(workDir, "app-data"));
        repository = new FileStudioJobRepository(path.join(workDir, "jobs"));
        shutdown = undefined;
        writeStudioAssets(studioRoot);
        projectRoot = path.join(workDir, "ready-slot.blueprint.json");
        fs.writeFileSync(projectRoot, JSON.stringify({
            manifest: {id: "ready-slot", name: "Ready Slot", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}},
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
        }));
        const homeService = new StudioHomeService("1.0.0");
        server = new StudioServer({
            pokieVersion: "1.0.0", host: "127.0.0.1", port: 0, studioRoot,
            homeService,
            // Each HTTP fixture owns its durable jobs, even when other suites
            // are using the default application-data directory concurrently.
            jobService: new StudioJobService(repository),
            blueprintService: new StudioBlueprintService("1.0.0", studioRoot, homeService),
            loadGame: () => Promise.resolve({getManifest: () => ({id: "ready-slot", name: "Ready Slot", version: "1.0.0"})}) as never,
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver,
            initialContext: {mode: "project", projectRoot},
        });
        const address = await server.start();
        const baseUrl = `http://${address.host}:${address.port}`;
        fetchImpl = createServerFetch(baseUrl);
    });

    afterEach(async () => {
        // Stop rendered polling before draining the HTTP listener.
        try {
            await stopServer();
        } finally {
            appDataDirectory.mockRestore();
            fs.rmSync(studioRoot, {recursive: true, force: true});
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("renders the same real server validation result after the retired validation route recovers to Overview", async () => {
        const validationResponse = await fetchImpl("/api/project/validate");
        expect(validationResponse.ok).toBe(true);
        await expect(validationResponse.json()).resolves.toMatchObject({valid: true, errors: []});

        const legacyPath = `/project/${encodeURIComponent(projectRoot)}/validation`;
        const {router} = renderRoutedApp({fetchImpl, initialEntries: [legacyPath]});

        await screen.findByRole("heading", {name: "Ready Slot"});
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(projectRoot)}/overview`));
        expect(screen.getByText(/Validate is now part of Overview diagnostics/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Overview"})).toHaveAttribute("aria-current", "page");
        await screen.findByText(/Valid, with warnings/);
    });

    it("drains its own job store without reconciling another owner's active jobs", async () => {
        const otherRepository = new FileStudioJobRepository(path.join(workDir, "app-data", "studio-jobs"));
        const otherJobs = new StudioJobService(otherRepository);
        const started = otherJobs.start({projectId: projectRoot, operation: "simulation", request: {}, conflictKey: projectRoot});
        expect(started.status).toBe("created");
        if (started.status !== "created") throw new Error("Expected a new job for the other owner.");
        otherJobs.markRunning(started.job.id);
        const retained = otherRepository.get(started.job.id);
        try {
            await stopServer();
            expect(repository.list()).toEqual([]);
            expect(otherRepository.get(started.job.id)).toEqual(retained);
            expect(otherRepository.getProcessState()?.status).toBe("running");
        } finally {
            otherJobs.beginShutdown();
            otherJobs.cancelled(started.job.id);
            await otherJobs.completeGracefulShutdown();
        }
    });
});
