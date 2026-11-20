import {GameSessionHandling, isPokieGame, PokieGame, PokieGameContractValidationRule, PokieGameInfo} from "@fromstan/pokie";

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

function createValidGame(manifest: PokieGameInfo = {id: "demo", name: "Demo", version: "1.0.0"}): PokieGame {
    return {
        getInfo: () => manifest,
        createSession: () => createStubSession(),
    };
}

describe("isPokieGame", () => {
    it("returns true for an object implementing getInfo()/createSession()", () => {
        expect(isPokieGame(createValidGame())).toBe(true);
    });

    it.each<unknown>([undefined, null, 42, "game", {}, {getInfo: () => undefined}, {createSession: () => undefined}])(
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

    it("reports an error when getInfo() throws", () => {
        const game: PokieGame = {
            getInfo: () => {
                throw new Error("boom");
            },
            createSession: () => createStubSession(),
        };

        const issues = rule.validate(game);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({code: "pokie-game-info-threw", severity: "error"});
        expect(issues[0].message).toContain("boom");
    });

    it("reports one error per missing/empty required manifest field", () => {
        const game = createValidGame({id: "", name: "Demo", version: ""});

        const issues = rule.validate(game);
        expect(issues.map((issue) => issue.code).sort()).toEqual(
            ["pokie-game-info-invalid-id", "pokie-game-info-invalid-version"].sort(),
        );
    });

    it("treats whitespace-only required manifest fields as invalid", () => {
        const game = createValidGame({id: "   ", name: "Demo", version: "\t\n"});

        const issues = rule.validate(game);
        expect(issues.map((issue) => issue.code).sort()).toEqual(
            ["pokie-game-info-invalid-id", "pokie-game-info-invalid-version"].sort(),
        );
    });

    it("is silent for a fully valid game", () => {
        expect(rule.validate(createValidGame())).toEqual([]);
    });
});
