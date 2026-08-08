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

// Wraps a PackageCommandRunning so every "npm install" it runs first rewrites `cwd`'s own package.json
// -- its direct "pokie" dependency to a `file:` spec bound to `pokiePackageRoot` (via
// withLocalPokieDependency), and every name in "pokie"'s own real runtime dependency closure to this
// exact running installation's already-resolved copies (withLocalPokieDependencyClosure) -- the one
// shared mechanism every real "npm install" this repo's tooling runs against a staged/generated package
// goes through (BlueprintProjectMaterializer's staging installs in production; GamePackagePreparer's own
// real create -> install -> build lifecycle in its own integration tests, via
// tests/testUtils/offlinePokieDependencyOverride.ts's localPokieDependencyRunner) so it never has to ask
// a registry for this exact, possibly-unpublished running POKIE installation, nor for any of its own
// dependencies (e.g. "exceljs" alone pulls in dozens of packages of its own). Deliberately never touches
// devDependencies-vs-dependencies install semantics itself (e.g. no "--omit=dev") -- a caller that needs
// that (BlueprintProjectMaterializer's own dependency phase never needs devDependencies at all, since its
// staged dist/index.js is already generated -- see its own doc comment) decides that for itself. Only
// "install" invocations are touched -- any other npm subcommand (e.g. "run build") passes straight
// through untouched, since the package.json rewrite only ever matters immediately before dependency
// resolution.
export function withLocalPokieInstall(pokiePackageRoot: string, base: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return (command, args, cwd) => {
        if (args[0] !== "install") {
            return base(command, args, cwd);
        }
        const packageJsonPath = path.join(cwd, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
        const withPokie = withLocalPokieDependency(packageJson, pokiePackageRoot);
        const patched = withLocalPokieDependencyClosure(withPokie, pokiePackageRoot);
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(patched, null, 4)}\n`);
        return base(command, args, cwd);
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
