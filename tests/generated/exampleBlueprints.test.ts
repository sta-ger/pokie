import {GameBlueprintValidator, loadGameBlueprint} from "pokie";
import fs from "fs";
import path from "path";

const blueprintsDir = path.join(__dirname, "..", "..", "examples", "blueprints");

describe("shipped example blueprints", () => {
    const blueprintFiles = fs.readdirSync(blueprintsDir).filter((file) => file.endsWith(".blueprint.json"));

    it("has at least one example blueprint to check", () => {
        expect(blueprintFiles.length).toBeGreaterThan(0);
    });

    it.each(blueprintFiles)("%s loads and validates with no errors", (file) => {
        const blueprint = loadGameBlueprint(path.join(blueprintsDir, file));

        const issues = new GameBlueprintValidator().validate(blueprint);

        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });
});
