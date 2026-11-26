import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import type {StudioProjectRegistryEntry} from "../../../cli/studio/StudioProjectRegistryEntry.js";

function entry(location: string, name: string): StudioProjectRegistryEntry {
    return {
        location,
        name,
        type: "blueprint",
        capabilities: [],
        origin: "managed",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("StudioProjectRegistrationService.removeMissing", () => {
    it("removes every missing entry in one registry mutation and keeps available entries", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        await registry.upsert(entry("/projects/available/game.json", "Available"));
        await registry.upsert(entry("/projects/missing/one.json", "Missing one"));
        await registry.upsert(entry("/projects/missing/two.json", "Missing two"));
        const service = new StudioProjectRegistrationService(
            registry,
            undefined,
            (candidate) => candidate === "/projects/available/game.json",
        );

        await expect(service.removeMissing()).resolves.toBe(2);

        const remaining = await service.list();
        expect(remaining.map((row) => row.name)).toEqual(["Available"]);
        expect(remaining[0]?.status).toBe("ok");
    });

    it("is a no-op when every entry still exists", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        await registry.upsert(entry("/projects/available/game.json", "Available"));
        const service = new StudioProjectRegistrationService(registry, undefined, () => true);

        await expect(service.removeMissing()).resolves.toBe(0);
        await expect(registry.list()).resolves.toHaveLength(1);
    });
});
