import {PokieGame} from "pokie";

export function isPokieGame(value: unknown): value is PokieGame {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Partial<PokieGame>;
    return typeof candidate.getManifest === "function" && typeof candidate.createSession === "function";
}
