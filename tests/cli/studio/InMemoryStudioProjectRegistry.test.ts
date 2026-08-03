import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
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

describe("InMemoryStudioProjectRegistry", () => {
    it("starts empty", async () => {
        const registry = new InMemoryStudioProjectRegistry();

        expect(await registry.list()).toEqual([]);
    });

    it("lists upserted entries most-recent-first", async () => {
        const registry = new InMemoryStudioProjectRegistry();

        await registry.upsert(entry("/a"));
        await registry.upsert(entry("/b"));

        expect((await registry.list()).map((e) => e.location)).toEqual(["/b", "/a"]);
    });

    it("de-duplicates by location, moving the re-registered entry to the front", async () => {
        const registry = new InMemoryStudioProjectRegistry();

        await registry.upsert(entry("/a", {name: "Game A"}));
        await registry.upsert(entry("/b", {name: "Game B"}));
        await registry.upsert(entry("/a", {name: "Game A renamed"}));

        const list = await registry.list();
        expect(list.map((e) => e.location)).toEqual(["/a", "/b"]);
        expect(list[0].name).toBe("Game A renamed");
    });

    it("keeps every entry, unlike InMemoryRecentProjectsRepository's capped list", async () => {
        const registry = new InMemoryStudioProjectRegistry();

        for (let i = 0; i < 15; i++) {
            await registry.upsert(entry(`/project-${i}`));
        }

        expect(await registry.list()).toHaveLength(15);
    });

    it("removes an entry by location", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        await registry.upsert(entry("/a"));
        await registry.upsert(entry("/b"));

        await registry.remove("/a");

        expect((await registry.list()).map((e) => e.location)).toEqual(["/b"]);
    });

    it("removing an unknown location is a no-op", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        await registry.upsert(entry("/a"));

        await registry.remove("/does-not-exist");

        expect((await registry.list()).map((e) => e.location)).toEqual(["/a"]);
    });
});
