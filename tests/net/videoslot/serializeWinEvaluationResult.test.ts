import {adversarialScreen, overscanConfig, overscanGeometry} from "../../v2/fixtures/OverscanGame.js";
import {SymbolsCombination, VideoSlotConfig, VideoSlotWinCalculator, serializeWinEvaluationResult} from "@fromstan/pokie";

function roundtripThroughJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// serializeWinEvaluationResult was extracted out of VideoSlotSessionSerializer's own private
// method (see tests/net/Serialization.test.ts for that class's own winEvaluationResult field
// assertions, unaffected by the extraction) so CascadeSessionSerializer could reuse the exact same
// mapping for each cascade step's win result. This locks in the extracted function's own contract
// directly.
describe("serializeWinEvaluationResult", () => {
    it("maps a winning WinEvaluationResult's components into plain data matching their own getters", () => {
        const config = new VideoSlotConfig();
        const winCalculator = new VideoSlotWinCalculator(config);
        const symbols = new SymbolsCombination<string>().fromMatrix([
            ["A", "A", "A"],
            ["A", "K", "Q"],
            ["A", "K", "Q"],
            ["K", "Q", "J"],
            ["Q", "J", "10"],
        ]);

        winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
        const result = winCalculator.getWinEvaluationResult();

        const serialized = serializeWinEvaluationResult(result);

        expect(serialized.totalWin).toBe(result.getTotalWin());
        expect(serialized.winningPositions).toEqual(result.getWinningPositions());
        expect(serialized.lineWins).toHaveLength(result.getLineWins().length);
        expect(serialized.lineWins.length).toBeGreaterThan(0);
        serialized.lineWins.forEach((line, index) => {
            const component = result.getLineWins()[index];
            expect(line.winAmount).toBe(component.getWinAmount());
            expect(line.lineId).toBe(component.getWinningLine().getLineId());
            expect(line.symbolId).toBe(component.getWinningLine().getSymbolId());
        });
        expect(serialized.metadata).toEqual(result.getMetadata());

        expect(roundtripThroughJson(serialized)).toEqual(serialized);
    });

    it("returns empty arrays for a losing combination, not omitted fields", () => {
        const config = new VideoSlotConfig();
        const winCalculator = new VideoSlotWinCalculator(config);
        const symbols = new SymbolsCombination<string>().fromMatrix([
            ["Q", "J", "10"],
            ["J", "9", "Q"],
            ["10", "Q", "J"],
            ["9", "10", "Q"],
            ["J", "Q", "9"],
        ]);

        winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
        const serialized = serializeWinEvaluationResult(winCalculator.getWinEvaluationResult());

        expect(serialized.totalWin).toBe(0);
        expect(serialized.lineWins).toEqual([]);
        expect(serialized.scatterWins).toEqual([]);
        expect(serialized.clusterWins).toEqual([]);
        expect(serialized.valueWins).toEqual([]);
        expect(serialized.waysWins).toEqual([]);
    });
    it("supports direct viewport serialization without changing evaluated results or settled amounts", () => {
        const calculator = new VideoSlotWinCalculator(overscanConfig());
        calculator.calculateWin(1, new SymbolsCombination().fromMatrix(adversarialScreen()).withCoordinates(overscanGeometry));
        const result = calculator.getWinEvaluationResult();
        const evaluated = serializeWinEvaluationResult(result);
        const visible = serializeWinEvaluationResult(result, overscanGeometry);
        expect(evaluated.winningPositions).toHaveLength(15);
        expect(visible.winningPositions).toHaveLength(10);
        expect(visible.totalWin).toBe(evaluated.totalWin);
        expect(visible.lineWins).toHaveLength(3);
        expect(visible.lineWins[0].definition).toEqual([1, 1, 1, 1, 1]);
        expect(visible.lineWins[0].symbolsPositions).toEqual([0, 1, 2, 3, 4]);
        expect(visible.lineWins[2]).toMatchObject({definition: [], visiblePositions: [], winAmount: 1});
        expect(result.getWinningPositions()).toEqual(evaluated.winningPositions);
        expect(roundtripThroughJson(visible)).toEqual(visible);
    });
});
