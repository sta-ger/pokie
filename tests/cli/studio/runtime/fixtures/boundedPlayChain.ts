import {StudioPlayService} from "../../../../../cli/studio/runtime/StudioPlayService.js";
import type {StudioRuntimeSessionView} from "../../../../../cli/studio/runtime/StudioRuntimeSessionView.js";
import {boundedBlueprint} from "../../../../v2/fixtures/BoundedMechanicsGame.js";
import {generatedMechanicsGame} from "../../../../v2/fixtures/ExistingMechanicsGame.js";

/** Actual generated math -> repository command -> Studio's public projection, without a UI mock. */
export async function boundedPlayChain(id: Parameters<typeof boundedBlueprint>[0], seed: number) {
    const game = generatedMechanicsGame(boundedBlueprint(id));
    const service = new StudioPlayService(() => Promise.resolve(game));
    const deliveries: StudioRuntimeSessionView[] = [];
    try {
        const created = await service.newSession("/bounded-package", seed);
        if (created.status !== "ok") throw new Error(JSON.stringify(created));
        for (let index = 0; index < 100; index++) {
            const round = deliveries[deliveries.length - 1]?.logicalRound;
            const result = await service.spin(created.session.sessionId, "spin", round ? undefined : 0.05, undefined, {
                requestId: `delivery-${index}`, delivery: "stepwise",
                ...(round ? {continuation: {roundId: round.roundId, cursor: round.cursor}} : {roundId: "bounded-round"}),
            });
            if (result.status !== "ok") throw new Error(JSON.stringify(result));
            deliveries.push(result.session);
            if (result.session.logicalRound?.status !== "pending") return deliveries;
        }
        throw new Error("Fixture exceeded its bounded delivery count.");
    } finally {
        await service.reset();
    }
}
