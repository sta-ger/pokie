import type {PokieInternalSessionData} from "./PokieInternalSessionData.js";

// `sessionId`/`game`/`credits` are always present, server-computed fields (credits always the
// authoritative wallet balance, never a game's own possibly-stale getCreditsAmount()). Everything
// else depends on whether the loaded game provided a serializer (see PokieGame.getSessionSerializer):
// without one, the response is the original narrow shape (`bet`/`win?`/`screen?`, still declared
// here for documentation/DX); with one, it's `{...serializer.getInitialData()/.getRoundData()
// output}` instead — an open-ended, game-specific shape the `& Record<string, unknown>` allows for.
//
// This is the **public** response shape — everything above is client-safe by construction (see
// GameSessionSerializing's own contract) and is what every `pokie serve` endpoint returns by
// default. `internal` is the one exception: present only when a request explicitly opts into it (the
// `debug` query parameter), never populated otherwise — see PokieInternalSessionData and
// PokieDevServer's public/internal split.
export type PokieDevSessionResponse = {
    sessionId: string;
    game: {
        id: string;
        name: string;
        version: string;
    };
    credits: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
    internal?: PokieInternalSessionData;
} & Record<string, unknown>;
