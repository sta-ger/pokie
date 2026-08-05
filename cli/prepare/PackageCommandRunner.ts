import {execFile} from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import {PackageJsonLike, withLocalPokieDependency} from "pokie";

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

// Wraps a PackageCommandRunning so every "npm install" it runs first rewrites `cwd`'s own package.json
// "pokie" dependency to a `file:` spec bound to `pokiePackageRoot` (via withLocalPokieDependency) --
// the one shared mechanism BlueprintProjectMaterializer's staging installs go through so a materialized
// runtime never has to ask a registry for this exact, possibly-unpublished running POKIE installation.
// Only "install" invocations are touched -- any other npm subcommand (e.g. "run build") passes straight
// through untouched, since the package.json rewrite only ever matters immediately before dependency
// resolution.
export function withLocalPokieInstall(pokiePackageRoot: string, base: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return (command, args, cwd) => {
        if (args[0] === "install") {
            const packageJsonPath = path.join(cwd, "package.json");
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike;
            fs.writeFileSync(packageJsonPath, `${JSON.stringify(withLocalPokieDependency(packageJson, pokiePackageRoot), null, 4)}\n`);
        }
        return base(command, args, cwd);
    };
}
