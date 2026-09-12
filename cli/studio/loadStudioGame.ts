import {loadPokieGame, PokieGamePackageValidator, resolvePokieGameEntryModule, type PokieGameEntryModuleLoading} from "pokie";
import fs from "fs";
import {createRequire} from "module";
import path from "path";

type DynamicModuleImporting = (entryPath: string) => Promise<Record<string, unknown>>;

// Keep this native dynamic import even when Studio's own CJS build is executing under Jest or an
// embedded host.  TypeScript otherwise rewrites `import()` to require(), which cannot load an ESM
// package entry at all and would make the Studio injection path diverge from the normal loader.
// eslint-disable-next-line no-new-func -- preserves native ESM loading in CJS/Jest hosts.
const importEntryModule: DynamicModuleImporting = (entryPath) => {
    // Do not retain a Function-created import callback at module scope. In a
    // long-lived Jest/embedded Studio host that function can outlive the VM
    // context which supplied its dynamic-import hook, producing a late
    // "Test environment has been torn down" even though the caller awaited
    // its loader promise. Construct it at the actual execution boundary so
    // each entry load binds to the current host context.
    // eslint-disable-next-line no-new-func -- preserves native ESM loading in CJS/Jest hosts.
    const nativeDynamicImport = new Function("entryPath", "return import(entryPath);") as (path: string) => Promise<Record<string, unknown>>;
    return nativeDynamicImport(entryPath);
};

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
        // CommonJS does not need native dynamic import at all. Loading it with
        // an entry-anchored require both gives its dependency graph the Studio
        // runtime overlay and avoids retaining a VM dynamic-import callback
        // across a long-lived embedded host's context boundary.
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
    if (path.extname(entryPath) === ".cjs") return true;
    if (path.extname(entryPath) !== ".js") return false;
    let packageRoot = path.dirname(entryPath);
    while (!fs.existsSync(path.join(packageRoot, "package.json")) && path.dirname(packageRoot) !== packageRoot) {
        packageRoot = path.dirname(packageRoot);
    }
    try {
        return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).type !== "module";
    } catch {
        return true;
    }
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
    let packageRoot = path.dirname(entryPath);
    while (!fs.existsSync(path.join(packageRoot, "package.json")) && path.dirname(packageRoot) !== packageRoot) {
        packageRoot = path.dirname(packageRoot);
    }
    const dependencies = path.join(packageRoot, "node_modules");
    const injectedRuntime = path.join(dependencies, "pokie");
    if (!fs.existsSync(injectedRuntime)) {
        fs.mkdirSync(dependencies, {recursive: true});
        // The Studio runtime itself is a normal package directory. Linking it into the disposable
        // snapshot lets Node supply its own CJS wrapper, require.resolve and import callback.
        fs.symlinkSync(path.dirname(studioRequire.resolve("pokie")), injectedRuntime, process.platform === "win32" ? "junction" : "dir");
    }
    return createRequire(entryPath)(entryPath) as Record<string, unknown>;
}
