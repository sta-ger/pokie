import {execFile} from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import {PackageJsonLike, withLocalPokieDependency} from "pokie";
import {LocalPokieDependencyClosureEntry, resolveLocalPokieDependencyClosure} from "./localPokieDependencyClosure.js";

const execFileAsync = util.promisify(execFile);

export type PackageCommandResult = {stdout: string; stderr: string};

// `cwd` is always the package's own project root -- never a shell string, so `args` (e.g. "install",
// or "run"/"build") is never interpreted for shell metacharacters.
export type PackageCommandRunning = (command: string, args: string[], cwd: string) => Promise<PackageCommandResult>;

// Real npm install/build execution, injected as GamePackagePreparer's own runCommand so tests can
// assert exactly which commands would run (and in what order) without actually invoking npm.
export const runPackageCommand: PackageCommandRunning = async (command, args, cwd) => {
    const {stdout, stderr} = await execFileAsync(command, args, {cwd});
    return {stdout: stdout.toString(), stderr: stderr.toString()};
};

// Rewrites every name in POKIE's own real, on-disk runtime dependency closure (see
// resolveLocalPokieDependencyClosure) to a `file:` spec pointing at this exact running installation's
// already-resolved copy -- via "overrides" (npm's mechanism for a name `pkg` never declares as a
// *direct* dependency of its own, which is every one of these for a freshly staged runtime package)
// except where `pkg` already declares that name directly, which is rewritten in place instead: npm
// rejects an "overrides" entry for a package that's also a direct dependency/devDependency unless it
// matches that direct spec exactly (EOVERRIDE).
function withLocalPokieDependencyClosure(pkg: PackageJsonLike, closure: readonly LocalPokieDependencyClosureEntry[]): PackageJsonLike {
    if (closure.length === 0) {
        return pkg;
    }

    const dependencies = {...pkg.dependencies};
    const devDependencies = {...pkg.devDependencies};
    const overrides = {...pkg.overrides};
    for (const {name, root} of closure) {
        const localSpec = `file:${root}`;
        if (name in dependencies) {
            dependencies[name] = localSpec;
        } else if (name in devDependencies) {
            devDependencies[name] = localSpec;
        } else {
            overrides[name] = localSpec;
        }
    }

    return {...pkg, dependencies, devDependencies, overrides};
}

