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
    private payoutAmount?: number;
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
        this.validateScreenCoordinates();
        this.executeStep(() => {
            this.baseSession.play();
            const payout = this.baseSession.getPayoutAmount?.();
            const credits = this.getCreditsAmount();
            this.generator.setReelsHeights(
                this.gridResizeHandling.getNextReelsHeights(this.baseSession, this.generator.getReelsHeights()),
            );
            // The strategy receives the live base session. Forward its exact payout only when
            // this invocation preserved credits; arbitrary resize handlers may also settle money.
            this.payoutAmount = this.getCreditsAmount() === credits ? payout : undefined;
        });
    }

    public override createStepRollback(): () => void {
        const rollback = super.createStepRollback();
        const heights = this.generator.getReelsHeights();
        return () => {
            rollback();
            this.payoutAmount = undefined;
            this.generator.setReelsHeights(heights);
        };
    }

    public getPayoutAmount(): number | undefined {
        if (this.constructor !== VideoSlotWithResizableGridSession) return undefined;
        return this.stepResultValid ? this.payoutAmount : 0;
    }

    public getReelsHeights(): number[] {
        return this.generator.getReelsHeights();
    }
}
