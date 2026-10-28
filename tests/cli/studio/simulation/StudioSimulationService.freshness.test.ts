import fs from "fs";
import os from "os";
import path from "path";
import {projectRevision} from "../../../../src/optimization/internal/optimizationData.js";
import {StudioSimulationService} from "../../../../cli/studio/simulation/StudioSimulationService.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {validateSimulationRequest} from "../../../../cli/studio/simulation/validateSimulationRequest.js";
import {createCanonicalWasmFixture} from "../../../fixtures/wasm/createCanonicalWasmFixture.js";

it("V2C-36 binds restoration to accepted authored bytes across every simulation projection and service reuse", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v36-source-"));
    const artifact = path.join(directory, "game.wasm");
    const sidecar = `${artifact}.pokie-wasm.json`;
    const jobsPath = path.join(directory, "jobs");
    const fixture = createCanonicalWasmFixture({availableBets: [0.05], reelStrips: [["A"], ["A"]]});
    const replacement = createCanonicalWasmFixture({availableBets: [7.5], reelStrips: [["A"], ["A"]]});
    const write = (value = fixture) => {
        fs.writeFileSync(artifact, value.bytes);
        fs.writeFileSync(sidecar, JSON.stringify(value.manifest));
    };
    const jobs = new StudioJobService(new FileStudioJobRepository(jobsPath));
    const service = new StudioSimulationService();
    service.attachJobService(jobs);
    const restarted = new StudioSimulationService();
    const drain = async (id: string) => {
        const deadline = Date.now() + 5000;
        while (service.getActiveCount() > 0) {
            if (Date.now() > deadline) throw new Error(`Simulation ${id} did not drain`);
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        return service.getStatus(id)!;
    };
    let sequence = 0;
    const start = () => {
        const result = service.start(artifact, {rounds: 2, seed: `source-${++sequence}`});
        if (result.status !== "created") throw new Error(JSON.stringify(result));
        return result.job;
    };
    try {
        write();
        const accepted = start();
        expect(accepted.sourceCurrent).toBe(true);
        const revision = projectRevision({type: "wasm", rootPath: artifact});
        expect(jobs.get(artifact, accepted.id)?.request.sourceRevision).toBe(revision);
        expect(service.start(artifact, {rounds: 2, seed: "source-1"})).toMatchObject({status: "reattached", job: {id: accepted.id, sourceCurrent: true}});
        const completed = await drain(accepted.id);
        expect(completed).toMatchObject({status: "completed", sourceCurrent: true, report: {rounds: 2, totalBet: 0.1, totalWin: 0.2}});
        restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(jobsPath)));
        const projections = () => [
            service.getStatus(accepted.id), service.getStatusForProject(artifact, accepted.id),
            service.cancel(accepted.id), service.cancelForProject(artifact, accepted.id),
            restarted.getStatusForProject(artifact, accepted.id), restarted.cancelForProject(artifact, accepted.id),
        ];
        expect(projections().every(view => view?.sourceCurrent === true)).toBe(true);
        expect(restarted.getStatusForProject(artifact, accepted.id)?.report).toEqual(JSON.parse(JSON.stringify(completed.report)));
        expect(service.getStatusForProject(path.join(directory, "other.wasm"), accepted.id)).toBeUndefined();

        for (const change of [
            () => fs.writeFileSync(artifact, replacement.bytes),
            () => fs.writeFileSync(sidecar, JSON.stringify(replacement.manifest)),
            // Coordinated, valid executable and manifest edits retain game id/version.
            () => write(replacement),
            () => fs.rmSync(artifact),
        ]) {
            change();
            expect(projections().every(view => view?.sourceCurrent === false)).toBe(true);
            // Restoring exact accepted bytes revalidates both used and fresh services;
            // a terminal Cancel is a no-op and never discards the original report.
            write();
            expect(projections().every(view => view?.sourceCurrent === true)).toBe(true);
            expect(service.getStatus(accepted.id)?.report).toEqual(completed.report);
        }
        // Mutating every exposed report identity together is still no source proof.
        const exposed = restarted.getStatusForProject(artifact, accepted.id)!;
        exposed.sourceCurrent = true;
        exposed.report = {...exposed.report!, game: {...exposed.report!.game, id: "edited-response"}};
        write(replacement);
        expect(projections().every(view => view?.sourceCurrent === false)).toBe(true);
        write();

        // Executed rejection keeps the accepted source snapshot, but never a report.
        fs.writeFileSync(artifact, new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
        const rejected = start();
        expect(await drain(rejected.id)).toMatchObject({status: "failed", error: expect.stringMatching(/integrity|canonical|module/i)});
        expect(service.getReport(artifact, rejected.id)).toMatchObject({status: "not-ready", jobStatus: "failed"});
        write();
        for (let reuse = 0; reuse < 2; reuse++) {
            const next = start();
            expect(await drain(next.id)).toMatchObject({status: "completed", sourceCurrent: true, report: {totalBet: 0.1, totalWin: 0.2}});
        }
        // A preflight rejection does not acquire execution or break later reuse.
        fs.writeFileSync(sidecar, JSON.stringify({...fixture.manifest, capabilities: []}));
        expect(service.start(artifact, {rounds: 2})).toMatchObject({status: "unsupported"});
        expect(service.getActiveCount()).toBe(0);
        write();
        expect(await drain(start().id)).toMatchObject({status: "completed", sourceCurrent: true});
    } finally {
        await service.cancelAll();
        await restarted.cancelAll();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("V2C-36 cannot accept a browser-supplied source revision or validate a legacy durable job without source authority", () => {
    const submitted = {rounds: 2, sourceRevision: `sha256:${"0".repeat(64)}`};
    const request = validateSimulationRequest(submitted);
    expect(request).toEqual({rounds: 2, workers: 1});
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v36-legacy-"));
    try {
        const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
        const accepted = jobs.start({projectId: directory, operation: "simulation", request: {rounds: 2}, conflictKey: "legacy"});
        if (accepted.status !== "created") throw new Error(JSON.stringify(accepted));
        jobs.complete(accepted.job.id, {summary: "Legacy completed simulation"});
        const service = new StudioSimulationService();
        service.attachJobService(jobs);
        expect(service.getStatusForProject(directory, accepted.job.id)).not.toHaveProperty("sourceCurrent");
        expect(service.cancelForProject(directory, accepted.job.id)).not.toHaveProperty("sourceCurrent");
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