// Extracts the package name a package-lock.json (lockfileVersion >= 2) "packages" key refers to --
// everything after the final "node_modules/" segment, keeping a scope ("@scope/name") intact. Returns
// undefined for the root package's own "" key, which restorePersistedPackageLock handles separately.
function packageNameFromLockKey(key: string): string | undefined {
    const marker = "node_modules/";
    const markerIndex = key.lastIndexOf(marker);
    if (markerIndex === -1) {
        return undefined;
    }
    const segments = key.slice(markerIndex + marker.length).split("/");
    return segments[0]?.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

// Real `npm install` resolves a `file:` spec (what every name in withLocalPokieDependencyClosure's
// closure -- and "pokie" itself, via withLocalPokieDependency -- is rewritten to) as a symlink by
// default, recorded in package-lock.json as a `{"resolved": "<relative path>", "link": true}` entry
// under its own "node_modules/<name>" key, plus a *second*, separate top-level entry (keyed by that
// same relative path) carrying the linked target's real package.json metadata -- confirmed against a
// real `npm install` of this exact mechanism's own output, not guessed from documentation. Neither
// entry is ever produced any other way (an ordinary registry/git resolution never sets "link" or uses
// a bare relative-path key), so sweeping every "link": true entry whose own name is in `taintedNames`
// -- together with the target entry it points at -- removes exactly and only what this transient
// rewrite added, leaving every other (genuinely portable, registry-resolved) lockfile entry untouched.
function stripLocalPokieLockEntries(packages: Record<string, unknown>, taintedNames: ReadonlySet<string>): void {
    const targetKeysToRemove = new Set<string>();
    for (const [key, rawEntry] of Object.entries(packages)) {
        if (key === "") {
            continue;
        }
        const name = packageNameFromLockKey(key);
        if (name === undefined || !taintedNames.has(name)) {
            continue;
        }
        const entry = rawEntry as {link?: unknown; resolved?: unknown};
        if (entry.link !== true || typeof entry.resolved !== "string") {
            continue;
        }
        targetKeysToRemove.add(entry.resolved);
        Reflect.deleteProperty(packages, key);
    }
    for (const targetKey of targetKeysToRemove) {
        Reflect.deleteProperty(packages, targetKey);
    }
}

// The lockfile's own root ("") entry mirrors whatever "dependencies"/"devDependencies"/"overrides"
// were in package.json the moment "npm install" resolved against it -- the transient, `file:`-rewritten
// versions, not the portable ones restored to disk once install settles. Patched back in place (rather
// than reconstructing the whole root entry) so every other field npm computed there (license, engines,
// bin, ...) survives untouched.
function restorePortableLockRoot(packages: Record<string, unknown>, originalPackageJson: PackageJsonLike): void {
    const root = packages[""] as Record<string, unknown> | undefined;
    if (!root) {
        return;
    }
    for (const field of ["dependencies", "devDependencies", "overrides"] as const) {
        if (field in originalPackageJson) {
            root[field] = originalPackageJson[field];
        } else {
            Reflect.deleteProperty(root, field);
        }
    }
}

// Undoes, inside the just-written package-lock.json, exactly what resolving the transient `file:`
// rewrite above left behind -- the counterpart to restoring package.json itself. Run once "npm install"
// has actually succeeded (a failed install may leave no lockfile, or one mid-write; either way there's
// nothing consistent to normalize, and the next retry re-derives everything fresh). A project with
// "package-lock=false" (no lockfile at all) is left exactly as-is.
function restorePersistedPackageLock(cwd: string, originalPackageJson: PackageJsonLike, taintedNames: ReadonlySet<string>): void {
    const lockPath = path.join(cwd, "package-lock.json");
    if (!fs.existsSync(lockPath)) {
        return;
    }
    const lockfile = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as {packages?: Record<string, unknown>};
    if (!lockfile.packages) {
        return;
    }
    stripLocalPokieLockEntries(lockfile.packages, taintedNames);
    restorePortableLockRoot(lockfile.packages, originalPackageJson);
    fs.writeFileSync(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`);
}

// Wraps a PackageCommandRunning so every "npm install" it runs rewrites `cwd`'s own package.json for
// the duration of that one call -- its direct "pokie" dependency to a `file:` spec bound to
// `pokiePackageRoot` (via withLocalPokieDependency), and every name in "pokie"'s own real runtime
// dependency closure to this exact running installation's already-resolved copies
// (withLocalPokieDependencyClosure) -- the one shared mechanism every real "npm install" this repo's
// tooling runs against a staged/generated package goes through (BlueprintProjectMaterializer's staging
// installs in production; GamePackagePreparer's own real create -> install -> build lifecycle in its own
// integration tests, via tests/testUtils/offlinePokieDependencyOverride.ts's localPokieDependencyRunner)
// so it never has to ask a registry for this exact running POKIE installation, published or not, nor for
// any of its own dependencies (e.g. "exceljs" alone pulls in dozens of packages of its own). Deliberately
// never touches devDependencies-vs-dependencies install semantics itself (e.g. no "--omit=dev") -- a
// caller that needs that (BlueprintProjectMaterializer's own dependency phase never needs devDependencies
// at all, since its staged dist/index.js is already generated -- see its own doc comment) decides that
// for itself. Only "install" invocations are touched -- any other npm subcommand (e.g. "run build")
// passes straight through untouched, since the package.json rewrite only ever matters immediately before
// dependency resolution.
//
// The rewrite is reverted the moment the wrapped "npm install" settles, success or failure alike -- the
// `file:`/`overrides` entries it writes are never what's left on disk once this call returns; the
// package's own "pokie" dependency (and everything buildPackageJsonPatch's caller wrote around it) is
// back to exactly what it was before this call. A successful install's own package-lock.json gets the
// same treatment (restorePersistedPackageLock): real `npm install` resolves those `file:` specs as
// symlinks, which it records in the lockfile as its own absolute-host-tied entries (see
// stripLocalPokieLockEntries's own doc comment) -- left alone, those would survive in the one lockfile
// most likely to be committed, published, or copied elsewhere, even though package.json itself no longer
// mentions them. That's deliberate, not an oversight: `npm install` itself only ever reads package.json
// (and package-lock.json) to *resolve* dependencies into node_modules -- once that's done, nothing later
// (a build, a require("pokie"), a "pokie validate") reads either file's "pokie"/"overrides"/`file:` fields
// again, so there's no reason to leave the resolution mechanism's own, absolute, host-specific paths
// sitting in either file. A later "npm install" against this exact package.json -- whether InitCommand's
// own retry after a failed later phase, or a person re-running "pokie init" by hand -- goes through this
// same wrapper again and re-derives the same local `file:` rewrite fresh from whatever's on disk, so
// offline resolution keeps working across retries without ever depending on a stale rewrite surviving
// between calls. The one path this doesn't cover is a bare, un-wrapped "npm install" run directly against
// this exact package.json/package-lock.json pair after install already succeeded (e.g. after deleting
// node_modules by hand, or on a different machine) -- that reads the portable version range/lockfile this
// leaves behind, exactly like any other npm dependency, and needs "pokie" to actually be resolvable there
// (published, or node_modules copied alongside) -- see renderPackageReadme.ts's own "Moving or copying
// this package" section, which is where that's surfaced to the person running "pokie init". "pokie build"
// (GamePackageGenerator) never goes through this function at all and stays fully portable instead (see
// renderBuiltPackageLock.ts) -- it doesn't run "npm install" itself, so it never needs a local override in
// the first place, at the cost of leaving `node_modules/pokie` for its own generated `require("pokie")` up
// to the caller.
export function withLocalPokieInstall(pokiePackageRoot: string, base: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return async (command, args, cwd) => {
        if (args[0] !== "install") {
            return base(command, args, cwd);
        }
        const packageJsonPath = path.join(cwd, "package.json");
        const original = fs.readFileSync(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(original) as PackageJsonLike;
        const closure = resolveLocalPokieDependencyClosure(pokiePackageRoot);
        const withPokie = withLocalPokieDependency(packageJson, pokiePackageRoot);
        const patched = withLocalPokieDependencyClosure(withPokie, closure);
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(patched, null, 4)}\n`);
        try {
            const result = await base(command, args, cwd);
            const taintedNames = new Set(["pokie", ...closure.map((entry) => entry.name)]);
            restorePersistedPackageLock(cwd, packageJson, taintedNames);
            return result;
        } finally {
            fs.writeFileSync(packageJsonPath, original);
        }
    };
}

