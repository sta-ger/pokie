import {isPokieGame, PokieGame, PokieGameContractValidationRule, readPokiePackageConfig, ValidationResult} from "pokie";
import path from "path";

export async function loadPokieGame(packageRoot: string): Promise<PokieGame> {
    const {entry} = readPokiePackageConfig(packageRoot);
    const entryPath = path.resolve(packageRoot, entry);
    // A plain absolute path, not a file:// URL: TypeScript downlevels `import()` to
    // `require()` in the CJS build (dist/cjs and ts-jest both compile to CommonJS), and
    // require() does not accept file:// URLs as module specifiers.
    const entryModule = (await import(entryPath)) as Record<string, unknown>;
    const firstLevelCandidate = entryModule.default ?? entryModule;
    // Node's native ESM loader wraps a CommonJS module's whole `module.exports` as `.default`,
    // on top of the `exports.default` that tsc's esModuleInterop already emitted for `export
    // default` — so importing a tsc-compiled entry module here can yield `entryModule.default.default`
    // instead of `entryModule.default`. Unwrap one more level in that case.
    const nestedDefault = (firstLevelCandidate as Record<string, unknown> | null)?.default;
    const candidate = isPokieGame(firstLevelCandidate) || !isPokieGame(nestedDefault) ? firstLevelCandidate : nestedDefault;

    const validation = new ValidationResult(new PokieGameContractValidationRule().validate(candidate));
    if (validation.hasErrors()) {
        const issues = validation
            .getIssues()
            .map((issue) => `  - ${issue.code}: ${issue.message}`)
            .join("\n");
        throw new Error(
            `Entry module "${entryPath}" (from "pokie.entry" in "${packageRoot}/package.json") does not export a valid ` +
                `PokieGame:\n${issues}`,
        );
    }

    return candidate as PokieGame;
}
