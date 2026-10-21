import fs from "fs";
import os from "os";
import path from "path";
import {AdvancedModelSourceValidator} from "../../../src/validation/AdvancedModelSourceValidator.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {InMemoryRecentProjectsRepository} from "../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";
import type {AdvancedModelValidationReport} from "../../../src/validation/AdvancedModelValidation.js";

it("shares candidate-bound library, draft Studio and CLI JSON reports, with corrected retries and read-only bytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-routes-"));
    const file = path.join(root, "model.blueprint.json");
    const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
    const bytes = JSON.stringify(model);
    fs.writeFileSync(file, bytes);
    const home = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository());
    const server = new StudioServer({initialContext: {mode: "project", projectRoot: file}, pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: root, homeService: home,
        blueprintService: new StudioBlueprintService("1.3.0", root, home), jobService: new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))),
        projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry())});
    try {
        const address = await server.start();
        const url = `http://${address.host}:${address.port}`;
        const post = async (blueprint: unknown) => {
            const response = await fetch(url + "/api/home/blueprints/validate", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint})});
            expect(response.status).toBe(200);
            return response.json() as Promise<{advanced: AdvancedModelValidationReport}>;
        };
        const api = await new AdvancedModelSourceValidator().validate(file);
        expect(api).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
        expect((await post(model)).advanced).toEqual(api);
        const saved = await fetch(url + "/api/project/validate");
        expect(saved.status).toBe(200);
        expect((await saved.json() as {advanced: AdvancedModelValidationReport}).advanced).toEqual(api);
        expect((await post({...model, reels: 0})).advanced.status).toBe("invalid");
        expect((await post(model)).advanced).toEqual(api);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(await new ValidateCommand().run([file, "--format", "json"])).toBe(0);
            const cli = JSON.parse(log.mock.calls[0][0]) as {advanced: AdvancedModelValidationReport};
            expect(cli.advanced).toEqual(api);
        } finally {
            log.mockRestore();
        }
        expect(fs.readFileSync(file, "utf8")).toBe(bytes);
        // A writer can replace either acquisition, including the final structural reread.
        for (const replaceAt of [1, 2]) {
            fs.writeFileSync(file, bytes);
            const open = fs.openSync.bind(fs);
            const close = fs.closeSync.bind(fs);
            const descriptors = new Set<number>();
            let reads = 0;
            const opening = jest.spyOn(fs, "openSync").mockImplementation((...args) => {
                const descriptor = open(...args);
                if (String(args[0]) === file) descriptors.add(descriptor);
                return descriptor;
            });
            const closing = jest.spyOn(fs, "closeSync").mockImplementation(descriptor => {
                close(descriptor);
                if (descriptors.delete(descriptor) && ++reads === replaceAt) {
                    fs.writeFileSync(file, JSON.stringify({...model, paytable: {A: {3: 7.5}}}));
                }
            });
            try {
                const stale = await fetch(url + "/api/project/validate");
                expect(stale.status).toBe(409);
                expect(await stale.json()).toEqual({error: "Source changed during validation. Retry against the current source."});
            } finally {
                opening.mockRestore();
                closing.mockRestore();
            }
        }
    } finally {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

function packageValidationServer(root: string, source: string, gamePackageValidator?: import("@fromstan/pokie").PokieGamePackageValidating): StudioServer {
    const home = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository());
    return new StudioServer({initialContext: {mode: "project", projectRoot: source}, pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: root, homeService: home,
        blueprintService: new StudioBlueprintService("1.3.0", root, home), jobService: new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))),
        resolveRuntimePackageRoot: () => Promise.reject(new Error("Dashboard runtime unavailable")), gamePackageValidator,
        projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry())});
}

