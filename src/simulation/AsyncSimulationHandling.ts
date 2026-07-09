import type {SimulationHandling} from "./SimulationHandling.js";

export interface AsyncSimulationHandling extends SimulationHandling {
    runAsync(): Promise<void>;
}
