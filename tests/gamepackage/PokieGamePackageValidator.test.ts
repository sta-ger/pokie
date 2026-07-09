import {PokieGamePackageValidator} from "pokie";
import path from "path";

const fixturesRoot = path.join(__dirname, "fixtures");

describe("PokieGamePackageValidator", () => {
    const validator = new PokieGamePackageValidator();

    it("reports a valid package as valid, with no errors/warnings and the manifest's id/name/version", async () => {
        const report = await validator.validate(path.join(fixturesRoot, "valid-game"));

        expect(report).toEqual({
            packageRoot: path.join(fixturesRoot, "valid-game"),
            valid: true,
            game: {id: "valid-game", name: "Valid Game", version: "1.0.0"},
            errors: [],
            warnings: [],
            suggestions: [],
        });
    });

    it("reports an error and no game when pokie.entry is missing", async () => {
        const packageRoot = path.join(fixturesRoot, "missing-entry-game");
        const report = await validator.validate(packageRoot);

        expect(report.valid).toBe(false);
        expect(report.packageRoot).toBe(packageRoot);
        expect(report.game).toBeNull();
        expect(report.errors).toHaveLength(1);
        expect(report.errors[0].code).toBe("pokie-package-load-failed");
        expect(report.errors[0].message).toContain("pokie.entry");
    });

    it("reports an error and no game when the entry module does not export a valid PokieGame", async () => {
        const report = await validator.validate(path.join(fixturesRoot, "invalid-export-game"));

        expect(report.valid).toBe(false);
        expect(report.game).toBeNull();
        expect(report.errors).toHaveLength(1);
        expect(report.errors[0]).toMatchObject({code: "pokie-game-missing-contract-methods", severity: "error"});
        expect(report.suggestions).toEqual(["Export an object implementing PokieGame as the entry module's default export."]);
    });

    it("reports one error per invalid manifest field, and still surfaces the (invalid) manifest as game", async () => {
        const report = await validator.validate(path.join(fixturesRoot, "invalid-manifest-game"));

        expect(report.valid).toBe(false);
        expect(report.game).toEqual({id: "", name: "Invalid Manifest Game", version: ""});
        expect(report.errors.map((issue) => issue.code).sort()).toEqual(
            ["pokie-game-manifest-invalid-id", "pokie-game-manifest-invalid-version"].sort(),
        );
        expect(report.warnings).toEqual([]);
    });

    it("unwraps a double-nested default like loadPokieGame does", async () => {
        const report = await validator.validate(path.join(fixturesRoot, "nested-default-game"));

        expect(report.valid).toBe(true);
        expect(report.game).toEqual({id: "nested-default-game", name: "Nested Default Game", version: "1.0.0"});
    });
});
