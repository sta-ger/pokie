import {GameSessionSerializer, PokieGame, PokieGameManifest, resolveGameSessionSerializer} from "pokie";

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

describe("resolveGameSessionSerializer", () => {
    it("returns undefined for a game that doesn't implement getSessionSerializer", () => {
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                throw new Error("not used in this test");
            },
        };

        expect(resolveGameSessionSerializer(game)).toBeUndefined();
    });

    it("returns the game's own serializer instance when getSessionSerializer is implemented", () => {
        const serializer = new GameSessionSerializer();
        const game: PokieGame = {
            getManifest: () => manifest,
            createSession: () => {
                throw new Error("not used in this test");
            },
            getSessionSerializer: () => serializer,
        };

        expect(resolveGameSessionSerializer(game)).toBe(serializer);
    });
});
