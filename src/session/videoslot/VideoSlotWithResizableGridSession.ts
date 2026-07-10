import {AbstractVideoSlotSessionDecorator} from "./AbstractVideoSlotSessionDecorator.js";
import type {GridResizeHandling} from "./GridResizeHandling.js";
import {ResizableSymbolsCombinationsGenerator} from "./combinations/ResizableSymbolsCombinationsGenerator.js";
import type {VideoSlotSessionHandling} from "./VideoSlotSessionHandling.js";

// Wraps a session built around a ResizableSymbolsCombinationsGenerator (the same shared instance
// must be passed to both the base session's construction and here — mirrors how
// VideoSlotWithFreeGamesSession shares its combinationsGenerator/winCalculator with baseSession)
// and, after each round, asks the injected GridResizeHandling what the next round's per-reel
// heights should be. getReelsHeights isn't part of VideoSlotSessionHandling — callers already hold
// this concrete type, since they had to construct the shared generator themselves.
export class VideoSlotWithResizableGridSession<
    T extends string | number | symbol = string,
> extends AbstractVideoSlotSessionDecorator<T> {
    private readonly generator: ResizableSymbolsCombinationsGenerator<T>;
    private readonly gridResizeHandling: GridResizeHandling<T>;

    constructor(
        baseSession: VideoSlotSessionHandling<T>,
        generator: ResizableSymbolsCombinationsGenerator<T>,
        gridResizeHandling: GridResizeHandling<T>,
    ) {
        super(baseSession);
        this.generator = generator;
        this.gridResizeHandling = gridResizeHandling;
    }

    public override play(): void {
        // If the round couldn't be paid for, baseSession.play() is already a no-op — don't resize
        // the grid off the back of a round that never happened.
        if (!this.canPlayNextGame()) {
            return;
        }
        this.baseSession.play();
        this.generator.setReelsHeights(
            this.gridResizeHandling.getNextReelsHeights(this.baseSession, this.generator.getReelsHeights()),
        );
    }

    public getReelsHeights(): number[] {
        return this.generator.getReelsHeights();
    }
}
