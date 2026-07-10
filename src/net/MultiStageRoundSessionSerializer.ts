import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {GameInitialNetworkData, GameRoundNetworkData} from "./GameNetworkData.js";
import type {MultiStageRoundNetworkData} from "./MultiStageRoundNetworkData.js";
import type {MultiStageRoundSessionSerializing} from "./MultiStageRoundSessionSerializing.js";

// A universal foundation for "one round is a sequence of stages" mechanics (cascades, multi-pick
// bonuses, ladders, ...) — not video-slot- or cascade-specific itself. A concrete mechanic
// subclasses this, implements getStages() to describe one round's stage sequence in whatever shape
// fits it, and this base handles the rest: spreading a constructor-injected base serializer's own
// output (same "inject a defaulted base, spread its output" convention as
// VideoSlotSessionSerializer/VideoSlotWithFreeGamesSessionSerializer) plus attaching `stages`. See
// CascadeSessionSerializer for the ready-made cascade implementation built on top of this — a
// third-party game can subclass this the exact same way for an entirely different multi-stage
// mechanic, without any server-core changes.
export abstract class MultiStageRoundSessionSerializer<
    TSession extends GameSessionHandling,
    TStage,
    TBaseRoundData extends GameRoundNetworkData = GameRoundNetworkData,
    TBaseInitialData extends GameInitialNetworkData = GameInitialNetworkData,
> implements MultiStageRoundSessionSerializing<TSession, TStage, TBaseRoundData, TBaseInitialData> {
    private readonly baseSerializer: {
        getInitialData(session: TSession): TBaseInitialData;
        getRoundData(session: TSession): TBaseRoundData;
    };

    constructor(baseSerializer: {
        getInitialData(session: TSession): TBaseInitialData;
        getRoundData(session: TSession): TBaseRoundData;
    }) {
        this.baseSerializer = baseSerializer;
    }

    public getInitialData(session: TSession): TBaseInitialData & MultiStageRoundNetworkData<TStage> {
        return {...this.baseSerializer.getInitialData(session), stages: this.getStages(session)};
    }

    public getRoundData(session: TSession): TBaseRoundData & MultiStageRoundNetworkData<TStage> {
        return {...this.baseSerializer.getRoundData(session), stages: this.getStages(session)};
    }

    protected abstract getStages(session: TSession): TStage[];
}