// A materialized runtime executes the already-generated dist/index.js, so it needs POKIE at runtime
// but neither TypeScript nor the generated package's development dependencies. Link the running local
// POKIE installation directly instead of invoking npm merely to create that runtime dependency edge.
// Node resolves POKIE's own dependencies from the linked installation, keeping Studio's disposable
// runtime cache offline and usable in hosts where child npm processes are unavailable. Init/create keep
// using withLocalPokieInstall above because they produce standalone, hand-editable npm packages.
export function withLinkedLocalPokieRuntime(pokiePackageRoot: string, base: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return (command, args, cwd) => {
        if (command !== "npm" || args[0] !== "install") {
            return base(command, args, cwd);
        }
        const nodeModules = path.join(cwd, "node_modules");
        fs.mkdirSync(nodeModules, {recursive: true});
        // "junction" is required for directory links on Windows and is accepted for directories on
        // POSIX platforms too. A materializer staging directory is new, so an existing target is a
        // lifecycle error rather than something this helper should silently replace.
        fs.symlinkSync(path.resolve(pokiePackageRoot), path.join(nodeModules, "pokie"), "junction");
        return Promise.resolve({stdout: "", stderr: ""});
    };
}

// execFile/execFileAsync's own rejection carries a failed command's real stderr as a plain "stderr"
// property alongside its (much noisier, command-line-and-exit-code-prefixed) "message" -- shared by
// every "dependencies" phase failure that wants that raw npm output as a secondary "details" field
// (BlueprintMaterializationError, GamePackagePreparationError) without leaking it into the primary,
// human-facing message. Returns undefined for a runCommand implementation that doesn't shape its
// rejections that way, or whose "stderr" is blank.
export function extractNpmStderr(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("stderr" in error)) {
        return undefined;
    }
    const stderr = (error as {stderr?: unknown}).stderr;
    return typeof stderr === "string" && stderr.trim().length > 0 ? stderr : undefined;
}
