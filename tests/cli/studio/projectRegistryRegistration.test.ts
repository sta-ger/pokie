import fs from "fs";
import os from "os";
import path from "path";
import {PROJECT_TYPE_CAPABILITIES, type PokieProject, type ProjectResolving} from "@fromstan/pokie";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";

function blueprintResolver(): ProjectResolving {
    return {
        resolve(targetPath: string): Promise<PokieProject> {
            return Promise.resolve({
                type: "blueprint",
                rootPath: targetPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            });
        },
    };
}

describe("StudioProjectRegistrationService registration identity", () => {
    let directory: string;
    let location: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-registration-"));
        location = path.join(directory, "game.blueprint.json");
        fs.writeFileSync(location, JSON.stringify({info: {id: "game", name: "Game", version: "0.1.0"}}));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("previews an already registered location instead of offering a second registration", async () => {
        const service = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry(), blueprintResolver(), () => true);
        await service.registerManaged(location, "Managed Game");

        const preview = await service.previewImport(location);

        expect(preview.status).toBe("recognized");
        if (preview.status !== "recognized") return;
        expect(preview.existing).toMatchObject({name: "Managed Game", origin: "managed", status: "ok"});
    });

    it("keeps a managed project managed when the same path is added again as external", async () => {
        const registry = new InMemoryStudioProjectRegistry();
        const service = new StudioProjectRegistrationService(registry, blueprintResolver(), () => true);
        await service.registerManaged(location, "Managed Game", "/tmp/source.par.xlsx", "/tmp/source.blueprint.json.conversion-evidence.json");

        await service.registerExternal(location, "game");

        const entries = await service.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            name: "Managed Game",
            origin: "managed",
            importedFromParSheetPath: "/tmp/source.par.xlsx",
            conversionEvidencePath: "/tmp/source.blueprint.json.conversion-evidence.json",
        });
    });

    it("does not report an existing entry for a different path", async () => {
        const service = new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry(), blueprintResolver(), () => true);
        await service.registerManaged(location, "Managed Game");
        const other = path.join(directory, "other.blueprint.json");
        fs.writeFileSync(other, JSON.stringify({info: {id: "other", name: "Other", version: "0.1.0"}}));

        const preview = await service.previewImport(other);

        expect(preview.status).toBe("recognized");
        if (preview.status === "recognized") expect(preview.existing).toBeUndefined();
    });
});
