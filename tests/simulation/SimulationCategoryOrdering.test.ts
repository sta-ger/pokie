import {SimulationCategoryOrdering} from "pokie";

describe("SimulationCategoryOrdering", () => {
    test("puts base first when present", () => {
        expect(SimulationCategoryOrdering.sort(["freeGames", "base", "bonus"])).toEqual(["base", "bonus", "freeGames"]);
    });

    test("sorts everything else alphabetically when base is absent", () => {
        expect(SimulationCategoryOrdering.sort(["respins", "bonus", "holdAndWin"])).toEqual(["bonus", "holdAndWin", "respins"]);
    });

    test("is stable regardless of input order", () => {
        expect(SimulationCategoryOrdering.sort(["bonus", "base", "freeGames"])).toEqual(["base", "bonus", "freeGames"]);
        expect(SimulationCategoryOrdering.sort(["freeGames", "bonus", "base"])).toEqual(["base", "bonus", "freeGames"]);
        expect(SimulationCategoryOrdering.sort(["base", "bonus", "freeGames"])).toEqual(["base", "bonus", "freeGames"]);
    });

    test("handles a single category", () => {
        expect(SimulationCategoryOrdering.sort(["bonus"])).toEqual(["bonus"]);
    });

    test("handles an empty list", () => {
        expect(SimulationCategoryOrdering.sort([])).toEqual([]);
    });

    test("does not mutate the input array", () => {
        const input = ["freeGames", "base"];

        SimulationCategoryOrdering.sort(input);

        expect(input).toEqual(["freeGames", "base"]);
    });
});
