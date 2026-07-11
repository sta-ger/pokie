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
});
