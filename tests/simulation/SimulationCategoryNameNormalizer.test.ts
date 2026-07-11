import {SimulationCategoryNameNormalizer} from "pokie";

describe("SimulationCategoryNameNormalizer", () => {
    test("accepts simple identifier-style names unchanged", () => {
        expect(SimulationCategoryNameNormalizer.normalize("bonus")).toBe("bonus");
        expect(SimulationCategoryNameNormalizer.normalize("freeGames")).toBe("freeGames");
        expect(SimulationCategoryNameNormalizer.normalize("holdAndWin")).toBe("holdAndWin");
    });

    test("accepts internal hyphens and underscores, but not as the first character", () => {
        expect(SimulationCategoryNameNormalizer.normalize("hold-and-win")).toBe("hold-and-win");
        expect(SimulationCategoryNameNormalizer.normalize("bonus_buy")).toBe("bonus_buy");
        expect(SimulationCategoryNameNormalizer.normalize("-bonus")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("_bonus")).toBeUndefined();
    });

    test("accepts digits after the first character, but not as the first character", () => {
        expect(SimulationCategoryNameNormalizer.normalize("bonus2")).toBe("bonus2");
        expect(SimulationCategoryNameNormalizer.normalize("2bonus")).toBeUndefined();
    });

    test("trims surrounding whitespace", () => {
        expect(SimulationCategoryNameNormalizer.normalize("  bonus  ")).toBe("bonus");
        expect(SimulationCategoryNameNormalizer.normalize("\tbonus\n")).toBe("bonus");
    });

    test("rejects empty and whitespace-only strings", () => {
        expect(SimulationCategoryNameNormalizer.normalize("")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("   ")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("\t\n")).toBeUndefined();
    });

    test("rejects names longer than MAX_LENGTH", () => {
        const tooLong = "a".repeat(SimulationCategoryNameNormalizer.MAX_LENGTH + 1);
        const atLimit = "a".repeat(SimulationCategoryNameNormalizer.MAX_LENGTH);

        expect(SimulationCategoryNameNormalizer.normalize(tooLong)).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize(atLimit)).toBe(atLimit);
    });

    test("rejects names containing spaces or punctuation outside the safe pattern", () => {
        expect(SimulationCategoryNameNormalizer.normalize("bonus round")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("bonus!")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("bonus.round")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("bonus/round")).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize("<script>")).toBeUndefined();
    });

    test("rejects non-string input without throwing", () => {
        expect(SimulationCategoryNameNormalizer.normalize(undefined)).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize(null)).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize(42)).toBeUndefined();
        expect(SimulationCategoryNameNormalizer.normalize({})).toBeUndefined();
    });

    test("is case-sensitive and preserves casing", () => {
        expect(SimulationCategoryNameNormalizer.normalize("Bonus")).toBe("Bonus");
        expect(SimulationCategoryNameNormalizer.normalize("BONUS")).toBe("BONUS");
    });
});
