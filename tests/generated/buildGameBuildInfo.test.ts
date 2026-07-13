import {buildGameBuildInfo, GameBlueprint} from "pokie";
import crypto from "crypto";

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

describe("buildGameBuildInfo", () => {
    it("stamps the blueprint schema version, generator name, pokie version, and the blueprint's own manifest", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0");

        expect(info.schemaVersion).toBe(1);
        expect(info.generatedBy).toBe("pokie build");
        expect(info.pokieVersion).toBe("1.3.0");
        expect(info.game).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
        expect(info.source).toBeUndefined();
    });

    it("records the given source path when provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", "blueprints/crazy-fruits.blueprint.json");

        expect(info.source).toBe("blueprints/crazy-fruits.blueprint.json");
    });

    it("uses the given generation timestamp, serialized as ISO 8601", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date("2026-01-02T03:04:05.000Z"));

        expect(info.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    });

    it("hashes the exact blueprint it was given, so an unchanged blueprint reproduces the same hash", () => {
        const blueprint = buildBlueprint();

        const first = buildGameBuildInfo(blueprint, "1.3.0");
        const second = buildGameBuildInfo(blueprint, "1.3.0");

        expect(first.blueprintHash).toBe(second.blueprintHash);
        expect(first.blueprintHash).toBe(`sha256:${crypto.createHash("sha256").update(JSON.stringify(blueprint)).digest("hex")}`);
    });

    it("changes the hash when the blueprint content changes", () => {
        const a = buildGameBuildInfo(buildBlueprint(), "1.3.0");
        const b = buildGameBuildInfo(buildBlueprint({rows: 4}), "1.3.0");

        expect(a.blueprintHash).not.toBe(b.blueprintHash);
    });

    it("defaults \"files\" to the fixed set of paths pokie build generates", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0");

        expect(info.files!.sort()).toEqual(
            ["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"].sort(),
        );
    });

    it("records a given \"files\" list sorted, when provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date(), ["b.txt", "a.txt"]);

        expect(info.files).toEqual(["a.txt", "b.txt"]);
    });

    it("reuses the previous run's generatedAt when blueprint, pokie version, and source all still match", () => {
        const blueprint = buildBlueprint();
        const previous = buildGameBuildInfo(blueprint, "1.3.0", "blueprints/crazy-fruits.blueprint.json", new Date("2026-01-02T03:04:05.000Z"));

        const info = buildGameBuildInfo(
            blueprint,
            "1.3.0",
            "blueprints/crazy-fruits.blueprint.json",
            new Date("2026-06-01T00:00:00.000Z"),
            undefined,
            previous,
        );

        expect(info.generatedAt).toBe("2026-01-02T03:04:05.000Z");
    });

    it("stamps a fresh generatedAt when the blueprint changed since the previous run", () => {
        const previous = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date("2026-01-02T03:04:05.000Z"));

        const info = buildGameBuildInfo(buildBlueprint({rows: 4}), "1.3.0", undefined, new Date("2026-06-01T00:00:00.000Z"), undefined, previous);

        expect(info.generatedAt).toBe("2026-06-01T00:00:00.000Z");
    });

    it("stamps a fresh generatedAt when the pokie version changed since the previous run", () => {
        const blueprint = buildBlueprint();
        const previous = buildGameBuildInfo(blueprint, "1.3.0", undefined, new Date("2026-01-02T03:04:05.000Z"));

        const info = buildGameBuildInfo(blueprint, "1.4.0", undefined, new Date("2026-06-01T00:00:00.000Z"), undefined, previous);

        expect(info.generatedAt).toBe("2026-06-01T00:00:00.000Z");
    });

    it("stamps a fresh generatedAt when the source path changed since the previous run", () => {
        const blueprint = buildBlueprint();
        const previous = buildGameBuildInfo(blueprint, "1.3.0", "a.json", new Date("2026-01-02T03:04:05.000Z"));

        const info = buildGameBuildInfo(blueprint, "1.3.0", "b.json", new Date("2026-06-01T00:00:00.000Z"), undefined, previous);

        expect(info.generatedAt).toBe("2026-06-01T00:00:00.000Z");
    });

    it("records a given reelStripGeneration summary when provided", () => {
        const reelStripGeneration = {
            config: {length: 10, symbolCounts: {A: 5, B: 5}, seed: 1},
            reels: [{reelIndex: 0, seed: 1, success: true, attemptsUsed: 1, diagnostics: []}],
        };

        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date(), undefined, undefined, reelStripGeneration);

        expect(info.reelStripGeneration).toEqual(reelStripGeneration);
    });

    it("omits reelStripGeneration entirely when not provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0");

        expect(info.reelStripGeneration).toBeUndefined();
        expect(Object.keys(info)).not.toContain("reelStripGeneration");
    });
});
