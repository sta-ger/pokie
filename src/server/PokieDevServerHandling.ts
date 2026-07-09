import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";

export interface PokieDevServerHandling {
    start(): Promise<PokieDevServerAddress>;

    stop(): Promise<void>;
}
