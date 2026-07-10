import type {CascadeResultProviding} from "../../../session/videoslot/cascade/CascadeResultProviding.js";
import type {VideoSlotSessionHandling} from "../../../session/videoslot/VideoSlotSessionHandling.js";
import type {VideoSlotSessionSerializing} from "../VideoSlotSessionSerializing.js";
import type {CascadeInitialNetworkData, CascadeRoundNetworkData} from "./CascadeNetworkData.js";

export interface CascadeSessionSerializing<T extends string | number | symbol = string>
    extends VideoSlotSessionSerializing<T> {
    getInitialData(session: VideoSlotSessionHandling<T> & CascadeResultProviding<T>): CascadeInitialNetworkData<T>;

    getRoundData(session: VideoSlotSessionHandling<T> & CascadeResultProviding<T>): CascadeRoundNetworkData<T>;
}
