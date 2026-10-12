import type {PokieDevServerAddress} from "@fromstan/pokie";

export interface StudioServerHandling {
    start(): Promise<PokieDevServerAddress>;

    stop(): Promise<void>;
}
