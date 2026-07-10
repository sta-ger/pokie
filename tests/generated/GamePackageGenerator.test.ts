import {GameBlueprint, GamePackageGenerator, PokieGame} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("GamePackageGenerator", () => {
    let cwd: string;

    beforeEach(() => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-test-"));
    });

    afterEach(() => {
        fs.rmSync(cwd, {recursive: true, force: true});
    });

    it("writes a package.json and src/generated/index.js under ./<manifest.id> by default", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);

        const projectRoot = path.join(cwd, "crazy-fruits");
        expect(result.projectRoot).toBe(projectRoot);
        expect(result.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        expect(result.createdFiles.sort()).toEqual(["package.json", "src/generated/index.js"]);
        expect(fs.existsSync(path.join(projectRoot, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "src", "generated", "index.js"))).toBe(true);
    });

    it("writes a package.json with a pokie dependency and pokie.entry pointing at the generated module", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd);
        const pkg = JSON.parse(fs.readFileSync(path.join(result.projectRoot, "package.json"), "utf-8"));

        expect(pkg.name).toBe("crazy-fruits");
        expect(pkg.version).toBe("0.1.0");
        expect(pkg.dependencies).toEqual({pokie: "^1.3.0"});
        expect(pkg.pokie).toEqual({entry: "./src/generated/index.js"});
        expect(pkg.scripts).toEqual({start: "pokie dev .", server: "pokie serve .", client: "pokie client ."});
    });

    it("honors --out (an explicit outDir) instead of deriving the directory from manifest.id", () => {
        const generator = new GamePackageGenerator("1.3.0");

        const result = generator.generate(buildBlueprint(), cwd, "elsewhere");

        expect(result.projectRoot).toBe(path.join(cwd, "elsewhere"));
        expect(fs.existsSync(path.join(cwd, "crazy-fruits"))).toBe(false);
    });

    it("throws a descriptive error when the target directory already exists", () => {
        const generator = new GamePackageGenerator("1.3.0");
        generator.generate(buildBlueprint(), cwd);

        expect(() => generator.generate(buildBlueprint(), cwd)).toThrow(/already exists/);
    });

    it("rejects a manifest.id that looks like a path when no --out is given", () => {
        const generator = new GamePackageGenerator("1.3.0");

        expect(() =>
            generator.generate(buildBlueprint({manifest: {id: "../escape", name: "Escape", version: "0.1.0"}}), cwd),
        ).toThrow(/not a valid directory name/);
    });

    it("generates a game package that is loadable and playable through the pokie contract", () => {
        const generator = new GamePackageGenerator("1.3.0");
        const blueprint = buildBlueprint({
            reelStrips: [
                ["A", "A", "A"],
                ["A", "A", "A"],
                ["A", "A", "A"],
            ],
        });

        const result = generator.generate(blueprint, cwd);
        const game = require(path.join(result.projectRoot, "src", "generated", "index.js")) as PokieGame;

        expect(game.getManifest()).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});

        const session = game.createSession();
        session.setBet(1);
        session.play();

        // Every reel strip is a single "A" repeated, so every spin lands an all-"A" screen and every
        // one of the default horizontal lines wins the "A": 3 payout (5x bet) configured above.
        expect(session.getWinAmount()).toBeGreaterThan(0);
    });
});
