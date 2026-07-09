import {GameSessionHandling, isPokieGame, PokieGame, PokieGameContractValidationRule, PokieGameManifest} from "pokie";

function createStubSession(): GameSessionHandling {
    return {
        getCreditsAmount: () => 0,
        getBet: () => 0,
        setCreditsAmount: () => undefined,
        setBet: () => undefined,
        play: () => undefined,
        canPlayNextGame: () => true,
        getWinAmount: () => 0,
        getAvailableBets: () => [1],
    };
}

function createValidGame(manifest: PokieGameManifest = {id: "demo", name: "Demo", version: "1.0.0"}): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createStubSession(),
    };
}

describe("isPokieGame", () => {
    it("returns true for an object implementing getManifest()/createSession()", () => {
        expect(isPokieGame(createValidGame())).toBe(true);
    });

    it.each<unknown>([undefined, null, 42, "game", {}, {getManifest: () => undefined}, {createSession: () => undefined}])(
        "returns false for %p",
        (value) => {
            expect(isPokieGame(value)).toBe(false);
        },
    );
});

describe("PokieGameContractValidationRule", () => {
    const rule = new PokieGameContractValidationRule();

    it("reports an error when the target does not implement the PokieGame contract", () => {
        const issues = rule.validate({});
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({code: "pokie-game-missing-contract-methods", severity: "error"});
    });

    it("reports an error when getManifest() throws", () => {
        const game: PokieGame = {
            getManifest: () => {
                throw new Error("boom");
            },
            createSession: () => createStubSession(),
        };

        const issues = rule.validate(game);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({code: "pokie-game-manifest-threw", severity: "error"});
        expect(issues[0].message).toContain("boom");
    });

    it("reports one error per missing/empty required manifest field", () => {
        const game = createValidGame({id: "", name: "Demo", version: ""});

        const issues = rule.validate(game);
        expect(issues.map((issue) => issue.code).sort()).toEqual(
            ["pokie-game-manifest-invalid-id", "pokie-game-manifest-invalid-version"].sort(),
        );
    });

    it("treats whitespace-only required manifest fields as invalid", () => {
        const game = createValidGame({id: "   ", name: "Demo", version: "\t\n"});

        const issues = rule.validate(game);
        expect(issues.map((issue) => issue.code).sort()).toEqual(
            ["pokie-game-manifest-invalid-id", "pokie-game-manifest-invalid-version"].sort(),
        );
    });

    it("is silent for a fully valid game", () => {
        expect(rule.validate(createValidGame())).toEqual([]);
    });
});
