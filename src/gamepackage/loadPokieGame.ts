import type {PokieGame} from "./PokieGame.js";
import {PokieGameContractValidationRule} from "./PokieGameContractValidationRule.js";
import {PokieGameEntryModuleLoading, resolvePokieGameEntryModule} from "./resolvePokieGameEntryModule.js";
import {ValidationResult} from "../validation/ValidationResult.js";

type LoadedGameRelease = () => Promise<void>;
const loadedGameReleases = new WeakMap<object, LoadedGameRelease>();

export type LoadedPokieGame = {
    game: PokieGame;
    release: () => Promise<void>;
};

// The explicit lifetime API for hosts which keep a game/session alive (Studio Play, an RGS, or a
// long-running embedder).  The returned game executes from an isolated package snapshot; release
// removes that snapshot and its CommonJS cache entries once no session can use it any more.
export async function loadPokieGameRuntime(packageRoot: string, loadEntryModule?: PokieGameEntryModuleLoading): Promise<LoadedPokieGame> {
    const {entryPath, candidate, release} = await resolvePokieGameEntryModule(packageRoot, loadEntryModule);

    const validation = new ValidationResult(new PokieGameContractValidationRule().validate(candidate));
    if (validation.hasErrors()) {
        await release();
        const issues = validation
            .getIssues()
            .map((issue) => `  - ${issue.code}: ${issue.message}`)
            .join("\n");
        throw new Error(
            `Entry module "${entryPath}" (from "pokie.entry" in "${packageRoot}/package.json") does not export a valid ` +
                `PokieGame:\n${issues}`,
        );
    }

    return {game: candidate as PokieGame, release};
}

// Compatibility API: existing callers still receive a PokieGame directly.  Hosts that can own a
// lifecycle should call releasePokieGame(game), or use loadPokieGameRuntime() for an explicit lease.
export async function loadPokieGame(packageRoot: string, loadEntryModule?: PokieGameEntryModuleLoading): Promise<PokieGame> {
    const loaded = await loadPokieGameRuntime(packageRoot, loadEntryModule);
    loadedGameReleases.set(loaded.game, loaded.release);
    // Keep the compatibility return type a PokieGame while making the ownership boundary discoverable
    // to plain JavaScript consumers too (where releasePokieGame(game) is less obvious). Never replace a
    // handwritten game's own lifecycle hook.
    if (loaded.game.release === undefined && Reflect.isExtensible(loaded.game)) {
        Reflect.defineProperty(loaded.game, "release", {
            configurable: true,
            enumerable: false,
            value: () => releasePokieGame(loaded.game),
        });
    }
    return loaded.game;
}

// Idempotent on both directly-loaded games and ordinary handwritten PokieGame values.  Keeping the
// release association out of the game object preserves the public game contract and serialisation.
export async function releasePokieGame(game: PokieGame): Promise<void> {
    const release = loadedGameReleases.get(game);
    loadedGameReleases.delete(game);
    if (release !== undefined) {
        await release();
    }
}