it("rejects mixed revisions for saved package contracts and permits a fresh retry", async () => {
    const {writeDescriptorPackage} = await import("../../v2/fixtures/PackageExtractionFixture.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-route-revision-"));
    const source = writeDescriptorPackage(root);
    let replace = true;
    const server = packageValidationServer(root, source, {validate: () => {
        if (replace) fs.appendFileSync(path.join(source, "index.js"), "\n// Concurrent replacement\n");
        replace = false;
        return Promise.resolve({packageRoot: source, valid: true, game: null, errors: [], warnings: [], suggestions: []});
    }});
    try {
        const address = await server.start();
        const url = `http://${address.host}:${address.port}/api/project/validate`;
        const stale = await fetch(url);
        expect(stale.status).toBe(409);
        expect(await stale.json()).toEqual({error: "Source changed during validation. Retry against the current source."});
        const fresh = await fetch(url);
        expect(fresh.status).toBe(200);
        expect(await fresh.json()).toMatchObject({valid: true, advanced: {adapter: "tsPackage-declaration-v1", verdict: "inconclusive"}});
    } finally {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

it("aborts and drains an owned saved validation before completing a project transition", async () => {
    const {writePausedDescriptorPackage, runtimeSnapshotNames} = await import("../../v2/fixtures/PackageExtractionFixture.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-route-transition-"));
    const fixture = writePausedDescriptorPackage(root);
    const server = packageValidationServer(root, fixture.source);
    const validate = AdvancedModelSourceValidator.prototype.validate;
    let aborted!: () => void;
    const cancellation = new Promise<void>(resolve => {
        aborted = resolve;
    });
    const spy = jest.spyOn(AdvancedModelSourceValidator.prototype, "validate").mockImplementation(function (this: AdvancedModelSourceValidator, input, options) {
        options?.signal?.addEventListener("abort", aborted, {once: true});
        return Reflect.apply(validate, this, [input, options]);
    });
    let pending: Promise<Response> | undefined;
    let closing: Promise<Response> | undefined;
    try {
        const address = await server.start();
        const url = `http://${address.host}:${address.port}`;
        // Startup recognition also owns package snapshots. Settle that independent
        // dashboard load before pausing the validation lease whose drain we assert.
        const deadline = Date.now() + 10_000;
        for (;;) {
            const context = await (await fetch(url + "/api/project/context")).json() as {status: string; error?: string};
            if (context.status !== "loading") {
                expect(context).toMatchObject({status: "error", error: "Dashboard runtime unavailable"});
                break;
            }
            if (Date.now() >= deadline) throw new Error("Dashboard startup did not settle before validation");
            await new Promise<void>(resolve => {
                setTimeout(resolve, 10);
            });
        }
        expect(runtimeSnapshotNames(fixture.source)).toEqual([]);
        fixture.arm();
        pending = fetch(url + "/api/project/validate");
        await fixture.readStarted;
        let closed = false;
        closing = fetch(url + "/api/projects/close", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"}).then(response => {
            closed = true;
            return response;
        });
        await cancellation;
        await new Promise<void>(resolve => {
            setImmediate(resolve);
        });
        expect(closed).toBe(false); // Descriptor acquisition still owns its snapshot.
        expect(runtimeSnapshotNames(fixture.source)).toHaveLength(1);
        const duringTransition = await fetch(url + "/api/project/validate");
        expect(duringTransition.status).toBe(409);
        fixture.settle();
        expect((await closing).status).toBe(200);
        const result = await pending;
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({valid: false, advanced: {status: "cancelled", verdict: "inconclusive"}});
        expect(runtimeSnapshotNames(fixture.source)).toEqual([]);
    } finally {
        fixture.restore();
        await Promise.allSettled([pending, closing]);
        spy.mockRestore();
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
    }
});

it("bounds shared-weight normalization on the real Studio comparison route and recovers", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-route-bounds-"));
    const source = path.join(root, "model.blueprint.json");
    const model = fractionalBetBlueprint([0.05], true);
    fs.writeFileSync(source, JSON.stringify(model));
    const server = packageValidationServer(root, source);
    try {
        const address = await server.start();
        const url = `http://${address.host}:${address.port}/api/home/blueprints/validate`;
        const large = {...model, symbolWeights: {A: 1000000000}};
        Reflect.deleteProperty(large, "reelStrips");
        const post = (blueprint: unknown) => fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint})});
        expect(await (await post(large)).json()).toMatchObject({status: "inconclusive", advanced: {status: "budget-exhausted", verdict: "inconclusive"}});
        const comparison = await fetch(`http://${address.host}:${address.port}/api/math-definition-diff/preview`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({leftPath: source, draft: large, revision: 0})});
        expect(comparison.status).toBe(200);
        expect(await comparison.json()).toMatchObject({status: "partial", right: {advanced: {status: "budget-exhausted", verdict: "inconclusive"}}});
        expect(await (await post(model)).json()).toMatchObject({status: "ok", advanced: {status: "complete"}});
    } finally {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
    }
});
