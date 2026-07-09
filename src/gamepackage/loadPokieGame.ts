import {isPokieGame, PokieGame, readPokiePackageConfig} from "pokie";
import path from "path";

export async function loadPokieGame(packageRoot: string): Promise<PokieGame> {
    const {entry} = readPokiePackageConfig(packageRoot);
    const entryPath = path.resolve(packageRoot, entry);
    // A plain absolute path, not a file:// URL: TypeScript downlevels `import()` to
    // `require()` in the CJS build (dist/cjs and ts-jest both compile to CommonJS), and
    // require() does not accept file:// URLs as module specifiers.
    const entryModule = (await import(entryPath)) as Record<string, unknown>;
    const candidate = entryModule.default ?? entryModule;

    if (!isPokieGame(candidate)) {
        throw new Error(
            `Entry module "${entryPath}" (from "pokie.entry" in "${packageRoot}/package.json") does not export a valid ` +
                "PokieGame. Export an object implementing getManifest() and createSession() as the module's default export.",
        );
    }

    return candidate;
}
