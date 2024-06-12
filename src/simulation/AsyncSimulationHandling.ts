import {SimulationHandling} from "pokie";

export interface AsyncSimulationHandling extends SimulationHandling {
    runAsync(): Promise<void>;
}
