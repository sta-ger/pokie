import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {GameInitialNetworkData, GameRoundNetworkData} from "./GameNetworkData.js";
import type {MultiStageRoundNetworkData} from "./MultiStageRoundNetworkData.js";

// Deliberately does not `extends GameSessionSerializing` — its own generic bounds (TBaseRoundData/
// TBaseInitialData) already require at least the same shape, and leaving the base interface out
// avoids a return-type conflict when a concrete mechanic (e.g. cascades) plugs in a richer base
// serializer whose own data shape is itself wider than the plain GameSessionSerializing one.
export interface MultiStageRoundSessionSerializing<
    TSession extends GameSessionHandling = GameSessionHandling,
    TStage = unknown,
    TBaseRoundData extends GameRoundNetworkData = GameRoundNetworkData,
    TBaseInitialData extends GameInitialNetworkData = GameInitialNetworkData,
> {
    getInitialData(session: TSession): TBaseInitialData & MultiStageRoundNetworkData<TStage>;

    getRoundData(session: TSession): TBaseRoundData & MultiStageRoundNetworkData<TStage>;
}
