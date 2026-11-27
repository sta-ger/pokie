import {assertBlueprintImportDestination} from "../../../cli/commands/internal/assertBlueprintImportDestination.js";

describe("assertBlueprintImportDestination", () => {
    it("accepts the JSON suffix POKIE uses to recognize a Blueprint", () => {
        expect(() => assertBlueprintImportDestination("game.blueprint.json")).not.toThrow();
        expect(() => assertBlueprintImportDestination("GAME.JSON")).not.toThrow();
    });

    it("rejects an extensionless import path before writing anything", () => {
        expect(() => assertBlueprintImportDestination("game")).toThrow(/ending in "\.json"/);
        expect(() => assertBlueprintImportDestination("game.txt")).toThrow(/ending in "\.json"/);
    });
});
