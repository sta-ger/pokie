import {loadPokieGame, PokieGamePackageValidator, resolvePokieGameEntryModule, type PokieGameEntryModuleLoading} from "pokie";
import fs from "fs";
import {createRequire} from "module";
import path from "path";
import vm from "vm";

type DynamicModuleImporting = (entryPath: string) => Promise<Record<string, unknown>>;
type CommonJsModule = {exports: Record<string, unknown>; require: (request: string) => unknown};

// Keep this native dynamic import even when Studio's own CJS build is executing under Jest or an
// embedded host.  TypeScript otherwise rewrites `import()` to require(), which cannot load an ESM
// package entry at all and would make the Studio injection path diverge from the normal loader.
// eslint-disable-next-line no-new-func -- preserves native ESM loading in CJS/Jest hosts.
const nativeDynamicImport = new Function("entryPath", "return import(entryPath);") as (entryPath: string) => Promise<Record<string, unknown>>;
const importEntryModule: DynamicModuleImporting = (entryPath) => nativeDynamicImport(entryPath);

// Packages produced by POKIE need its runtime at execution time, but a just-built package has no
// node_modules directory of its own. Studio already has that exact runtime loaded. When the only
// missing module is `pokie`, load the CommonJS entry with the Studio installation as that dependency;
// all other imports still resolve from the project's own location and retain Node's normal failures.
export function createStudioEntryModuleLoader(
    pokiePackageRoot: string,
    dynamicImport: DynamicModuleImporting = importEntryModule,
): PokieGameEntryModuleLoading {
    const studioRequire = createRequire(path.join(pokiePackageRoot, "package.json"));
    return async (entryPath) => {
        // A CJS game is deliberately evaluated with Studio's runtime injection even if a parent
        // test/workspace happens to expose a transient `node_modules/pokie`. That keeps the
        // no-local-dependency Studio contract deterministic and avoids an accidental dependency
        // lookup choosing a different runtime than the one Studio itself is serving.
        if (dynamicImport === importEntryModule && isCommonJsEntry(entryPath)) {
            return loadCommonJsEntryWithStudioRuntime(entryPath, studioRequire);
        }
        try {
            return await dynamicImport(entryPath);
        } catch (error) {
            if (!isMissingPokieRuntime(error)) {
                throw error;
            }
            return loadCommonJsEntryWithStudioRuntime(entryPath, studioRequire);
        }
    };
}

function isCommonJsEntry(entryPath: string): boolean {
    const extension = path.extname(entryPath).toLowerCase();
    if (extension === ".cjs") return true;
    if (extension === ".mjs") return false;

    let packageRoot = path.dirname(entryPath);
    while (path.dirname(packageRoot) !== packageRoot) {
        const packageJson = path.join(packageRoot, "package.json");
        if (fs.existsSync(packageJson)) {
            try {
                return JSON.parse(fs.readFileSync(packageJson, "utf-8")).type !== "module";
            } catch {
                return true;
            }
        }
        packageRoot = path.dirname(packageRoot);
    }
    return true;
}

export function createStudioGameLoader(pokiePackageRoot: string): typeof loadPokieGame {
    const loadEntryModule = createStudioEntryModuleLoader(pokiePackageRoot);
    return (packageRoot) => loadPokieGame(packageRoot, loadEntryModule);
}

export function createStudioGamePackageValidator(pokiePackageRoot: string): PokieGamePackageValidator {
    const loadEntryModule = createStudioEntryModuleLoader(pokiePackageRoot);
    return new PokieGamePackageValidator((packageRoot) => resolvePokieGameEntryModule(packageRoot, loadEntryModule));
}

function isMissingPokieRuntime(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as {code?: unknown}).code === "MODULE_NOT_FOUND" &&
        (/Cannot find module ['"]pokie['"]/).test(String((error as {message?: unknown}).message))
    );
}

function loadCommonJsEntryWithStudioRuntime(entryPath: string, studioRequire: NodeJS.Require): Record<string, unknown> {
    const projectRequire = createRequire(entryPath);
    const requireFromProject = (request: string): unknown => (request === "pokie" ? studioRequire("pokie") : projectRequire(request));
    const module: CommonJsModule = {exports: {}, require: requireFromProject};
    const execute = vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {\n${fs.readFileSync(entryPath, "utf-8")}\n})`, {
        filename: entryPath,
    }) as (exports: Record<string, unknown>, require: (request: string) => unknown, module: CommonJsModule, filename: string, dirname: string) => void;
    execute(module.exports, requireFromProject, module, entryPath, path.dirname(entryPath));
    return module.exports;
}
