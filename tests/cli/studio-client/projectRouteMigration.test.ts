import {isProjectTab, legacyProjectRouteMigration, migrationSearch} from "../../../cli/studio-client/src/domain/projectRouteMigration.js";

describe("project route migration", () => {
    it("recognizes canonical project tabs", () => {
        expect(isProjectTab("gameModel")).toBe(true);
        expect(isProjectTab("exportDeploy")).toBe(true);
        expect(isProjectTab("game-model")).toBe(false);
    });

    it("recovers a path-shaped legacy URL that carried the project path before the tab", () => {
        const migration = legacyProjectRouteMigration(
            "/home/stager/POKIE Projects/valera-math-1/blueprint.json/gameModel",
        );
        expect(migration?.destination).toBe("gameModel");
        expect(migration?.message).toBeUndefined();
    });

    it("keeps the explicit unavailable message for a genuinely unknown tab", () => {
        expect(legacyProjectRouteMigration("retired-workspace")?.destination).toBe("overview");
        expect(legacyProjectRouteMigration("retired-workspace")?.message).toContain("no longer available");
    });

    it("keeps a path-shaped unknown tail explicit rather than pretending it was a tab", () => {
        expect(legacyProjectRouteMigration("/home/a/blueprint.json/retired-workspace")?.message).toContain(
            "no longer available",
        );
    });

    it("keeps legacy aliases working", () => {
        expect(legacyProjectRouteMigration("game-model")?.destination).toBe("gameModel");
        expect(legacyProjectRouteMigration("build")?.destination).toBe("exportDeploy");
        expect(legacyProjectRouteMigration("buildExport")?.destination).toBe("exportDeploy");
        expect(legacyProjectRouteMigration("build-export")?.destination).toBe("exportDeploy");
        expect(migrationSearch("game-model")).toBe("?migrated=game-model");
    });
});
