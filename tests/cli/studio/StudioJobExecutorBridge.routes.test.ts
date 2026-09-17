import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioCertificationService} from "../../../cli/studio/certification/StudioCertificationService.js";
import {StudioDeploymentService} from "../../../cli/studio/deployment/StudioDeploymentService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import type {ProjectDashboardContext} from "../../../cli/studio/ProjectDashboardContext.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioPlayService} from "../../../cli/studio/runtime/StudioPlayService.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

async function post(url: string, body: unknown): Promise<{status: number; body: unknown}> {
    const response = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    return {status: response.status, body: await response.json()};
}

describe("StudioJobService executor bridge routes", () => {
    let directory: string;
    let projectRoot: string;
    let server: StudioServer | undefined;
    let jobs: StudioJobService;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-job-bridge-"));
        projectRoot = path.join(directory, "project");
        fs.mkdirSync(projectRoot);
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")), () => 100, () => "bridge-job");
    });
    afterEach(async () => {
        await server?.stop();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function start(
        certificationService: StudioCertificationService,
        jobService = jobs,
        services: {
            deploymentService?: StudioDeploymentService;
            playService?: StudioPlayService;
            blueprintService?: StudioBlueprintService;
            homeService?: StudioHomeService;
        } = {},
    ): Promise<string> {
        const home = services.homeService ?? new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: directory,
            homeService: home,
            blueprintService: services.blueprintService ?? new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot},
            jobService,
            certificationService,
            ...services,
        });
        const address = await server.start();
        return `http://${address.host}:${address.port}`;
    }

    it("reattaches an exact request and returns a typed conflict before another executor allocates domain work", async () => {
        let release: ((value: {status: "ok"; errors: never[]; warnings: never[]}) => void) | undefined;
        let executorStarted: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            executorStarted = resolve;
        });
        let domainRecords = 0;
        let scheduledWork = 0;
        const validateSourceBundle = jest.fn(() => new Promise<{status: "ok"; errors: never[]; warnings: never[]}>((resolve) => {
            domainRecords += 1;
            scheduledWork += 1;
            release = resolve;
            executorStarted?.();
        }));
        const baseUrl = await start({validateSourceBundle} as unknown as StudioCertificationService);

        const first = post(`${baseUrl}/api/project/certification/validate-source`, {bundleDir: "bundle"});
        await started;

        await expect(post(`${baseUrl}/api/project/certification/validate-source`, {bundleDir: "bundle"})).resolves.toMatchObject({
            status: 200,
            body: {status: "load-error", error: "Certification validation is already in progress for this exact request.", activeJobId: "bridge-job", reattached: true},
        });
        await expect(post(`${baseUrl}/api/project/certification/validate-source`, {bundleDir: "other-bundle"})).resolves.toMatchObject({
            status: 409,
            body: {activeJobId: "bridge-job", recovery: {action: "retry"}},
        });
        expect(validateSourceBundle).toHaveBeenCalledTimes(1);
        expect({domainRecords, scheduledWork}).toEqual({domainRecords: 1, scheduledWork: 1});

        release?.({status: "ok", errors: [], warnings: []});
        await expect(first).resolves.toEqual({status: 200, body: {status: "ok", errors: [], warnings: []}});
        await expect(get(`${baseUrl}/api/project/jobs/bridge-job`)).resolves.toMatchObject({
            status: 200,
            body: {status: "completed", result: {summary: "Certification source validation completed."}},
        });
    });

    it("keeps the cancellation handle through cleanup and terminalizes an executor exception", async () => {
        let executorSignal: AbortSignal | undefined;
        let cleanupStarted: (() => void) | undefined;
        const cleanupObserved = new Promise<void>((resolve) => {
            cleanupStarted = resolve;
        });
        let buildStarted: (() => void) | undefined;
        const executorStarted = new Promise<void>((resolve) => {
            buildStarted = resolve;
        });
        const build = jest.fn((_project: string, _bundle: string, _modes: unknown, _out: string, options?: {signal?: AbortSignal}) => new Promise<{status: "load-error"; error: string}>((resolve) => {
            executorSignal = options?.signal;
            buildStarted?.();
            options?.signal?.addEventListener("abort", () => {
                cleanupStarted?.();
                resolve({status: "load-error", error: "cleanup completed"});
            }, {once: true});
        }));
        const baseUrl = await start({build} as unknown as StudioCertificationService);
        const request = {bundleDir: "bundle", outDir: "certification", modes: [{modeName: "base", seed: "seed", sampleCount: 1}]};

        const first = post(`${baseUrl}/api/project/certification/build`, request);
        await executorStarted;
        expect(jobs.get(projectRoot, "bridge-job")).toMatchObject({status: "running"});
        await expect(post(`${baseUrl}/api/project/jobs/bridge-job/cancel`, {})).resolves.toMatchObject({status: 202, body: {status: "cancelling"}});
        expect(executorSignal?.aborted).toBe(true);
        await cleanupObserved;
        await expect(first).resolves.toEqual({status: 200, body: {status: "load-error", error: "cleanup completed"}});
        expect(jobs.get(projectRoot, "bridge-job")).toMatchObject({status: "cancelled", result: {summary: "Certification evidence build cancelled after staging cleanup."}});
        expect(jobs.signal("bridge-job")).toBeUndefined();

        const failedValidation = jest.fn(() => Promise.reject(new Error("executor exploded")));
        const failedJobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "failed-jobs")), () => 100, () => "failed-job");
        await server?.stop();
        const failedBaseUrl = await start({validateSourceBundle: failedValidation} as unknown as StudioCertificationService, failedJobs);
        await expect(post(`${failedBaseUrl}/api/project/certification/validate-source`, {bundleDir: "bundle"})).resolves.toEqual({status: 500, body: {error: "executor exploded"}});
        expect(failedJobs.get(projectRoot, "failed-job")).toMatchObject({status: "failed", error: "executor exploded"});
        expect(failedJobs.signal("failed-job")).toBeUndefined();
    });

    it("preserves a deployment executor's settled delivery outcome when common-job cancellation aborts it", async () => {
        let receivedSignal: AbortSignal | undefined;
        let started: (() => void) | undefined;
        const running = new Promise<void>((resolve) => {
            started = resolve;
        });
        const plan = {status: "available", source: {kind: "outcomeLibrary", capabilities: []}, target: {kind: "outcomeLibrary", capabilities: []}, steps: []};
        const run = jest.fn((_root: string, _request: unknown, options?: {signal?: AbortSignal}) => new Promise<unknown>((resolve) => {
            receivedSignal = options?.signal;
            started?.();
            options?.signal?.addEventListener("abort", () => resolve({
                status: "cancelled",
                deliveryOutcome: "delivered",
                plan,
                view: {delivery: {delivered: true}},
            }), {once: true});
        }));
        const baseUrl = await start(
            {} as StudioCertificationService,
            jobs,
            {deploymentService: {run} as unknown as StudioDeploymentService},
        );

        const request = post(`${baseUrl}/api/project/deployment/runs`, {targetId: "local", publish: true});
        await running;
        await expect(post(`${baseUrl}/api/project/jobs/bridge-job/cancel`, {})).resolves.toMatchObject({status: 202, body: {status: "cancelling"}});
        expect(receivedSignal?.aborted).toBe(true);
        await expect(request).resolves.toMatchObject({status: 200, body: {status: "unavailable"}});
        await expect(get(`${baseUrl}/api/project/jobs/bridge-job`)).resolves.toMatchObject({
            status: 200,
            body: {
                status: "cancelled",
                result: {
                    outputs: [{label: "Deployment delivery"}],
                    provenance: {targetId: "local", source: plan.source},
                    detail: {deliveryOutcome: "delivered", delivery: {delivered: true}},
                },
            },
        });
    });

    it("passes common-job cancellation to Play and retains the last settled session in its terminal result", async () => {
        let receivedSignal: AbortSignal | undefined;
        let started: (() => void) | undefined;
        const running = new Promise<void>((resolve) => {
            started = resolve;
        });
        const session = {id: "session", game: {id: "sample", name: "Sample", version: "1.0.0"}};
        const findAnyWin = jest.fn((_sessionId: string, options?: {signal?: AbortSignal}) => new Promise<unknown>((resolve) => {
            receivedSignal = options?.signal;
            started?.();
            options?.signal?.addEventListener("abort", () => resolve({status: "cancelled", session}), {once: true});
        }));
        const baseUrl = await start(
            {} as StudioCertificationService,
            jobs,
            {playService: {findAnyWin, reset: jest.fn()} as unknown as StudioPlayService},
        );

        const request = post(`${baseUrl}/api/project/play/sessions/session/find-any-win`, {});
        await running;
        await expect(post(`${baseUrl}/api/project/jobs/bridge-job/cancel`, {})).resolves.toMatchObject({status: 202, body: {status: "cancelling"}});
        expect(receivedSignal?.aborted).toBe(true);
        await expect(request).resolves.toEqual({status: 200, body: {status: "error", error: "Scenario search was cancelled after its last settled round."}});
        await expect(get(`${baseUrl}/api/project/jobs/bridge-job`)).resolves.toMatchObject({
            status: 200,
            body: {
                status: "cancelled",
                result: {
                    outputs: [{label: "Last settled Play round"}],
                    provenance: {sessionId: "session", game: session.game},
                    detail: {sessionId: "session", scenario: "any-win", session},
                },
            },
        });
    });

    it("deduplicates project-open aliases at the real route before the Home executor runs twice", async () => {
        const physicalProject = path.join(directory, "physical-project");
        const aliasProject = path.join(directory, "project-alias");
        fs.mkdirSync(physicalProject);
        fs.symlinkSync(physicalProject, aliasProject, "dir");
        let release: ((value: ProjectDashboardContext) => void) | undefined;
        let started: (() => void) | undefined;
        const running = new Promise<void>((resolve) => {
            started = resolve;
        });
        // Keep the real Home-service surface intact: StudioServer consults recent projects while
        // starting, whereas this route test controls only the executor under test.
        const homeService = new StudioHomeService("1.3.0");
        const openProject = jest.spyOn(homeService, "openProject").mockImplementation(() => new Promise<ProjectDashboardContext>((resolve) => {
            release = resolve;
            started?.();
        }));
        const baseUrl = await start(
            {} as StudioCertificationService,
            jobs,
            {homeService},
        );

        const first = post(`${baseUrl}/api/home/projects/open`, {projectRoot: physicalProject});
        await running;
        await expect(post(`${baseUrl}/api/home/projects/open`, {projectRoot: aliasProject})).resolves.toMatchObject({
            status: 409,
            body: {error: "Project opening is already in progress.", activeJobId: "bridge-job", reattached: true},
        });
        expect(openProject).toHaveBeenCalledTimes(1);

        release?.({status: "loaded", projectRoot: physicalProject, game: {id: "sample", name: "Sample", version: "1.0.0"}});
        await expect(first).resolves.toMatchObject({status: 200, body: {context: {mode: "project", projectRoot: physicalProject}}});
    });

    it("deduplicates nested symlinked Design destinations and conflicts changed Blueprint content before execution", async () => {
        const physicalRoot = path.join(directory, "design-root");
        const aliasRoot = path.join(directory, "design-alias");
        fs.mkdirSync(physicalRoot);
        fs.symlinkSync(physicalRoot, aliasRoot, "dir");
        const blueprint = {
            manifest: {id: "sample-slot", name: "Sample Slot", version: "1.0.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}, B: {3: 2}},
        };
        let release: ((value: unknown) => void) | undefined;
        let started: (() => void) | undefined;
        const running = new Promise<void>((resolve) => {
            started = resolve;
        });
        const build = jest.fn(() => new Promise<unknown>((resolve) => {
            release = resolve;
            started?.();
        }));
        const baseUrl = await start(
            {} as StudioCertificationService,
            jobs,
            {blueprintService: {build} as unknown as StudioBlueprintService},
        );
        const physicalRequest = {
            blueprint,
            sourcePath: path.join(physicalRoot, "source.blueprint.json"),
            outDir: path.join(physicalRoot, "nested", "out"),
        };
        const aliasRequest = {
            blueprint,
            sourcePath: path.join(aliasRoot, "source.blueprint.json"),
            outDir: path.join(aliasRoot, "nested", "out"),
        };
        const first = post(`${baseUrl}/api/home/blueprints/build`, physicalRequest);
        await running;
        await expect(post(`${baseUrl}/api/home/blueprints/build`, aliasRequest)).resolves.toMatchObject({
            status: 200,
            body: {status: "error", activeJobId: "bridge-job", reattached: true},
        });
        await expect(post(`${baseUrl}/api/home/blueprints/build`, {
            ...aliasRequest,
            blueprint: {...blueprint, rows: 4},
        })).resolves.toMatchObject({
            status: 409,
            body: {activeJobId: "bridge-job", recovery: {action: "retry"}},
        });
        await expect(post(`${baseUrl}/api/home/blueprints/build`, {
            ...physicalRequest,
            sourcePath: path.join(physicalRoot, "independent-source.blueprint.json"),
        })).resolves.toMatchObject({
            status: 409,
            body: {activeJobId: "bridge-job", recovery: {action: "retry"}},
        });
        expect(build).toHaveBeenCalledTimes(1);

        release?.({status: "ok", projectRoot: physicalRequest.outDir, manifest: blueprint.manifest, createdFiles: [], buildInfo: {}, warnings: []});
        await expect(first).resolves.toMatchObject({status: 201, body: {status: "ok", projectRoot: physicalRequest.outDir}});
    });
});
