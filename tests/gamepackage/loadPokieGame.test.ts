import {loadPokieGame, readPokiePackageConfig} from "pokie";
import path from "path";

const fixturesRoot = path.join(__dirname, "fixtures");

describe("readPokiePackageConfig", () => {
    it("reads the pokie.entry field from package.json", () => {
        const config = readPokiePackageConfig(path.join(fixturesRoot, "valid-game"));
        expect(config).toEqual({entry: "./index.js"});
    });

    it("throws a descriptive error when package.json has no pokie.entry field", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "missing-entry-game"))).toThrow(/pokie\.entry/);
    });

    it("throws a descriptive error when pokie.entry is a whitespace-only string", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "blank-entry-game"))).toThrow(/pokie\.entry/);
    });

    it("throws a descriptive error when package.json does not exist", () => {
        expect(() => readPokiePackageConfig(path.join(fixturesRoot, "does-not-exist"))).toThrow();
    });
});

describe("loadPokieGame", () => {
    it("loads a valid game package and returns its PokieGame export", async () => {
        const game = await loadPokieGame(path.join(fixturesRoot, "valid-game"));
        expect(game.getManifest()).toEqual({id: "valid-game", name: "Valid Game", version: "1.0.0"});
        expect(typeof game.createSession).toBe("function");
    });

    it("throws when the entry module does not export a valid PokieGame", async () => {
        await expect(loadPokieGame(path.join(fixturesRoot, "invalid-export-game"))).rejects.toThrow(/does not export a valid/);
    });

    it("throws a descriptive error listing every failing check when the entry module's manifest is invalid", async () => {
        let caughtError: unknown;
        try {
            await loadPokieGame(path.join(fixturesRoot, "invalid-manifest-game"));
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).toBeInstanceOf(Error);
        const message = (caughtError as Error).message;
        expect(message).toContain("does not export a valid");
        expect(message).toContain("pokie-game-manifest-invalid-id");
        expect(message).toContain("pokie-game-manifest-invalid-version");
        expect(message).not.toContain("pokie-game-manifest-invalid-name");
    });

    it("throws when package.json has no pokie.entry field", async () => {
        await expect(loadPokieGame(path.join(fixturesRoot, "missing-entry-game"))).rejects.toThrow(/pokie\.entry/);
    });

    it("unwraps a double-nested default (as produced by Node's native ESM loader for a tsc esModuleInterop-compiled entry)", async () => {
        const game = await loadPokieGame(path.join(fixturesRoot, "nested-default-game"));
        expect(game.getManifest()).toEqual({id: "nested-default-game", name: "Nested Default Game", version: "1.0.0"});
    });
});
