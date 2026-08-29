import fs from "fs";
import os from "os";
import path from "path";
import type {PlatformDirectoryEnvironment} from "../../../cli/paths/PlatformDirectoryEnvironment.js";
import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import {FileStudioProjectRegistry} from "../../../cli/studio/FileStudioProjectRegistry.js";
import {PROJECT_REGISTRY_FILE_NAME} from "../../../cli/studio/StudioProjectRegistrationService.js";
import type {StudioProjectRegistryEntry} from "../../../cli/studio/StudioProjectRegistryEntry.js";

function entry(location: string, overrides: Partial<StudioProjectRegistryEntry> = {}): StudioProjectRegistryEntry {
    return {
        location,
        name: "Game",
        type: "tsPackage",
        capabilities: ["runtime.execute"],
        origin: "managed",
        lastOpenedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe("FileStudioProjectRegistry", () => {
    let tempDir: string;
    let registryFile: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-studio-project-registry-"));
        registryFile = path.join(tempDir, "app-data", "projects.json");
    });

    afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    it("starts empty when the registry file doesn't exist yet", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);

        expect(await registry.list()).toEqual([]);
    });

    it("persists an upserted entry across separate registry instances (survives a Studio restart)", async () => {
        const first = new FileStudioProjectRegistry(registryFile);
        await first.upsert(entry("/a"));

        const second = new FileStudioProjectRegistry(registryFile);

        expect((await second.list()).map((e) => e.location)).toEqual(["/a"]);
    });

    it("creates every missing intermediate directory for the registry file", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);

        await registry.upsert(entry("/a"));

        expect(fs.existsSync(path.dirname(registryFile))).toBe(true);
    });

    it("de-duplicates by location, moving the re-registered entry to the front", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);

        await registry.upsert(entry("/a", {name: "Game A"}));
        await registry.upsert(entry("/b", {name: "Game B"}));
        await registry.upsert(entry("/a", {name: "Game A renamed"}));

        const list = await registry.list();
        expect(list.map((e) => e.location)).toEqual(["/a", "/b"]);
        expect(list[0].name).toBe("Game A renamed");
    });

    it("does not replace a pre-existing entry when its prepared Home commit is no longer current", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);
        await registry.upsert(entry("/existing", {name: "Existing"}));

        const committed = await registry.replace(entry("/opening", {name: "Opening"}), ["/existing"], {isCurrent: () => false});

        expect(committed).toBe(false);
        expect(await registry.list()).toEqual([expect.objectContaining({location: "/existing", name: "Existing"})]);
    });

    it("serializes a sibling registration behind an in-flight guarded Home replace", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);
        await registry.upsert(entry("/existing", {name: "Existing"}));

        const originalWriteFile = fs.promises.writeFile.bind(fs.promises);
        let releaseFirstWrite: (() => void) | undefined;
        let notifyFirstWrite: (() => void) | undefined;
        const firstWriteStarted = new Promise<void>((resolve) => {
            notifyFirstWrite = resolve;
        });
        let writeCount = 0;
        const writeSpy = jest.spyOn(fs.promises, "writeFile").mockImplementation(async (...arguments_) => {
            writeCount++;
            if (writeCount === 1) {
                notifyFirstWrite?.();
                await new Promise<void>((resolve) => {
                    releaseFirstWrite = resolve;
                });
            }
            return originalWriteFile(...arguments_);
        });

        const registering = registry.upsert(entry("/registered", {name: "Registered"}));
        await firstWriteStarted;
        const opening = registry.replace(entry("/opening", {name: "Opening"}), ["/existing"]);

        // The Home replace must not begin its own stale read-modify-write while registration owns the
        // transaction. Without the shared queue it reaches a second write here and can overwrite the
        // sibling record after its delayed first write completes.
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(writeCount).toBe(1);

        releaseFirstWrite?.();
        await expect(Promise.all([registering, opening])).resolves.toEqual([undefined, true]);
        writeSpy.mockRestore();

        expect((await registry.list()).map((candidate) => candidate.location)).toEqual(["/opening", "/registered"]);
    });

    it("rolls a superseded Home replace back without removing a queued sibling mutation", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);
        await registry.upsert(entry("/existing", {name: "Existing"}));
        let current = true;
        const originalWriteFile = fs.promises.writeFile.bind(fs.promises);
        let homeWriteCompleted = false;
        const writeSpy = jest.spyOn(fs.promises, "writeFile").mockImplementation(async (...arguments_) => {
            const result = await originalWriteFile(...arguments_);
            if (!homeWriteCompleted) {
                homeWriteCompleted = true;
                current = false;
            }
            return result;
        });

        const opening = registry.replace(entry("/opening", {name: "Opening"}), ["/existing"], {isCurrent: () => current});
        const registering = registry.upsert(entry("/registered", {name: "Registered"}));

        await expect(opening).resolves.toBe(false);
        await registering;
        writeSpy.mockRestore();

        expect((await registry.list()).map((candidate) => candidate.location)).toEqual(["/registered", "/existing"]);
    });

    it("removes an entry by location and persists the removal", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);
        await registry.upsert(entry("/a"));
        await registry.upsert(entry("/b"));

        await registry.remove("/a");

        expect((await new FileStudioProjectRegistry(registryFile).list()).map((e) => e.location)).toEqual(["/b"]);
    });

    it("writes atomically, leaving no leftover temp file behind", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);

        await registry.upsert(entry("/a"));

        expect(fs.readdirSync(path.dirname(registryFile))).toEqual(["projects.json"]);
    });

    it("treats a corrupted registry file as empty rather than throwing", async () => {
        fs.mkdirSync(path.dirname(registryFile), {recursive: true});
        fs.writeFileSync(registryFile, "not valid json{{{", "utf-8");
        const registry = new FileStudioProjectRegistry(registryFile);

        expect(await registry.list()).toEqual([]);
    });

    it("treats a registry file holding something other than a JSON array as empty rather than throwing", async () => {
        fs.mkdirSync(path.dirname(registryFile), {recursive: true});
        fs.writeFileSync(registryFile, JSON.stringify({not: "an array"}), "utf-8");
        const registry = new FileStudioProjectRegistry(registryFile);

        expect(await registry.list()).toEqual([]);
    });

    it("propagates a non-ENOENT read failure instead of silently reporting an empty list", async () => {
        const registry = new FileStudioProjectRegistry(registryFile);
        const readSpy = jest.spyOn(fs.promises, "readFile").mockRejectedValueOnce(Object.assign(new Error("EACCES"), {code: "EACCES"}));

        await expect(registry.list()).rejects.toThrow("EACCES");

        readSpy.mockRestore();
    });

    describe("rooted at PokiePathResolver.resolveAppDataDirectory() (the real Studio composition path)", () => {
        it("persists a registered project at the platform app-data location across a Studio restart", async () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {XDG_CONFIG_HOME: path.join(tempDir, "xdg-config")}, homeDir: tempDir};
            const resolver = new PokiePathResolver({}, env);
            const appDataDirectory = resolver.resolveAppDataDirectory();
            if (appDataDirectory === undefined) {
                throw new Error("expected a resolvable app-data directory in this test");
            }
            const registryFileAtAppData = path.join(appDataDirectory, PROJECT_REGISTRY_FILE_NAME);

            await new FileStudioProjectRegistry(registryFileAtAppData).upsert(entry("/a"));

            // A brand-new instance rooted at that same resolved path -- simulating Studio restarting as
            // a fresh process -- must see the same entry purely by reading the shared app-data file.
            expect((await new FileStudioProjectRegistry(registryFileAtAppData).list()).map((e) => e.location)).toEqual(["/a"]);
        });
    });
});
