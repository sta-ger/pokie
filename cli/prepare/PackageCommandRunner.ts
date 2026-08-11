import {execFile} from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import {PackageJsonLike, withLocalPokieDependency} from "pokie";
import {resolveLocalPokieDependencyClosure} from "./localPokieDependencyClosure.js";

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
function withLocalPokieDependencyClosure(pkg: PackageJsonLike, pokiePackageRoot: string): PackageJsonLike {
    const closure = resolveLocalPokieDependencyClosure(pokiePackageRoot);
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
// back to exactly what it was before this call. That's deliberate, not an oversight: `npm install`
// itself only ever reads package.json to *resolve* dependencies into node_modules/package-lock.json --
// once that's done, nothing later (a build, a require("pokie"), a "pokie validate") reads package.json's
// "pokie"/"overrides" fields again, so there's no reason to leave the resolution mechanism's own,
// absolute, host-specific paths sitting in the one file most likely to be committed, published, or
// copied elsewhere. A later "npm install" against this exact package.json -- whether InitCommand's own
// retry after a failed later phase, or a person re-running "pokie init" by hand -- goes through this same
// wrapper again and re-derives the same local `file:` rewrite fresh from whatever's on disk, so offline
// resolution keeps working across retries without ever depending on a stale rewrite surviving between
// calls. The one path this doesn't cover is a bare, un-wrapped "npm install" run directly against this
// package.json after install already succeeded (e.g. after deleting node_modules by hand, or on a
// different machine) -- that reads the portable version range this leaves behind, exactly like any other
// npm dependency, and needs "pokie" to actually be resolvable there (published, or node_modules copied
// alongside) -- see renderPackageReadme.ts's own "Moving or copying this package" section, which is where
// that's surfaced to the person running "pokie init". "pokie build" (GamePackageGenerator) never goes
// through this function at all and stays fully portable instead (see renderBuiltPackageLock.ts) -- it
// doesn't run "npm install" itself, so it never needs a local override in the first place, at the cost of
// leaving `node_modules/pokie` for its own generated `require("pokie")` up to the caller.
export function withLocalPokieInstall(pokiePackageRoot: string, base: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return async (command, args, cwd) => {
        if (args[0] !== "install") {
            return base(command, args, cwd);
        }
        const packageJsonPath = path.join(cwd, "package.json");
        const original = fs.readFileSync(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(original) as PackageJsonLike;
        const withPokie = withLocalPokieDependency(packageJson, pokiePackageRoot);
        const patched = withLocalPokieDependencyClosure(withPokie, pokiePackageRoot);
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(patched, null, 4)}\n`);
        try {
            return await base(command, args, cwd);
        } finally {
            fs.writeFileSync(packageJsonPath, original);
        }
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
