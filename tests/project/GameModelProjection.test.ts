import {createStarterGameBlueprint} from "../../cli/build/createStarterGameBlueprint.js";
import {buildGameModelProjection} from "../../src/project/buildGameModelProjection.js";

describe("buildGameModelProjection", () => {
    it("reports the implicit horizontal-row paylines when paylines are omitted", () => {
        const blueprint = createStarterGameBlueprint();
        Reflect.deleteProperty(blueprint, "paylines");

        const projection = buildGameModelProjection(blueprint);

        expect(projection.layout.status).toBe("available");
        if (projection.layout.status !== "available") throw new Error("layout should be available");
        expect(projection.layout.data.winModel).toEqual({type: "lines"});
        expect(projection.layout.data.paylineCount).toBe(blueprint.rows);
        expect(projection.layout.data.paylines).toEqual(Array.from({length: blueprint.rows}, (_, row) => Array.from({length: blueprint.reels}, () => row)));
    });

    it("keeps the explicit payline count when the blueprint declares paylines", () => {
        const blueprint = createStarterGameBlueprint();

        const projection = buildGameModelProjection(blueprint);

        expect(projection.layout.status).toBe("available");
        if (projection.layout.status !== "available") throw new Error("layout should be available");
        expect(projection.layout.data.paylineCount).toBe(blueprint.paylines?.length);
        expect(projection.layout.data.paylines).toEqual(blueprint.paylines);
    });

    it("keeps the authored paytable symbol order instead of sorting symbols alphabetically", () => {
        const blueprint = createStarterGameBlueprint();
        expect(Object.keys(blueprint.paytable)).toEqual(["A", "K", "Q", "J"]);

        const projection = buildGameModelProjection(blueprint);

        expect(projection.paytable.status).toBe("available");
        if (projection.paytable.status !== "available") throw new Error("paytable should be available");
        expect(projection.paytable.data.map((row) => row.symbolId)).toEqual(["A", "A", "A", "K", "K", "K", "Q", "Q", "Q", "J", "J", "J"]);
        expect(projection.paytable.data.map((row) => row.matchCount)).toEqual([3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5]);
    });
});
