import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioCertificationService} from "../../../cli/studio/certification/StudioCertificationService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

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

    async function start(certificationService: StudioCertificationService, jobService = jobs): Promise<string> {
        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: directory,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot},
            jobService,
            certificationService,
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
            status: 202,
            body: {reattached: true, job: {id: "bridge-job", operation: "certification-validate", status: "running"}},
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
        const build = jest.fn((_project: string, _bundle: string, _modes: unknown, _out: string, signal?: AbortSignal) => new Promise<{status: "load-error"; error: string}>((resolve) => {
            executorSignal = signal;
            buildStarted?.();
            signal?.addEventListener("abort", () => {
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
});
