import os from "node:os";
import path from "node:path";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {MANAGED_MISSING_PROJECT_RETENTION_DAYS, MISSING_PROJECT_RETENTION_DAYS, StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import type {StudioProjectRegistryEntry} from "../../../cli/studio/StudioProjectRegistryEntry.js";

function entry(location: string, name: string, lastOpenedAt = new Date().toISOString()): StudioProjectRegistryEntry {
    return {
        location,
        name,
        type: "blueprint",
        capabilities: [],
        origin: "managed",
        lastOpenedAt,
    };
}

describe("StudioProjectRegistrationService self-cleaning registry", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");

    it("removes temporary/cache entries immediately and expires old missing projects", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        const available = path.join(os.homedir(), "pokie-projects", "available", "blueprint.json");
        const temporary = path.join(os.tmpdir(), "pokie-test-temp", "blueprint.json");
        const cache = path.join(os.homedir(), "project", "node_modules", ".cache", "pokie-test", "blueprint.json");
        const recentExternal = path.join(os.homedir(), "external", "recent", "blueprint.json");
        const oldExternal = path.join(os.homedir(), "external", "old", "blueprint.json");
        const oldDate = new Date(now - (MISSING_PROJECT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
        const recentDate = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
        await registry.upsert(entry(available, "Available"));
        await registry.upsert(entry(temporary, "Temporary"));
        await registry.upsert(entry(cache, "Cache"));
        await registry.upsert(entry(recentExternal, "Recent external", recentDate));
        await registry.upsert(entry(oldExternal, "Old external", oldDate));

        const service = new StudioProjectRegistrationService(
            registry,
            undefined,
            (candidate) => candidate === available,
        );

        await expect(service.pruneStaleMissing(now)).resolves.toBe(3);
        await expect(registry.list()).resolves.toEqual([
            expect.objectContaining({name: "Recent external"}),
            expect.objectContaining({name: "Available"}),
        ]);
    });

    it("keeps every existing project and a recently missing external project", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        const available = path.join(os.homedir(), "pokie-projects", "available", "blueprint.json");
        const recentExternal = path.join(os.homedir(), "external", "recent", "blueprint.json");
        await registry.upsert(entry(available, "Available"));
        await registry.upsert(entry(recentExternal, "Recent external", new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()));
        const service = new StudioProjectRegistrationService(registry, undefined, (candidate) => candidate === available);

        await expect(service.pruneStaleMissing(now)).resolves.toBe(0);
        await expect(registry.list()).resolves.toHaveLength(2);
    });
});

describe("managed versus external missing-project retention", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");

    it("removes a managed project after 30 days but keeps an external project for 90 days", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        const managed = entry(path.join(os.homedir(), "POKIE Projects", "old-managed", "blueprint.json"), "Old managed", new Date(now - (MANAGED_MISSING_PROJECT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString());
        const external = {
            ...entry(path.join(os.homedir(), "external", "old-but-not-expired", "blueprint.json"), "Old external", new Date(now - (MANAGED_MISSING_PROJECT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString()),
            origin: "external" as const,
        };
        await registry.upsert(managed);
        await registry.upsert(external);
        const service = new StudioProjectRegistrationService(registry, undefined, () => false);

        await expect(service.pruneStaleMissing(now)).resolves.toBe(1);
        await expect(registry.list()).resolves.toEqual([expect.objectContaining({name: "Old external"})]);
    });
});
