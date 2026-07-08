import {
    GridResizeHandling,
    ResizableSymbolsCombinationsGenerator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    VideoSlotWithResizableGridSession,
} from "pokie";

describe("VideoSlotWithResizableGridSession", () => {
    test("play() delegates to the base session, passes it and the current heights to the handler, and applies its result", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [3, 3, 3]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const calls: {session: VideoSlotSessionHandling; currentHeights: number[]}[] = [];
        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (session, currentHeights): number[] => {
                calls.push({session, currentHeights: [...currentHeights]});
                return currentHeights.map((h) => h + 1);
            },
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();

        expect(calls).toHaveLength(1);
        expect(calls[0].session).toBe(baseSession);
        expect(calls[0].currentHeights).toEqual([3, 3, 3]);
        expect(resizableSession.getReelsHeights()).toEqual([4, 4, 4]);
        expect(generator.getReelsHeights()).toEqual([4, 4, 4]);
    });

    test("the grid can shrink as well as grow, depending on the injected handler", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(2);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [5, 5]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (_session, currentHeights): number[] => currentHeights.map((h) => h - 1),
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();
        expect(resizableSession.getReelsHeights()).toEqual([4, 4]);

        resizableSession.play();
        expect(resizableSession.getReelsHeights()).toEqual([3, 3]);
    });

    test("a resize only takes effect starting from the next round, not the one that triggered it", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(2);
        const generator = new ResizableSymbolsCombinationsGenerator(config, [2, 2]);
        const baseSession = new VideoSlotSession(config, generator, new VideoSlotWinCalculator(config));

        const gridResizeHandling: GridResizeHandling = {
            getNextReelsHeights: (_session, currentHeights): number[] => currentHeights.map((h) => h + 2),
        };
        const resizableSession = new VideoSlotWithResizableGridSession(baseSession, generator, gridResizeHandling);

        resizableSession.play();
        expect(resizableSession.getSymbolsCombination().toMatrix()[0]).toHaveLength(2);

        resizableSession.play();
        expect(resizableSession.getSymbolsCombination().toMatrix()[0]).toHaveLength(4);
    });
});
