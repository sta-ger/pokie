import type {PokieDevServerAddress} from "./PokieDevServerAddress.js";

export interface PokieClientServerHandling {
    start(): Promise<PokieDevServerAddress>;

    stop(): Promise<void>;
}
