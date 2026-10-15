import {runtimeSnapshotNames, writePausedDescriptorPackage, writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ArtifactBuildCancelledError, ArtifactBuilderRegistry, ArtifactConversionPlanner, ManagedOutcomeProjectService, OutcomeLibraryBundleWriter, PROJECT_TYPE_CAPABILITIES, resolvePokieGameEntryModule, type ArtifactTargetType, type PokieProject, type ProjectResolving, type WeightedOutcomeInput} from "@fromstan/pokie";
import {buildOutcomeLibraryBundleModeInput} from "../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";

function buildBlueprint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("StudioArtifactBuildService", () => {
    let workDir: string;
    let service: StudioArtifactBuildService;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-build-test-"));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    async function terminal(packageService: StudioArtifactBuildService, source: string, id: string) {
        for (let read = 0; read < 1000; read++) {
            const view = packageService.getStatusForProject(source, id)!;
            if (["completed", "failed", "cancelled"].includes(view.status)) return view;
            await new Promise<void>(resolve => {
                setImmediate(resolve);
            });
        }
        throw new Error("Extraction job did not settle");
    }

    it.each(["blueprint", "tsPackage", "parWorkbook", "stakeAdapter", "wasm"] as const)(
        "holds %s publication until Studio acknowledges startup and cancels without executing a writer",
        async target => {
            const source = target === "blueprint" ? writeDescriptorPackage(workDir) : writeBlueprintFile();
            const sourceFile = target === "blueprint" ? path.join(source, "index.js") : source;
            const input = fs.readFileSync(sourceFile);
            const destination = path.join(workDir, "deferred-output");
            const jobs = new StudioJobService(new FileStudioJobRepository(path.join(workDir, "jobs")));
            service.attachJobService(jobs);
            const preview = await service.preview(source, target, destination);
            expect(preview.status).toBe("ok");
            if (preview.status !== "ok") throw new Error("expected preview");
            let started;
            if (target === "blueprint") started = service.startPreparedExtraction(source, preview.preparedOperationId!, destination, true);
            else if (target === "stakeAdapter") started = await service.startPreparedStakeProjection(source, preview.preparedOperationId!, true);
            else started = service.start(source, target, destination, true);
            if (started.status !== "created") throw new Error("expected queued build");
            // Drain promise continuations as if the start response were delayed. No builder may run.
            await Promise.resolve();
            await Promise.resolve();
            expect(service.getStatusForProject(source, started.job.id)).toMatchObject({status: "queued"});
            expect(fs.existsSync(destination)).toBe(false);
            expect(service.activateForProject(workDir, started.job.id)).toBeUndefined();
            expect(service.cancelForProject(source, started.job.id)).toMatchObject({status: "cancelling", cancellationRequested: true});
            const result = await terminal(service, source, started.job.id);
            expect(result).toMatchObject({status: "cancelled", result: {status: "cancelled"}});
            // A late or duplicate activation must never resurrect the cancelled writer.
            service.activateForProject(source, started.job.id);
            await Promise.resolve();
            expect(jobs.get(source, started.job.id)).toMatchObject({status: "cancelled"});
            expect(jobs.get(source, started.job.id)?.result?.outputs).toBeUndefined();
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(false);
            expect(fs.readFileSync(sourceFile)).toEqual(input);
            expect(fs.readdirSync(workDir).sort()).toEqual([path.basename(source), "jobs"].sort());
            await service.cancelAll();
        },
    );

    it("activates the acknowledged TypeScript build once through the real writer", async () => {
        const source = writeBlueprintFile();
        const input = fs.readFileSync(source);
        const destination = path.join(workDir, "acknowledged-package");
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const execute = jest.spyOn(registry, "executePlan");
        const building = new StudioArtifactBuildService("1.3.0", registry);
        const started = building.start(source, "tsPackage", destination, true);
        if (started.status !== "created") throw new Error("expected queued build");
        await Promise.resolve();
        expect(execute).not.toHaveBeenCalled();
        expect(building.activateForProject(source, started.job.id)).toMatchObject({status: "queued"});
        building.activateForProject(source, started.job.id);
        const result = await terminal(building, source, started.job.id);
        expect(result).toMatchObject({status: "completed", result: {status: "ok", target: "tsPackage", outputPath: destination}});
        expect(execute).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(path.join(destination, "package.json"))).toBe(true);
        expect(fs.readFileSync(source)).toEqual(input);
        await building.cancelAll();
    });

    it.each(["shutdown", "project-close"] as const)("settles an unacknowledged reservation on %s", async action => {
        const source = writeBlueprintFile();
        const destination = path.join(workDir, "abandoned-package");
        const started = service.start(source, "tsPackage", destination, true);
        if (started.status !== "created") throw new Error("expected queued build");
        if (action === "shutdown") await service.cancelAll();
        else service.cancelActiveForProject(source);
        expect(await terminal(service, source, started.job.id)).toMatchObject({status: "cancelled", result: {status: "cancelled"}});
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.readdirSync(workDir)).toEqual([path.basename(source)]);
    });

    it.each(["blueprint", "tsPackage"] as const)("durably cancels %s during its final asynchronous descriptor read without artifact actions or registration", async target => {
        const fixture = writePausedDescriptorPackage(workDir);
        const snapshots = runtimeSnapshotNames(fixture.source);
        const input = fs.readFileSync(path.join(fixture.source, "index.js"));
        const register = jest.fn(() => Promise.resolve());
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const execute = registry.executePlan.bind(registry);
        jest.spyOn(registry, "executePlan").mockImplementation((plan, source, destination, options) => execute(plan, source, destination, {
            ...options, onProgress: value => {
                options?.onProgress?.(value);
                if (value.message === "Extracting public package model into Blueprint") fixture.arm();
            },
        }));
        const packageService = new StudioArtifactBuildService("1.3.0", registry, undefined, register);
        const durableDirectory = path.join(workDir, "jobs");
        const jobs = new StudioJobService(new FileStudioJobRepository(durableDirectory));
        packageService.attachJobService(jobs);
        try {
            const started = packageService.start(fixture.source, target, path.join(workDir, "output"));
            if (started.status !== "created") throw new Error("expected artifact job");
            await fixture.readStarted;
            expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
            expect(packageService.getStatusForProject(fixture.source, started.job.id)).toMatchObject({status: "running"});
            expect(packageService.cancelForProject(fixture.source, started.job.id)).toMatchObject({status: "cancelling", cancellationRequested: true});
            fixture.settle();
            await packageService.cancelAll();
            expect(packageService.getStatusForProject(fixture.source, started.job.id)).toMatchObject({
                status: "cancelled", result: {status: "cancelled"}, progress: {status: "cancelled"},
            });
            expect(jobs.list(fixture.source)).toEqual([expect.objectContaining({id: started.job.id, status: "cancelled"})]);
            const durable = new FileStudioJobRepository(durableDirectory).get(started.job.id);
            expect(durable).toMatchObject({status: "cancelled"});
            expect(durable?.result?.outputs).toBeUndefined();
            const restarted = new StudioArtifactBuildService("1.3.0");
            restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(durableDirectory)));
            expect(restarted.getStatusForProject(fixture.source, started.job.id)).toMatchObject({status: "cancelled"});
            expect(register).not.toHaveBeenCalled();
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
            expect(fs.readFileSync(fixture.control, "utf8")).toBe("existing descriptor input");
            expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", "descriptor-read.txt", "jobs"]);
        } finally {
            fixture.restore();
            await packageService.cancelAll();
        }
    });

    it("previews package diagnostics and publishes/registers a separate Blueprint with extraction provenance", async () => {
        const source = writeDescriptorPackage(workDir);
        const destination = path.join(workDir, "extracted.json");
        const register = jest.fn(() => Promise.resolve());
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, register);
        const preview = await packageService.preview(source, "blueprint", destination);
        expect(preview.status).toBe("ok");
        expect(preview.plan.packageExtraction?.source).toMatchObject({gameId: "math-probe", gameVersion: "0.1.0", kind: "custom"});
        const result = await packageService.build(source, "blueprint", destination);
        expect(result.status).toBe("ok");
        expect(register).toHaveBeenCalledWith(destination, {conversionEvidencePath: `${destination}.conversion-evidence.json`});
        const legacy = writeDescriptorPackage(workDir, {name: "legacy", legacy: true});
        const unavailable = await packageService.preview(legacy, "blueprint", path.join(workDir, "legacy.json"));
        expect(unavailable.status).toBe("unsupported");
        expect(unavailable.plan.packageExtraction?.status).toBe("partial");
        expect(fs.existsSync(path.join(workDir, "legacy.json"))).toBe(false);
    });

    it.each(["blueprint", "evidence"])("keeps concurrent %s publication intact and does not register", async member => {
        const source = writeDescriptorPackage(workDir);
        const destination = path.join(workDir, "extracted.json");
        const competitor = member === "blueprint" ? destination : `${destination}.conversion-evidence.json`;
        const bytes = Buffer.from([0, 255, 13, 10, 42]);
        const register = jest.fn(() => Promise.resolve());
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, register);
        const link = fs.promises.link.bind(fs.promises);
        const spy = jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
            if (String(to) === competitor) fs.writeFileSync(competitor, bytes);
            await link(from, to);
        });
        try {
            const result = await packageService.build(source, "blueprint", destination);
            expect(result.status).toBe("conflict");
            expect(result).toMatchObject({message: expect.stringMatching(/already exists/)});
            expect(register).not.toHaveBeenCalled();
            expect(fs.readFileSync(competitor)).toEqual(bytes);
            expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", path.basename(competitor)].sort());
        } finally {
            spy.mockRestore();
        }
    });

    it.each(["blueprint", "evidence"])("preserves a competing %s replacement on registration failure", async member => {
        const source = writeDescriptorPackage(workDir);
        const destination = path.join(workDir, "extracted.json");
        const competitor = member === "blueprint" ? destination : `${destination}.conversion-evidence.json`;
        const bytes = Buffer.from("another writer's replacement");
        const unregister = jest.fn(() => Promise.resolve());
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
            const replacement = path.join(workDir, "replacement.tmp");
            fs.writeFileSync(replacement, bytes);
            fs.renameSync(replacement, competitor);
            throw new Error("registration failed");
        }, undefined, undefined, unregister);
        const result = await packageService.build(source, "blueprint", destination);
        expect(result.status).toBe("error");
        expect(result).toMatchObject({message: expect.stringContaining("registration failed")});
        expect(unregister).toHaveBeenCalledWith(destination);
        expect(fs.readFileSync(competitor)).toEqual(bytes);
        expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", path.basename(competitor)].sort());
    });

    describe.each([
        {target: "tsPackage", empty: false},
        {target: "tsPackage", empty: true},
        {target: "parWorkbook", empty: false},
        {target: "wasm", empty: false},
    ] as const)("downstream $target registration rollback (caller directory: $empty)", ({target, empty}) => {
        it.each([
            {member: "terminal", cancelled: false}, {member: "terminal", cancelled: true},
            {member: "blueprint", cancelled: false}, {member: "blueprint", cancelled: true},
            {member: "evidence", cancelled: false}, {member: "evidence", cancelled: true},
        ])("preserves replaced $member and unrelated contents (cancelled: $cancelled)", async ({member, cancelled}) => {
            const source = writeDescriptorPackage(workDir);
            const destination = path.join(workDir, "output");
            if (empty) fs.mkdirSync(destination);
            const callerInode = empty ? fs.statSync(destination).ino : undefined;
            const durableDirectory = target === "tsPackage" ? path.join(destination, ".pokie", "package-extraction") : path.join(`${destination}.pokie`, "package-extraction");
            const blueprint = path.join(durableDirectory, "imported.blueprint.json");
            const evidence = path.join(durableDirectory, "conversion-evidence.json");
            const terminal = target === "tsPackage" ? path.join(destination, "package.json") : destination;
            const retainedMember = member === "blueprint" ? blueprint : evidence;
            const competitor = member === "terminal" ? terminal : retainedMember;
            const sentinel = path.join(durableDirectory, "unrelated.bin");
            const bytes = Buffer.from([0, 255, 13, 10, 42]);
            const controller = new AbortController();
            const registered = new Set<string>();
            const unregister = jest.fn((rootPath: string) => {
                registered.delete(rootPath);
                return Promise.resolve();
            });
            const register = jest.fn((rootPath: string) => {
                registered.add(rootPath);
                // The terminal has already registered; the retained Blueprint is the
                // second registration, so both records must unwind on failure.
                if (rootPath === blueprint) {
                    fs.writeFileSync(sentinel, bytes);
                    const replacement = path.join(workDir, "replacement.tmp");
                    fs.writeFileSync(replacement, bytes);
                    fs.renameSync(replacement, competitor);
                    if (!cancelled) throw new Error("downstream registration failed");
                    controller.abort();
                }
                return Promise.resolve();
            });
            const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, register, undefined, undefined, unregister);
            const result = await packageService.build(source, target, destination, {signal: controller.signal});
            expect(result.status).toBe(cancelled ? "cancelled" : "error");
            if (!cancelled) expect(result).toMatchObject({message: expect.stringContaining("downstream registration failed")});
            expect(register).toHaveBeenCalledWith(destination, {conversionEvidencePath: evidence});
            expect(unregister).toHaveBeenCalledWith(destination);
            expect(unregister).toHaveBeenCalledWith(blueprint);
            expect(registered.size).toBe(0);
            expect(fs.readFileSync(competitor)).toEqual(bytes);
            expect(fs.readFileSync(sentinel)).toEqual(bytes);
            for (const owned of [terminal, blueprint, evidence]) if (owned !== competitor) expect(fs.existsSync(owned)).toBe(false);
            expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
            const filesBelow = (directory: string): string[] => !fs.existsSync(directory) ? [] : fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
            const survivingFiles = target === "tsPackage" ? filesBelow(destination) : [...filesBelow(`${destination}.pokie`), ...(fs.existsSync(destination) ? [destination] : [])];
            expect(survivingFiles.sort()).toEqual([competitor, sentinel].sort());
            if (empty) expect(fs.statSync(destination).ino).toBe(callerInode);
            expect(fs.readdirSync(workDir).some(name => name.startsWith(".pokie-"))).toBe(false);
        });
    });

    it.each([false, true])("preserves a replaced WASM integrity sidecar during registration rollback (cancelled: %s)", async cancelled => {
        const source = writeDescriptorPackage(workDir);
        const destination = path.join(workDir, "output.wasm");
        const competitor = `${destination}.pokie-wasm.json`;
        const controller = new AbortController();
        const bytes = Buffer.from("replaced integrity file");
        const registered = new Set<string>();
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, rootPath => {
            registered.add(rootPath);
            const replacement = path.join(workDir, "replacement.tmp");
            fs.writeFileSync(replacement, bytes);
            fs.renameSync(replacement, competitor);
            if (!cancelled) throw new Error("registration failed");
            controller.abort();
            return Promise.resolve();
        }, undefined, undefined, rootPath => {
            registered.delete(rootPath);
            return Promise.resolve();
        });
        expect(await packageService.build(source, "wasm", destination, {signal: controller.signal})).toMatchObject({status: cancelled ? "cancelled" : "error"});
        expect(fs.readFileSync(competitor)).toEqual(bytes);
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(`${destination}.pokie`)).toBe(false);
        expect(registered.size).toBe(0);
        expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", path.basename(competitor)].sort());
    });

    it.each([false, true])("preserves a replaced package directory and its contents during registration rollback (cancelled: %s)", async cancelled => {
        const source = writeDescriptorPackage(workDir);
        const destination = path.join(workDir, "output");
        const moved = path.join(workDir, "moved-publication");
        const controller = new AbortController();
        const bytes = Buffer.from("another directory owner");
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
            fs.renameSync(destination, moved);
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.bin"), bytes);
            // A hard link to an operation-owned inode inside a replacement
            // ancestor must not be deleted from that other writer's directory.
            fs.linkSync(path.join(moved, "package.json"), path.join(destination, "package.json"));
            if (!cancelled) throw new Error("registration failed");
            controller.abort();
            return Promise.resolve();
        });
        expect(await packageService.build(source, "tsPackage", destination, {signal: controller.signal})).toMatchObject({status: cancelled ? "cancelled" : "error"});
        expect(fs.readFileSync(path.join(destination, "unrelated.bin"))).toEqual(bytes);
        expect(fs.readFileSync(path.join(destination, "package.json"))).toEqual(fs.readFileSync(path.join(moved, "package.json")));
        expect(fs.readdirSync(destination).sort()).toEqual(["package.json", "unrelated.bin"]);
        expect(fs.readdirSync(workDir).some(name => name.startsWith(".pokie-"))).toBe(false);
    });

    describe.each(["tsPackage", "parWorkbook"] as const)("direct %s Blueprint ancestor ownership", sourceType => {
        it.each([false, true])("preserves replacement ancestors and hard links on registration rollback (cancelled: %s)", async cancelled => {
            const source = sourceType === "tsPackage" ? writeDescriptorPackage(workDir) : path.join(workDir, "source.xlsx");
            if (sourceType === "parWorkbook") fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), source);
            const parent = path.join(workDir, "nested");
            const destination = path.join(parent, "model.json");
            const moved = path.join(workDir, "moved-publication");
            const controller = new AbortController();
            const registered = new Set<string>();
            const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, root => {
                registered.add(root);
                fs.renameSync(parent, moved);
                fs.mkdirSync(parent);
                for (const name of ["model.json", "model.json.conversion-evidence.json"]) fs.linkSync(path.join(moved, name), path.join(parent, name));
                fs.writeFileSync(path.join(parent, "unrelated.bin"), "another directory owner");
                if (!cancelled) throw new Error("registration failed");
                controller.abort();
                return Promise.resolve();
            }, undefined, undefined, root => {
                registered.delete(root);
                return Promise.resolve();
            });
            expect(await packageService.build(source, "blueprint", destination, {signal: controller.signal})).toMatchObject({status: cancelled ? "cancelled" : "error"});
            expect(registered.size).toBe(0);
            for (const name of ["model.json", "model.json.conversion-evidence.json"]) expect(fs.readFileSync(path.join(parent, name))).toEqual(fs.readFileSync(path.join(moved, name)));
            expect(fs.readdirSync(parent).sort()).toEqual(["model.json", "model.json.conversion-evidence.json", "unrelated.bin"]);
            expect(fs.readFileSync(path.join(parent, "unrelated.bin"), "utf8")).toBe("another directory owner");
        });
    });

    describe.each([
        {target: "outcomeLibrary", empty: false}, {target: "outcomeLibrary", empty: true},
        {target: "stakeAdapter", empty: false}, {target: "stakeAdapter", empty: true},
    ] as const)("PAR $target registration ownership (caller directory: $empty)", ({target, empty}) => {
        it.each([false, true])("preserves competing evidence and unrelated contents (cancelled: %s)", async cancelled => {
            const source = path.join(workDir, "source.xlsx");
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), source);
            const destination = path.join(workDir, "output");
            if (empty) fs.mkdirSync(destination);
            const callerInode = empty ? fs.statSync(destination).ino : undefined;
            const durableDirectory = path.join(destination, ".pokie", "par-import");
            const blueprint = path.join(durableDirectory, "imported.blueprint.json");
            const evidence = path.join(durableDirectory, "conversion-evidence.json");
            const sentinel = path.join(durableDirectory, "unrelated.bin");
            const bytes = Buffer.from([0, 255, 13, 10, 42]);
            const controller = new AbortController();
            const registered = new Set<string>();
            const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, root => {
                registered.add(root);
                if (root === blueprint) {
                    fs.writeFileSync(sentinel, bytes);
                    const replacement = path.join(workDir, "replacement.tmp");
                    fs.writeFileSync(replacement, bytes);
                    fs.renameSync(replacement, evidence);
                    if (!cancelled) throw new Error("registration failed");
                    controller.abort();
                }
                return Promise.resolve();
            }, undefined, undefined, root => {
                registered.delete(root);
                return Promise.resolve();
            });
            expect(await packageService.build(source, target, destination, {signal: controller.signal})).toMatchObject({status: cancelled ? "cancelled" : "error"});
            expect(registered.size).toBe(0);
            expect(fs.readFileSync(evidence)).toEqual(bytes);
            expect(fs.readFileSync(sentinel)).toEqual(bytes);
            expect(fs.readdirSync(durableDirectory).sort()).toEqual(["conversion-evidence.json", "unrelated.bin"]);
            expect(fs.readdirSync(destination)).toEqual([".pokie"]);
            if (empty) expect(fs.statSync(destination).ino).toBe(callerInode);
            expect(fs.readdirSync(workDir).some(name => name.startsWith(".pokie-"))).toBe(false);
        });
    });

    it("rejects final model drift through Studio without output or registration", async () => {
        const control = path.join(workDir, "payout.txt");
        fs.writeFileSync(control, "1");
        const source = writeDescriptorPackage(workDir, {descriptorBody:
            `model.paytable.A[3] = Number(require("fs").readFileSync(${JSON.stringify(control)}, "utf8"));
            return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};`,});
        const destination = path.join(workDir, "extracted.json");
        const register = jest.fn(() => Promise.resolve());
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, register);
        const result = await packageService.build(source, "blueprint", destination, {onProgress: progress => {
            if (progress.message === "Extracting public package model into Blueprint") fs.writeFileSync(control, "99");
        }});
        expect(result.status).toBe("error");
        expect(result).toMatchObject({message: expect.stringContaining("Package model changed after preview")});
        expect(register).not.toHaveBeenCalled();
        expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", "payout.txt"]);
    });

    it.each([
        ['manifest: null', /manifest/],
        ['betModes: [{id: "metadata", isDefault: "yes"}]', /betModes\[0\].isDefault.*boolean/],
    ] as const)("exposes malformed %s in preview/build and cannot publish", async (declaration, diagnostic) => {
        const source = writeDescriptorPackage(workDir, {descriptorBody:
            `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: {...model, ${declaration}}};`,});
        const input = fs.readFileSync(path.join(source, "index.js"));
        const destination = path.join(workDir, "extracted.json");
        const register = jest.fn(() => Promise.resolve());
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, register);
        for (const result of [await packageService.preview(source, "blueprint", destination), await packageService.build(source, "blueprint", destination)]) {
            expect(result.status).toBe("unsupported");
            expect(result.plan.packageExtraction?.status).toBe("malformed");
            expect(result).toMatchObject({message: expect.stringMatching(diagnostic)});
        }
        expect(register).not.toHaveBeenCalled();
        expect(fs.readdirSync(workDir)).toEqual(["descriptor-package"]);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
    });

    it("rolls back package extraction files and registrations when registration fails or cancels", async () => {
        const source = writeDescriptorPackage(workDir);
        for (const cancelled of [false, true]) {
            const destination = path.join(workDir, `${cancelled}.json`);
            const controller = new AbortController();
            const unregister = jest.fn(() => Promise.resolve());
            const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
                if (!cancelled) throw new Error("registration failed");
                controller.abort();
                return Promise.resolve();
            }, undefined, undefined, unregister);
            const result = await packageService.build(source, "blueprint", destination, {signal: controller.signal});
            expect(result.status).toBe(cancelled ? "cancelled" : "error");
            expect(unregister).toHaveBeenCalledWith(destination);
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(false);
        }
    });

    it.each([false, true])("keeps registration cleanup failure observable after owned files roll back (cancelled: %s)", async cancelled => {
        const source = writeDescriptorPackage(workDir);
        const bytes = fs.readFileSync(path.join(source, "index.js"));
        // Another worker may retain an otherwise identical descriptor while this build rolls back.
        const sibling = writeDescriptorPackage(workDir, {name: "sibling-package"});
        const siblingBytes = fs.readFileSync(path.join(sibling, "index.js"));
        const lease = await resolvePokieGameEntryModule(sibling);
        const siblingSnapshots = runtimeSnapshotNames(sibling);
        const controller = new AbortController();
        const destination = path.join(workDir, "cleanup.json");
        const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
            if (!cancelled) throw new Error("registration failed");
            controller.abort();
            return Promise.resolve();
        }, undefined, undefined, () => Promise.reject(new Error("registry cleanup confirmation failed")));
        try {
            expect(siblingSnapshots).toHaveLength(1);
            const result = await packageService.build(source, "blueprint", destination, {signal: controller.signal});
            expect(result).toMatchObject({status: "error", message: expect.stringContaining("registration rollback: registry cleanup confirmation failed")});
            expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
            expect(fs.readFileSync(path.join(sibling, "index.js"))).toEqual(siblingBytes);
            expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-package", "sibling-package"]);
            expect(runtimeSnapshotNames(source)).toEqual([]);
            expect(runtimeSnapshotNames(sibling)).toEqual(siblingSnapshots);
        } finally {
            await lease.release();
        }
        expect(runtimeSnapshotNames(sibling)).toEqual([]);
    });

    describe("reviewed package extraction", () => {
        it("consumes a single project/destination authority and rejects missing, mismatched and reused handles", async () => {
            const source = writeDescriptorPackage(workDir);
            const destination = path.join(workDir, "reviewed.json");
            const preview = await service.preview(source, "blueprint", destination);
            if (preview.status !== "ok") throw new Error(preview.status);
            expect(preview.preparedOperationId).toMatch(/^extraction-/);
            expect(service.startPreparedExtraction(source, "missing", destination)).toEqual({status: "stale"});
            expect(service.startPreparedExtraction(workDir, preview.preparedOperationId!, destination)).toEqual({status: "stale"});
            expect(service.startPreparedExtraction(source, preview.preparedOperationId!, `${destination}.other`)).toEqual({status: "stale"});
            expect(fs.readdirSync(workDir)).toEqual(["descriptor-package"]);
            const started = service.startPreparedExtraction(source, preview.preparedOperationId!, destination);
            if (started.status !== "created") throw new Error(started.status);
            expect(service.startPreparedExtraction(source, preview.preparedOperationId!, destination)).toEqual({status: "stale"});
            const completed = await terminal(service, source, started.job.id);
            if (completed.status !== "completed") throw new Error(`Reviewed extraction failed: ${JSON.stringify({status: completed.status, result: completed.result?.status, message: completed.result && "message" in completed.result ? completed.result.message : undefined})}`);
            expect(completed.result?.plan.packageExtraction).toEqual(preview.plan.packageExtraction);
            const evidence = JSON.parse(fs.readFileSync(`${destination}.conversion-evidence.json`, "utf8"));
            expect(evidence.extraction).toEqual(preview.plan.packageExtraction);
        });
        it.each(["bytes", "descriptor", "companion", "registration"])("preserves sources and destinations after %s changes between preview and save", async change => {
            const control = path.join(workDir, "descriptor-kind.txt");
            fs.writeFileSync(control, "custom");
            const source = writeDescriptorPackage(workDir, {descriptorBody: `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: require("fs").readFileSync(${JSON.stringify(control)}, "utf8"), model};`});
            const destination = path.join(workDir, "reviewed.json");
            const registered = new Set<string>();
            const packageService = new StudioArtifactBuildService("1.3.0", undefined, undefined, root => {
                registered.add(root);
                if (change === "registration") throw new Error("registration unavailable");
                return Promise.resolve();
            }, undefined, undefined, root => {
                registered.delete(root);
                return Promise.resolve();
            });
            const preview = await packageService.preview(source, "blueprint", destination);
            if (preview.status !== "ok") throw new Error(preview.status);
            if (change === "bytes") fs.appendFileSync(path.join(source, "index.js"), "\n// authored change");
            if (change === "descriptor") fs.writeFileSync(control, "generated");
            if (change === "companion") fs.writeFileSync(`${destination}.conversion-evidence.json`, "competing evidence");
            const bytes = fs.readFileSync(path.join(source, "index.js"));
            const snapshots = runtimeSnapshotNames(source);
            const started = packageService.startPreparedExtraction(source, preview.preparedOperationId!, destination);
            if (started.status !== "created") throw new Error(started.status);
            const result = await terminal(packageService, source, started.job.id);
            expect(result.status).toBe("failed");
            expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
            expect(runtimeSnapshotNames(source)).toEqual(snapshots);
            expect(fs.existsSync(destination)).toBe(false);
            expect(registered.size).toBe(0);
            expect(fs.readdirSync(workDir).sort()).toEqual(["descriptor-kind.txt", "descriptor-package", ...(change === "companion" ? ["reviewed.json.conversion-evidence.json"] : [])].sort());
            if (change === "companion") expect(fs.readFileSync(`${destination}.conversion-evidence.json`, "utf8")).toBe("competing evidence");
        });
        it("keeps cancellation nonterminal until the asynchronous descriptor settles and retains its durable result", async () => {
            const fixture = writePausedDescriptorPackage(workDir);
            const destination = path.join(workDir, "reviewed.json");
            const jobsDirectory = path.join(workDir, "jobs");
            service.attachJobService(new StudioJobService(new FileStudioJobRepository(jobsDirectory)));
            const snapshots = runtimeSnapshotNames(fixture.source);
            try {
                const preview = await service.preview(fixture.source, "blueprint", destination);
                if (preview.status !== "ok") throw new Error(preview.status);
                fixture.arm();
                const started = service.startPreparedExtraction(fixture.source, preview.preparedOperationId!, destination);
                if (started.status !== "created") throw new Error(started.status);
                await fixture.readStarted;
                expect(service.cancelForProject(fixture.source, started.job.id)).toMatchObject({status: "cancelling"});
                expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
                fixture.settle();
                const cancelled = await terminal(service, fixture.source, started.job.id);
                expect(cancelled).toMatchObject({status: "cancelled", result: {status: "cancelled", plan: preview.plan}});
                const reopened = new StudioArtifactBuildService("1.3.0");
                reopened.attachJobService(new StudioJobService(new FileStudioJobRepository(jobsDirectory)));
                expect(reopened.getStatusForProject(fixture.source, started.job.id)).toMatchObject({status: "cancelled", result: {status: "cancelled", plan: preview.plan}});
                expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(false);
            } finally {
                fixture.restore();
                await service.cancelAll();
            }
        });
    });

    function writeBlueprintFile(blueprint: unknown = buildBlueprint()): string {
        const filePath = path.join(workDir, "blueprint.json");
        fs.writeFileSync(filePath, JSON.stringify(blueprint));
        return filePath;
    }

    it("exposes the shared hybrid WASM boundary on target discovery", async () => {
        const targets = await service.listTargets(writeBlueprintFile());
        const target = targets.find((candidate) => candidate.target === "wasm");
        expect(target?.unsupportedNotes.join(" ")).toMatch(/separate JavaScript evaluateWinMultiplier/);
        expect(target?.unsupportedNotes.join(" ")).toMatch(/30 total stop bits across all reels/);
        expect(target?.unsupportedNotes.join(" ")).toMatch(/Rejects ways, clusters, mechanics.freeGames, mechanics.holdAndWin, mechanics.jackpot, and nonempty betModes/);
    });

    it.each([
        {winModel: {type: "ways"}},
        {winModel: {type: "clusters", minClusterSize: 3}},
        {scatters: ["B"], mechanics: {freeGames: {scatterSymbol: "B", awardsByCount: {3: 5}}}},
        {symbols: ["A"], paytable: {A: {3: 2}}, reelStrips: [Array<string>(1025).fill("A"), Array<string>(1024).fill("A"), Array<string>(1024).fill("A")]},
    ])("diagnoses unsupported WASM models before publication and permits supported retry: %j", async (model) => {
        const source = writeBlueprintFile(buildBlueprint(model));
        const destination = path.join(workDir, "unsupported.wasm");
        const preview = await service.preview(source, "wasm", destination);
        expect(preview).toMatchObject({status: "unsupported", message: expect.stringMatching(/does not implement|stop bits/)});
        const result = await service.build(source, "wasm", destination);
        expect(result.status).not.toBe("ok");
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
        writeBlueprintFile();
        const recovered = path.join(workDir, "supported.wasm");
        expect(await service.preview(source, "wasm", recovered)).toMatchObject({status: "ok"});
        expect(await service.build(source, "wasm", recovered)).toMatchObject({status: "ok", outputPath: recovered});
    });

    it("waits for all staging cleanup even when another executor has already failed", async () => {
        let release!: () => void;
        const cleanup = new Promise<void>((resolve) => {
            release = resolve;
        });
        jest.spyOn(service, "build")
            .mockImplementationOnce(() => Promise.reject(new Error("executor cleanup failed")))
            .mockImplementationOnce(async () => {
                await cleanup;
                return {status: "cancelled", message: "Staging cleaned", plan: new ArtifactConversionPlanner().planType("blueprint", "tsPackage")};
            });
        expect(service.start(workDir, "tsPackage", path.join(workDir, "first")).status).toBe("created");
        expect(service.start(workDir, "tsPackage", path.join(workDir, "second")).status).toBe("created");
        await Promise.resolve();
        let settled = false;
        const draining = service.cancelAll();
        const rejected = expect(draining).rejects.toThrow("executor cleanup failed");
        draining.catch(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        release();
        await rejected;
    });

    it("rejects every real WASM sidecar state before creating an artifact build job or destination", () => {
        const wasmPath = path.join(workDir, "component.wasm");
        const sidecar = `${wasmPath}.pokie-wasm.json`;
        const destination = path.join(workDir, "out");
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        const compatible = {
            schemaVersion: "1.0.0", component: {id: "fixture", version: "1.0.0"},
            serialization: {session: "session", play: "play", state: "state"}, host: {rng: "rng", services: []}, capabilities: [],
        };
        const cases: readonly [string | undefined, RegExp][] = [
            [JSON.stringify(compatible), /cannot build a POKIE game package/],
            [undefined, /no compatible PokieWasmComponentManifest sidecar/],
            ["{", /sidecar at/],
            [JSON.stringify({...compatible, schemaVersion: "2.0.0"}), /not compatible with this POKIE build/],
        ];
        for (const [contents, expected] of cases) {
            if (contents === undefined) fs.rmSync(sidecar, {force: true});
            else fs.writeFileSync(sidecar, contents);
            const result = service.start(wasmPath, "tsPackage", destination);
            expect(result).toMatchObject({status: "unsupported", message: expect.stringMatching(expected)});
            expect(service.getStatusForProject(wasmPath, "1")).toBeUndefined();
            expect(fs.existsSync(destination)).toBe(false);
        }
    });

    it("does not classify a package directory named .wasm as an inspection-only component", () => {
        const packageDirectory = path.join(workDir, "game.wasm");
        fs.mkdirSync(packageDirectory);

        const result = service.start(packageDirectory, "tsPackage");

        expect(result.status).toBe("created");
        if (result.status === "created") service.cancelForProject(packageDirectory, result.job.id);
    });

    describe("listTargets", () => {
        it("reports the registry-owned Blueprint artifact targets as supported", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(blueprintPath);

            expect(new Set(targets.map((entry) => entry.target))).toEqual(new Set(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
            const byTarget = new Map(targets.map((entry) => [entry.target, entry]));
            expect(byTarget.get("tsPackage")?.supported).toBe(true);
            expect(byTarget.get("outcomeLibrary")?.supported).toBe(true);
            expect(byTarget.get("stakeAdapter")?.supported).toBe(true);
            expect(byTarget.get("parWorkbook")?.supported).toBe(true);
            expect(byTarget.get("wasm")?.supported).toBe(true);
        });

        it("recognizes a managed Blueprint directory for Outcome Library and Stake goals", async () => {
            const blueprintPath = writeBlueprintFile();

            const targets = await service.listTargets(workDir);
            const outcomePreview = await service.preview(workDir, "outcomeLibrary");
            const stakePreview = await service.preview(workDir, "stakeAdapter");

            expect(targets.find((entry) => entry.target === "outcomeLibrary")).toMatchObject({supported: true});
            expect(targets.find((entry) => entry.target === "stakeAdapter")).toMatchObject({supported: true});
            expect(outcomePreview).toMatchObject({status: "ok", sourceType: "blueprint", plan: {source: {canonicalLocation: blueprintPath}}});
            expect(stakePreview).toMatchObject({status: "ok", sourceType: "blueprint", plan: {source: {canonicalLocation: blueprintPath}}});
        });

        it("marks every target unsupported for a path that isn't a recognized POKIE project", async () => {
            const targets = await service.listTargets(path.join(workDir, "does-not-exist"));

            expect(targets.every((entry) => entry.supported === false)).toBe(true);
        });
    });

    describe("preview", () => {
        it("resolves the same default sibling destination build() itself would use, without writing anything", async () => {
            const blueprintPath = writeBlueprintFile();
            const expectedDestination = path.join(workDir, "tsPackage");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(expectedDestination);
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(expectedDestination)).toBe(false);
        });

        it("resolves an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.preview(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.destination).toBe(explicitOut);
        });

        it("previews the registry-owned Blueprint -> Stake hand-off without writing", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.sourceType).toBe("blueprint");
            expect(result.stakePreflight).toMatchObject({
                route: "generate",
                estimatedItemCount: expect.any(String),
                estimatedBytes: expect.any(String),
                unavailableMetrics: [expect.stringContaining("Final Stake byte size")],
            });
            expect(result.stakePreflight?.estimatedItemCount).not.toBe("0");
        });

        it("derives a reuse preview from the verified selected library and returns its provenance after publication", async () => {
            const blueprintPath = writeBlueprintFile();
            const firstDestination = path.join(workDir, "first-stake");
            const first = await service.build(blueprintPath, "stakeAdapter", firstDestination);

            expect(first).toMatchObject({
                status: "ok",
                stakePrerequisiteProvenance: {
                    route: "generate",
                    disposition: "owned",
                    sourceGameId: "sample-slot",
                    sourceGameVersion: "0.1.0",
                    sourceConfigurationHash: expect.stringMatching(/^sha256:/),
                },
            });
            const preview = await service.preview(blueprintPath, "stakeAdapter", path.join(workDir, "reused-stake"));
            expect(preview).toMatchObject({
                status: "ok",
                stakePreflight: {
                    route: "reuse",
                    selectedPrerequisiteLocation: expect.any(String),
                    estimatedItemCount: expect.any(String),
                    estimatedBytes: expect.any(String),
                },
            });
            if (preview.status === "ok") expect(preview.stakePreflight?.unavailableMetrics).toBeUndefined();
        });

        it("binds a Stake build to the opaque operation prepared by preview", async () => {
            const blueprintPath = writeBlueprintFile();

            const preview = await service.preview(blueprintPath, "stakeAdapter");

            expect(preview.status).toBe("ok");
            if (preview.status !== "ok" || preview.preparedOperationId === undefined) {
                throw new Error("expected a retained Stake operation");
            }
            expect(preview.plan.steps.some((step) => step.kind === "generateOutcomeLibrary" || step.kind === "reuseManagedOutcomeLibrary")).toBe(true);

            const started = await service.startPreparedStakeProjection(blueprintPath, preview.preparedOperationId);
            expect(started).toMatchObject({status: "created", job: {target: "stakeAdapter", status: "queued"}});
            // Handles are single-use: retry cannot cause a fresh plan.
            await expect(service.startPreparedStakeProjection(blueprintPath, preview.preparedOperationId)).resolves.toEqual({status: "stale"});
            if (started.status !== "created") throw new Error("expected prepared Stake build to start");
            service.cancelForProject(blueprintPath, started.job.id);
        });

        it("rejects a prepared Stake operation when its source becomes a WASM component", async () => {
            const packagePath = writeBlueprintFile();
            let sourceType: "blueprint" | "wasm" = "blueprint";
            const resolve = jest.fn((location: string) => {
                if (location !== packagePath) return Promise.resolve(undefined);
                if (sourceType === "blueprint") {
                    return Promise.resolve({rootPath: packagePath, type: "blueprint" as const, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "fixture"});
                }
                return Promise.resolve({rootPath: packagePath, type: "wasm" as const, capabilities: PROJECT_TYPE_CAPABILITIES.wasm, provenance: "replacement component"});
            });
            service = new StudioArtifactBuildService("1.3.0", undefined, {resolve});

            const preview = await service.preview(packagePath, "stakeAdapter", path.join(workDir, "replaced-stake"));
            expect(preview.status).toBe("ok");
            if (preview.status !== "ok" || preview.preparedOperationId === undefined) {
                throw new Error("expected a retained Stake operation");
            }
            sourceType = "wasm";

            await expect(service.startPreparedStakeProjection(packagePath, preview.preparedOperationId)).resolves.toMatchObject({
                status: "unsupported",
                message: expect.stringContaining("cannot build a Stake Engine export"),
            });
            expect(fs.existsSync(path.join(workDir, "replaced-stake"))).toBe(false);
        });

        it("reports a conflict for a pre-existing non-empty destination, agreeing with what build() itself would report, and never writes to it", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.preview(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            if (result.status !== "conflict") {
                throw new Error("expected conflict");
            }
            expect(result.destination).toBe(destination);
            expect(result.message).toMatch(/already exists and is not empty/);
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.preview(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
            expect(result.plan).toMatchObject({
                status: "unavailable",
                target: {kind: "tsPackage"},
                diagnostic: {code: "unrecognized-source"},
            });
        });

        it("previews Blueprint -> PAR Workbook with its real file destination", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "parWorkbook");

            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result).toMatchObject({status: "ok", target: "parWorkbook", sourceType: "blueprint", destination: path.join(workDir, "parWorkbook.xlsx")});
            expect(fs.existsSync(path.join(workDir, "parWorkbook.xlsx"))).toBe(false);
        });

        it("previews Blueprint -> WASM with the canonical module file and integrity manifest", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.preview(blueprintPath, "wasm");

            expect(result).toMatchObject({
                status: "ok",
                target: "wasm",
                sourceType: "blueprint",
                destination: path.join(workDir, "game.wasm"),
                destinationKind: "file",
                plannedOutputs: ["Portable game.wasm module", "Integrity-bound POKIE WASM manifest sidecar"],
            });
            expect(fs.existsSync(path.join(workDir, "game.wasm"))).toBe(false);
        });

        it("previews the same durable PAR-to-WASM import companion that a build will publish, without writing it", async () => {
            const workbookPath = path.join(workDir, "source.par.xlsx");
            const destination = path.join(workDir, "exports", "game.wasm");
            const importedBlueprintPath = `${destination}.pokie/par-import/imported.blueprint.json`;
            const conversionEvidencePath = `${destination}.pokie/par-import/conversion-evidence.json`;
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            const result = await service.preview(workbookPath, "wasm", destination);

            expect(result).toMatchObject({
                status: "ok",
                target: "wasm",
                destination,
                destinationKind: "file",
                sourceType: "parWorkbook",
            });
            if (result.status !== "ok") throw new Error("expected preview");
            expect(result.plan.steps[0]).toMatchObject({
                kind: "importParWorkbook",
                output: {canonicalLocation: importedBlueprintPath},
                conversionEvidencePath,
            });
            expect(fs.existsSync(importedBlueprintPath)).toBe(false);
            expect(fs.existsSync(conversionEvidencePath)).toBe(false);
        });
    });

    describe("build", () => {
        it("builds a tsPackage from a blueprint source to the default sibling destination, matching BuildCommand's own default", async () => {
            const blueprintPath = writeBlueprintFile();

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "tsPackage"));
            expect(result.sourceType).toBe("blueprint");
            expect(fs.existsSync(path.join(result.outputPath, "package.json"))).toBe(true);
        });

        it("builds to an explicit outDir when given", async () => {
            const blueprintPath = writeBlueprintFile();
            const explicitOut = path.join(workDir, "my-custom-out");

            const result = await service.build(blueprintPath, "tsPackage", explicitOut);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(explicitOut);
        });

        it("builds a Blueprint into the canonical WASM module and integrity-bound manifest through the ordinary lifecycle", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({
                reels: 2,
                rows: 1,
                paytable: {A: {2: 5}, B: {2: 2}},
                reelStrips: [["A", "B"], ["A", "B"]],
                availableBets: [1],
            }));

            const result = await service.build(blueprintPath, "wasm");

            expect(result).toMatchObject({
                status: "ok",
                target: "wasm",
                outputPath: path.join(workDir, "game.wasm"),
                outputKind: "file",
                sourceType: "blueprint",
            });
            if (result.status !== "ok") throw new Error("expected WASM build to complete");
            expect(fs.existsSync(result.outputPath)).toBe(true);
            expect(fs.existsSync(`${result.outputPath}.pokie-wasm.json`)).toBe(true);
        });

        it("rolls back every PAR-to-WASM publication when Studio registration fails", async () => {
            const workbookPath = path.join(workDir, "source.par.xlsx");
            const outputPath = path.join(workDir, "failed-game.wasm");
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => Promise.reject(new Error("Studio registry unavailable")),
            );

            await expect(service.build(workbookPath, "wasm", outputPath)).resolves.toMatchObject({
                status: "error",
                message: "Studio registry unavailable",
            });

            expect(fs.existsSync(workbookPath)).toBe(true);
            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.existsSync(`${outputPath}.pokie-wasm.json`)).toBe(false);
            expect(fs.existsSync(`${outputPath}.pokie`)).toBe(false);
        });

        it("rolls back every PAR-to-WASM publication when cancellation arrives after the writer completes", async () => {
            const workbookPath = path.join(workDir, "source.par.xlsx");
            const outputPath = path.join(workDir, "cancelled-game.wasm");
            const controller = new AbortController();
            const registry = new ArtifactBuilderRegistry("1.3.0");
            const cancellationAtPostWriterBoundary = {
                preparePlan: (...args: Parameters<ArtifactBuilderRegistry["preparePlan"]>) => registry.preparePlan(...args),
                executePlan: async (...args: Parameters<ArtifactBuilderRegistry["executePlan"]>) => {
                    const result = await registry.executePlan(...args);
                    controller.abort();
                    return result;
                },
            } as unknown as ArtifactBuilderRegistry;
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService("1.3.0", cancellationAtPostWriterBoundary);

            await expect(service.build(workbookPath, "wasm", outputPath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(workbookPath)).toBe(true);
            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.existsSync(`${outputPath}.pokie-wasm.json`)).toBe(false);
            expect(fs.existsSync(`${outputPath}.pokie`)).toBe(false);
        });

        it("builds PAR Blueprints into an explicit nested destination whose parent is absent", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const destination = path.join(workDir, "missing", "blueprints", "imported.blueprint.json");
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            const result = await service.build(workbookPath, "blueprint", destination);

            expect(result).toMatchObject({status: "ok", outputPath: destination});
            expect(fs.existsSync(destination)).toBe(true);
            expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(true);
        });

        it("rolls back PAR terminal, durable evidence, generated prerequisite, and registrations when Studio registration fails", async () => {
            const outputPath = path.join(workDir, "package");
            const importedBlueprintPath = path.join(outputPath, ".pokie", "par-import", "imported.blueprint.json");
            const prerequisitePath = path.join(workDir, "generated-outcome");
            const project: PokieProject = {
                type: "parWorkbook",
                rootPath: path.join(workDir, "source.xlsx"),
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            fs.writeFileSync(project.rootPath, "source");
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const registry = {
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                executePlan: () => {
                    fs.mkdirSync(outputPath);
                    fs.mkdirSync(path.dirname(importedBlueprintPath), {recursive: true});
                    fs.writeFileSync(path.join(outputPath, "package.json"), "terminal artifact");
                    fs.writeFileSync(importedBlueprintPath, "imported blueprint");
                    fs.writeFileSync(`${importedBlueprintPath}.conversion-evidence.json`, "evidence");
                    fs.mkdirSync(prerequisitePath);
                    return Promise.resolve({
                        outputPath,
                        importedBlueprintPath,
                        conversionEvidencePath: path.join(path.dirname(importedBlueprintPath), "conversion-evidence.json"),
                        prerequisiteProjectRoots: [prerequisitePath],
                        managedProjectRoots: [prerequisitePath],
                    });
                },
            } as unknown as ArtifactBuilderRegistry;
            const unregistered: string[] = [];
            service = new StudioArtifactBuildService(
                "1.3.0",
                registry,
                resolver,
                () => Promise.reject(new Error("registry unavailable")),
                undefined,
                undefined,
                (root) => {
                    unregistered.push(root);
                    return Promise.resolve();
                },
            );

            await expect(service.build(project.rootPath, "tsPackage", outputPath)).resolves.toMatchObject({status: "error"});

            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.existsSync(importedBlueprintPath)).toBe(false);
            expect(fs.existsSync(prerequisitePath)).toBe(false);
            expect(unregistered).toEqual(expect.arrayContaining([outputPath, importedBlueprintPath, prerequisitePath]));
        });

        it("releases a generated Blueprint Outcome record when Studio registration fails after the registry has published it", async () => {
            const blueprintPath = writeBlueprintFile();
            const outcomePath = path.join(workDir, "failed-outcomes");
            const unregistered: string[] = [];
            fs.mkdirSync(outcomePath);
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => Promise.reject(new Error("Studio registry unavailable")),
                undefined,
                undefined,
                (projectRoot) => {
                    unregistered.push(projectRoot);
                    return Promise.resolve();
                },
            );

            await expect(service.build(blueprintPath, "outcomeLibrary", outcomePath)).resolves.toMatchObject({
                status: "error",
                message: "Studio registry unavailable",
            });

            expect(fs.existsSync(outcomePath)).toBe(true);
            expect(fs.readdirSync(outcomePath)).toEqual([]);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            expect(unregistered).toEqual([outcomePath]);
        });

        it("releases a generated Blueprint Stake prerequisite when cancellation arrives during Studio registration", async () => {
            const blueprintPath = writeBlueprintFile();
            const stakePath = path.join(workDir, "cancelled-stake");
            const controller = new AbortController();
            const unregistered: string[] = [];
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => {
                    controller.abort();
                    return Promise.resolve();
                },
                undefined,
                undefined,
                (projectRoot) => {
                    unregistered.push(projectRoot);
                    return Promise.resolve();
                },
            );

            await expect(service.build(blueprintPath, "stakeAdapter", stakePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(stakePath)).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            expect(unregistered).toEqual(expect.arrayContaining([stakePath]));
        });

        it("cancels a real PAR-to-Stake registration without leaving its terminal, evidence, or managed prerequisite behind", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const stakePath = path.join(workDir, "cancelled-par-stake");
            const controller = new AbortController();
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService(
                "1.3.0",
                undefined,
                undefined,
                () => {
                    controller.abort();
                    return Promise.resolve();
                },
            );

            await expect(service.build(workbookPath, "stakeAdapter", stakePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(workbookPath)).toBe(true);
            expect(fs.existsSync(stakePath)).toBe(false);
            expect(fs.existsSync(path.join(stakePath, ".pokie", "par-import", "conversion-evidence.json"))).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        });

        it.each(["outcomeLibrary", "stakeAdapter"] as const)("removes the Studio Outcome registration when PAR-to-%s is cancelled during promotion", async (target) => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const destination = path.join(workDir, target === "outcomeLibrary" ? "cancelled-outcome" : "cancelled-stake");
            const controller = new AbortController();
            const projectRegistration = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry());
            const managedOutcomes = new ManagedOutcomeProjectService(
                undefined,
                async (project) => {
                    const registered = await projectRegistration.registerManaged(project.rootPath, path.basename(project.rootPath));
                    if (registered.status !== "ok") throw new Error("Studio registry unavailable");
                },
                undefined,
                (projectRoot) => projectRegistration.remove(projectRoot),
            );
            let registrations = 0;
            const cancellationAfterPromotion = {
                findCompatible: (...args: Parameters<ManagedOutcomeProjectService["findCompatible"]>) => managedOutcomes.findCompatible(...args),
                allocateRoot: (...args: Parameters<ManagedOutcomeProjectService["allocateRoot"]>) => managedOutcomes.allocateRoot(...args),
                release: (...args: Parameters<ManagedOutcomeProjectService["release"]>) => managedOutcomes.release(...args),
                registerAndOpen: async (...args: Parameters<ManagedOutcomeProjectService["registerAndOpen"]>) => {
                    registrations++;
                    const project = await managedOutcomes.registerAndOpen(...args);
                    if (registrations === 2) controller.abort();
                    return project;
                },
            };
            const registry = new ArtifactBuilderRegistry("1.3.0", undefined, cancellationAfterPromotion);
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService("1.3.0", registry);

            await expect(service.build(workbookPath, target, destination, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(destination)).toBe(false);
            expect(await projectRegistration.list()).toEqual([]);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
        });

        it("keeps PAR-to-Stake managed and Studio roots durable after successful registration", async () => {
            const workbookPath = path.join(workDir, "source.xlsx");
            const stakePath = path.join(workDir, "par-stake");
            const registeredProjects: string[] = [];
            fs.copyFileSync(path.join(__dirname, "..", "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(workbookPath, "stakeAdapter", stakePath);

            expect(result).toMatchObject({status: "ok", importedBlueprintPath: expect.any(String)});
            expect(registeredProjects).toEqual(expect.arrayContaining([stakePath, result.status === "ok" ? result.importedBlueprintPath : ""]));
            expect(registeredProjects.every((projectRoot) => fs.existsSync(projectRoot))).toBe(true);
            const managedRegistryPath = path.join(stakePath, ".pokie", "par-import", ".pokie", "managed-outcome-projects.json");
            expect(fs.existsSync(managedRegistryPath)).toBe(true);
            const managedRegistry = JSON.parse(fs.readFileSync(managedRegistryPath, "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects).toHaveLength(1);
            expect(fs.existsSync(managedRegistry.projects[0].rootPath)).toBe(true);
        });

        it("releases only a republished reused Outcome when Studio registration fails", async () => {
            const blueprintPath = writeBlueprintFile();
            const originalOutcomePath = path.join(workDir, "original-outcome");
            const republishedOutcomePath = path.join(workDir, "republished-outcome");
            await expect(service.build(blueprintPath, "outcomeLibrary", originalOutcomePath)).resolves.toMatchObject({status: "ok"});
            fs.mkdirSync(republishedOutcomePath);
            const failingService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => Promise.reject(new Error("Studio registry unavailable")));

            await expect(failingService.build(blueprintPath, "outcomeLibrary", republishedOutcomePath)).resolves.toMatchObject({status: "error"});

            expect(fs.existsSync(originalOutcomePath)).toBe(true);
            expect(fs.readdirSync(republishedOutcomePath)).toEqual([]);
            const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects.map((project) => project.rootPath)).toEqual([originalOutcomePath]);
        });

        it("releases only a republished reused Outcome when Studio registration is cancelled", async () => {
            const blueprintPath = writeBlueprintFile();
            const originalOutcomePath = path.join(workDir, "original-outcome");
            const republishedOutcomePath = path.join(workDir, "republished-outcome");
            const controller = new AbortController();
            await expect(service.build(blueprintPath, "outcomeLibrary", originalOutcomePath)).resolves.toMatchObject({status: "ok"});
            const cancellingService = new StudioArtifactBuildService("1.3.0", undefined, undefined, () => {
                controller.abort();
                return Promise.resolve();
            });

            await expect(cancellingService.build(blueprintPath, "outcomeLibrary", republishedOutcomePath, {signal: controller.signal})).resolves.toMatchObject({status: "cancelled"});

            expect(fs.existsSync(originalOutcomePath)).toBe(true);
            expect(fs.existsSync(republishedOutcomePath)).toBe(false);
            const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf8")) as {projects: readonly {rootPath: string}[]};
            expect(managedRegistry.projects.map((project) => project.rootPath)).toEqual([originalOutcomePath]);
        });

        it("builds Blueprint -> Stake through the shared registry and registers the generated Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "stakeAdapter");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(fs.existsSync(path.join(result.outputPath, "index.json"))).toBe(true);
            expect(registeredProjects).toHaveLength(1);
            expect(fs.existsSync(path.join(registeredProjects[0], "manifest.json"))).toBe(true);
        });

        it("builds Blueprint -> Outcome through the shared registry and registers the opened Outcome Project", async () => {
            const blueprintPath = writeBlueprintFile();
            const registeredProjects: string[] = [];
            service = new StudioArtifactBuildService("1.3.0", undefined, undefined, (projectRoot) => {
                registeredProjects.push(projectRoot);
                return Promise.resolve();
            });

            const result = await service.build(blueprintPath, "outcomeLibrary");

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.outputPath).toBe(path.join(workDir, "outcomeLibrary"));
            expect(registeredProjects).toEqual([result.outputPath]);
            expect(fs.existsSync(path.join(result.outputPath, "manifest.json"))).toBe(true);
        });

        it("builds an explicit Blueprint Outcome destination even when a compatible managed project exists", async () => {
            const blueprintPath = writeBlueprintFile();
            const firstOutcomeDir = path.join(workDir, "first-outcome");
            const secondOutcomeDir = path.join(workDir, "second-outcome");

            await expect(service.build(blueprintPath, "outcomeLibrary", firstOutcomeDir)).resolves.toMatchObject({
                status: "ok",
                outputPath: firstOutcomeDir,
            });
            await expect(service.build(blueprintPath, "outcomeLibrary", secondOutcomeDir)).resolves.toMatchObject({
                status: "ok",
                target: "outcomeLibrary",
                outputPath: secondOutcomeDir,
                outputKind: "directory",
                sourceType: "blueprint",
                plan: {status: "planned", steps: [expect.objectContaining({kind: "reuseManagedOutcomeLibrary"}), expect.objectContaining({kind: "publish"})]},
            });
            expect(fs.existsSync(path.join(secondOutcomeDir, "manifest.json"))).toBe(true);
        });

        it("reports a conflict (never writing) for a pre-existing non-empty destination", async () => {
            const blueprintPath = writeBlueprintFile();
            const destination = path.join(workDir, "tsPackage");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("conflict");
            expect(fs.readdirSync(destination)).toEqual(["unrelated.txt"]);
        });

        it("reports an error for a project path that doesn't resolve", async () => {
            const result = await service.build(path.join(workDir, "does-not-exist"), "tsPackage");

            expect(result.status).toBe("error");
            if (result.status !== "error") {
                throw new Error("expected error");
            }
            expect(result.message).toContain("was not recognized as a POKIE project");
            expect(result.plan).toMatchObject({
                status: "unavailable",
                target: {kind: "tsPackage"},
                diagnostic: {code: "unrecognized-source"},
            });
        });

        it("reports a plain error (not a crash) for an invalid blueprint", async () => {
            const blueprintPath = writeBlueprintFile(buildBlueprint({symbols: []}));

            const result = await service.build(blueprintPath, "tsPackage");

            expect(result.status).toBe("error");
        });
    });

    describe("bounded build jobs", () => {
        it("publishes preflight and running progress before completion, and cancellation reaches the shared builder signal", async () => {
            let releaseBuild: (() => void) | undefined;
            const publishGate = new Promise<void>((resolve) => {
                releaseBuild = resolve;
            });
            const project: PokieProject = {
                type: "blueprint",
                rootPath: path.join(workDir, "blueprint.json"),
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const registry = {
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                build: async (_target: string, _source: PokieProject, _destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => {
                    options.onProgress?.({status: "preflight", preflight: {estimatedItemCount: BigInt(12), estimatedBytes: BigInt(34), complexityWarning: "Large publish"}});
                    options.onProgress?.({status: "running", completed: BigInt(1), total: BigInt(12), message: "Writing outcomes"});
                    await publishGate;
                    if (options.signal?.aborted) throw new ArtifactBuildCancelledError();
                    return {outputPath: path.join(workDir, "out")};
                },
                executePlan: (plan: {target: {kind: ArtifactTargetType}}, source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => registry.build(plan.target.kind, source, destination, options),
            } as unknown as ArtifactBuilderRegistry;
            service = new StudioArtifactBuildService("1.3.0", registry, resolver);
            const durableDirectory = path.join(workDir, "durable-artifact-jobs");
            const durableJobs = new StudioJobService(new FileStudioJobRepository(durableDirectory));
            service.attachJobService(durableJobs);

            const started = service.start(project.rootPath, "outcomeLibrary", path.join(workDir, "out"));
            if (started.status !== "created") throw new Error("expected artifact job to be created");
            expect(started.job.status).toBe("queued");
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 0);
            });

            expect(service.getStatusForProject(project.rootPath, started.job.id)).toMatchObject({
                status: "running",
                progress: {status: "running", completed: "1", total: "12", message: "Writing outcomes"},
            });
            expect(service.getStatusForProject(project.rootPath, started.job.id)?.progress?.preflight).toEqual({
                estimatedItemCount: "12",
                estimatedBytes: "34",
                complexityWarning: "Large publish",
            });

            // Durable exact retries reattach, while another builder targeting
            // the same canonical output is a resource conflict regardless of
            // target spelling.
            expect(service.start(project.rootPath, "outcomeLibrary", path.join(workDir, ".", "out"))).toMatchObject({status: "created", job: {id: started.job.id}});
            expect(service.start(project.rootPath, "tsPackage", path.join(workDir, "out"))).toEqual({status: "conflict", activeJobId: started.job.id});

            expect(service.cancelForProject(project.rootPath, started.job.id)).toMatchObject({cancellationRequested: true, status: "cancelling"});
            releaseBuild?.();
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 0);
            });
            expect(service.getStatusForProject(project.rootPath, started.job.id)).toMatchObject({
                status: "cancelled",
                result: {status: "cancelled", plan: {status: "planned", target: {kind: "outcomeLibrary"}}},
            });
            expect(durableJobs.list(project.rootPath)).toEqual([expect.objectContaining({id: started.job.id, status: "cancelled"})]);
            const restarted = new StudioArtifactBuildService("1.3.0");
            restarted.attachJobService(new StudioJobService(new FileStudioJobRepository(durableDirectory)));
            expect(restarted.getStatusForProject(project.rootPath, started.job.id)).toMatchObject({status: "cancelled"});
        });

        it("cancels a running real Outcome publish through the job workflow without publishing output or registering a managed Project", async () => {
            const outputPath = path.join(workDir, "cancelled-outcome-library");
            const managedProjects: string[] = [];
            const project: PokieProject = {
                type: "blueprint",
                rootPath: path.join(workDir, "blueprint.json"),
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const resolver: ProjectResolving = {resolve: () => Promise.resolve(project)};
            const sampleOutcome = firstOutcomeFrom(buildOutcomeLibraryBundleModeInput("base", "cancelled-library").outcomes);
            let publishStarted: (() => void) | undefined;
            const publishing = new Promise<void>((resolve) => {
                publishStarted = resolve;
            });
            async function *cancellableOutcomes(): AsyncIterable<typeof sampleOutcome> {
                for (let index = 0; index < 512; index += 1) {
                    yield {
                        ...sampleOutcome,
                        id: index.toString().padStart(4, "0"),
                        artifact: {...sampleOutcome.artifact, roundId: `cancelled-round-${index}`},
                    };
                }
            }
            const registry = {
                preparePlan: (_source: PokieProject, target: string) => Promise.resolve({status: "planned", target: {kind: target}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: false}}),
                build: async (_target: string, _source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => {
                    options.onProgress?.({status: "preflight", preflight: {estimatedItemCount: BigInt(512), estimatedBytes: BigInt(0), complexityWarning: "Large publish"}});
                    let result;
                    try {
                        result = await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
                            [{...buildOutcomeLibraryBundleModeInput("base", "cancelled-library"), outcomes: cancellableOutcomes()}],
                            destination,
                            {
                                signal: options.signal,
                                onProgress: (progress) => {
                                    options.onProgress?.({status: "running", completed: progress.completed, total: BigInt(512), message: progress.message});
                                    publishStarted?.();
                                },
                            },
                        );
                    } catch (error) {
                        if (options.signal?.aborted) throw new ArtifactBuildCancelledError();
                        throw error;
                    }
                    if (result.manifest === undefined) throw new Error("Expected the real Outcome writer to publish a valid bundle.");
                    return {outputPath: destination, managedProjectRoots: [destination]};
                },
                executePlan: (plan: {target: {kind: ArtifactTargetType}}, source: PokieProject, destination: string, options: {signal?: AbortSignal; onProgress?: (progress: unknown) => void}) => registry.build(plan.target.kind, source, destination, options),
            } as unknown as ArtifactBuilderRegistry;
            service = new StudioArtifactBuildService("1.3.0", registry, resolver, (projectRoot) => {
                managedProjects.push(projectRoot);
                return Promise.resolve();
            });

            const started = service.start(project.rootPath, "outcomeLibrary", outputPath);
            if (started.status !== "created") throw new Error("expected artifact job to be created");
            await publishing;
            expect(service.getStatusForProject(project.rootPath, started.job.id)).toMatchObject({
                status: "running",
                progress: {status: "running", preflight: {estimatedItemCount: "512", complexityWarning: "Large publish"}},
            });

            expect(service.cancelForProject(project.rootPath, started.job.id)).toMatchObject({status: "running", cancellationRequested: true});
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });

            expect(service.getStatusForProject(project.rootPath, started.job.id)).toMatchObject({
                status: "cancelled",
                cancellationRequested: true,
                result: {status: "cancelled", plan: {status: "planned", target: {kind: "outcomeLibrary"}}},
            });
            expect(fs.existsSync(outputPath)).toBe(false);
            expect(fs.readdirSync(workDir).filter((entry) => entry.startsWith("cancelled-outcome-library.staging-"))).toEqual([]);
            expect(managedProjects).toEqual([]);
        });
    });
});

function firstOutcomeFrom(outcomes: Iterable<WeightedOutcomeInput<string>> | AsyncIterable<WeightedOutcomeInput<string>>): WeightedOutcomeInput<string> {
    if (!isIterable(outcomes)) {
        throw new Error("Expected an Outcome bundle fixture to be synchronously iterable.");
    }
    const [outcome] = outcomes;
    if (outcome !== undefined) return outcome;
    throw new Error("Expected an Outcome bundle fixture to contain an outcome.");
}

function isIterable<T>(value: Iterable<T> | AsyncIterable<T>): value is Iterable<T> {
    return Symbol.iterator in value;
}
