import {buildGameBuildInfo, computeGameBlueprintHash, GameBlueprint} from "pokie";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
        expect(info.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
        expect(info.source).toBeUndefined();
    });

    it("records the given source path when provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", "blueprints/sample-slot.blueprint.json");

        expect(info.source).toBe("blueprints/sample-slot.blueprint.json");
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
        expect(first.blueprintHash).toBe(computeGameBlueprintHash(blueprint));
    });

    it("changes the hash when the blueprint content changes", () => {
        const a = buildGameBuildInfo(buildBlueprint(), "1.3.0");
        const b = buildGameBuildInfo(buildBlueprint({rows: 4}), "1.3.0");

        expect(a.blueprintHash).not.toBe(b.blueprintHash);
    });

    it("defaults \"files\" to the fixed set of paths pokie build generates", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0");

        expect(info.files!.sort()).toEqual(["package.json", "README.md", "dist/index.js"].sort());
    });

    it("records a given \"files\" list sorted, when provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date(), ["b.txt", "a.txt"]);

        expect(info.files).toEqual(["a.txt", "b.txt"]);
    });

    it("always stamps a fresh generatedAt -- there is no previous-run reuse anymore", () => {
        const blueprint = buildBlueprint();

        const first = buildGameBuildInfo(blueprint, "1.3.0", undefined, new Date("2026-01-02T03:04:05.000Z"));
        const second = buildGameBuildInfo(blueprint, "1.3.0", undefined, new Date("2026-06-01T00:00:00.000Z"));

        expect(first.generatedAt).toBe("2026-01-02T03:04:05.000Z");
        expect(second.generatedAt).toBe("2026-06-01T00:00:00.000Z");
    });

    it("records a given reelStripGeneration summary (one entry per generated reel) when provided", () => {
        const reelStripGeneration = {
            reels: [
                {
                    reelIndex: 0,
                    config: {type: "generated" as const, length: 10, symbolCounts: {A: 5, B: 5}, seed: 1},
                    seed: 1,
                    success: true,
                    attemptsUsed: 1,
                    diagnostics: [],
                    strip: ["A", "B"],
                },
            ],
        };

        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0", undefined, new Date(), undefined, reelStripGeneration);

        expect(info.reelStripGeneration).toEqual(reelStripGeneration);
    });

    it("omits reelStripGeneration entirely when not provided", () => {
        const info = buildGameBuildInfo(buildBlueprint(), "1.3.0");

        expect(info.reelStripGeneration).toBeUndefined();
        expect(Object.keys(info)).not.toContain("reelStripGeneration");
    });

    it("hashes the blueprint's own reelStripGeneration config, so two authored configs producing the same generated strips still hash differently", () => {
        // Both blueprints below are authored differently (maxAttempts differs) but -- being
        // deterministic and easily satisfiable either way -- resolve to the same generated result.
        // blueprintHash must still differ, because it's computed from the *authored* blueprint, not
        // from whatever a generated reel happened to produce.
        const first = buildBlueprint({
            reelStripGeneration: [{type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 1, maxAttempts: 50}],
        });
        const second = buildBlueprint({
            reelStripGeneration: [{type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 1, maxAttempts: 200}],
        });

        const infoFirst = buildGameBuildInfo(first, "1.3.0");
        const infoSecond = buildGameBuildInfo(second, "1.3.0");

        expect(infoFirst.blueprintHash).not.toBe(infoSecond.blueprintHash);
    });
});
