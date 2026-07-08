import {DefaultClusterWinCalculator, SymbolsCombination, VideoSlotConfig} from "pokie";

describe("DefaultClusterWinCalculator", () => {
    test("pays a cluster of orthogonally-adjacent same symbols that meets the minimum size", () => {
        const config = new VideoSlotConfig();
        const calculator = new DefaultClusterWinCalculator(config, 5);
        const bet = config.getAvailableBets()[0];

        // Reel-major grid (combination[reelId][rowIndex]): a plus-shaped cluster of 5 "A"s.
        const combination = new SymbolsCombination().fromMatrix(
            [
                ["K", "A", "K"],
                ["A", "A", "A"],
                ["K", "A", "K"],
            ],
            true,
        );

        const winningClusters = calculator.calculateWinningClusters(bet, combination);
        const clusters = Object.values(winningClusters);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].getSymbolId()).toBe("A");
        expect(clusters[0].getSymbolsPositions()).toHaveLength(5);
        expect(clusters[0].getWinAmount()).toBe(config.getPaytable().getWinAmountForSymbol("A", 5, bet));
        expect(clusters[0].getWinAmount()).toBeGreaterThan(0);
    });

    test("does not pay a cluster below the minimum size", () => {
        const config = new VideoSlotConfig();
        const calculator = new DefaultClusterWinCalculator(config, 6);
        const bet = config.getAvailableBets()[0];

        const combination = new SymbolsCombination().fromMatrix(
            [
                ["K", "A", "K"],
                ["A", "A", "A"],
                ["K", "A", "K"],
            ],
            true,
        );

        expect(Object.keys(calculator.calculateWinningClusters(bet, combination))).toHaveLength(0);
    });

    test("keys separate clusters of the same symbol independently, unlike scatter/line wins", () => {
        const config = new VideoSlotConfig();
        const calculator = new DefaultClusterWinCalculator(config, 3);
        const bet = config.getAvailableBets()[0];

        // Top row and bottom row are each a 3-cell "A" cluster; the middle row's "K"s are diagonal
        // to each other (not orthogonally adjacent), so they never reach the minimum size.
        const combination = new SymbolsCombination().fromMatrix(
            [
                ["A", "A", "A"],
                ["K", "Q", "K"],
                ["A", "A", "A"],
            ],
            true,
        );

        const winningClusters = calculator.calculateWinningClusters(bet, combination);
        expect(Object.keys(winningClusters)).toHaveLength(2);
        Object.values(winningClusters).forEach((cluster) => {
            expect(cluster.getSymbolId()).toBe("A");
            expect(cluster.getSymbolsPositions()).toHaveLength(3);
        });
    });
});
