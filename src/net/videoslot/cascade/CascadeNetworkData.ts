import type {MultiStageRoundNetworkData} from "../../MultiStageRoundNetworkData.js";
import type {VideoSlotInitialNetworkData, VideoSlotRoundNetworkData} from "../VideoSlotNetworkData.js";
import type {CascadeStepNetworkData} from "./CascadeStepNetworkData.js";

export type CascadeRoundNetworkData<T extends string | number | symbol = string> = {
    initialScreen: T[][];
    finalScreen: T[][];
    totalCascadeWin: number;
    cascadeMetadata: Record<string, unknown>;
    cascadeRngInfo: Record<string, unknown>;
    cascadeDebugInfo: Record<string, unknown>;
} & VideoSlotRoundNetworkData<T> &
    MultiStageRoundNetworkData<CascadeStepNetworkData<T>>;

export type CascadeInitialNetworkData<T extends string | number | symbol = string> = VideoSlotInitialNetworkData<T> &
    CascadeRoundNetworkData<T>;
