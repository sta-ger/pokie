import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioProjectRegistry} from "../../../cli/studio/FileStudioProjectRegistry.js";
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
});
