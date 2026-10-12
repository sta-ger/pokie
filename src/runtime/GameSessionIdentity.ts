import type {PokieGame} from "../gamepackage/PokieGame.js";

export type GameSessionIdentity = {
    readonly gameId: string;
    readonly compatibilityVersion: string;
    readonly stateSchemaVersion: string;
    readonly modelHash?: string;
};

export function resolveGameSessionIdentity(game: PokieGame): GameSessionIdentity {
    const manifest = game.getManifest();
    const compatibility = game.getSessionCompatibility?.();
    if (game.getSessionCompatibility !== undefined && (typeof game.getSessionCompatibility !== "function" || compatibility === undefined || compatibility === null ||
        typeof compatibility.version !== "string" || !compatibility.version.trim() || typeof compatibility.stateSchemaVersion !== "string" || !compatibility.stateSchemaVersion.trim())) {
        throw new Error("Selected game has invalid session compatibility metadata.");
    }
    const identity = {
        gameId: manifest.id,
        compatibilityVersion: compatibility?.version ?? manifest.version,
        stateSchemaVersion: compatibility?.stateSchemaVersion ?? "1",
        ...(game.getConfigHash === undefined ? {} : {modelHash: game.getConfigHash()}),
    };
    if ([identity.gameId, identity.compatibilityVersion, identity.stateSchemaVersion].some(value => typeof value !== "string" || !value.trim()) ||
        (game.getConfigHash !== undefined && (typeof identity.modelHash !== "string" || !identity.modelHash))) throw new Error("Selected game has invalid compatibility identity.");
    return identity;
}
