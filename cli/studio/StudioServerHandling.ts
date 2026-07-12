import type {PokieDevServerAddress} from "pokie";

export interface StudioServerHandling {
    start(): Promise<PokieDevServerAddress>;

    stop(): Promise<void>;
}
