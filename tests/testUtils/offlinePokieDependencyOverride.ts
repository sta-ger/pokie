import fs from "fs";
import path from "path";
import {PackageCommandResult, PackageCommandRunning, runPackageCommand} from "../../cli/prepare/PackageCommandRunner.js";

export const REPO_ROOT = path.join(__dirname, "..", "..");

// Shared by every test that runs a real, uninjected PackageCommandRunning ("npm install" for real) against a
// package this repo's own tooling just scaffolded/generated -- e.g. GamePackagePreparer.integration.test.ts
// (a hand-editable scaffold) and BlueprintProjectMaterializer.integration.test.ts (a blueprint-generated
// package). Real `npm install` calls are slow and, without this override, would also reach the public
// registry for "pokie" itself, "typescript", and every one of this checkout's own transitive dependencies
// (e.g. "exceljs" alone pulls in dozens of packages like "archiver" and "@fast-csv/format") -- exactly the
// kind of fetch a network-restricted CI sandbox can't complete. Redirecting all of them to this checkout's own
// already-installed copies via `file:` (direct deps) and `overrides` (the full transitive closure, which a
// scaffolded/generated package never declares directly) means "npm install" here never needs the registry at
// all, and always resolves "pokie" to this exact checkout rather than a possibly-stale published version.
export function collectTransitiveDependencyNames(rootNames: string[]): string[] {
    const collected = new Set<string>();
    const queue = [...rootNames];
    while (queue.length > 0) {
        const name = queue.shift() as string;
        if (collected.has(name)) {
            continue;
        }
        collected.add(name);
        const pkgPath = path.join(REPO_ROOT, "node_modules", name, "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {dependencies?: Record<string, string>};
        queue.push(...Object.keys(pkg.dependencies ?? {}));
    }
    return [...collected];
}

export function localPokieDependencyRunner(realRunCommand: PackageCommandRunning = runPackageCommand): PackageCommandRunning {
    return (command: string, args: string[], cwd: string): Promise<PackageCommandResult> => {
        if (args[0] === "install") {
            const packageJsonPath = path.join(cwd, "package.json");
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
                overrides?: Record<string, string>;
            };
            const repoPackageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8")) as {
                dependencies?: Record<string, string>;
            };
            const localFileSpec = (name: string): string => `file:${path.join(REPO_ROOT, "node_modules", name)}`;
            packageJson.dependencies = {...packageJson.dependencies, pokie: `file:${REPO_ROOT}`};
            packageJson.devDependencies = {...packageJson.devDependencies, typescript: localFileSpec("typescript")};
            const transitiveNames = collectTransitiveDependencyNames(Object.keys(repoPackageJson.dependencies ?? {}));
            const overrideNames: string[] = [];
            for (const name of transitiveNames) {
                // npm rejects an `overrides` entry for a package that's also a *direct* dependency/devDependency
                // unless the override matches that direct spec exactly (EOVERRIDE) -- e.g. the generated
                // blueprint package.json (GamePackageGenerator) already declares its own "@types/node" devDependency,
                // which collides with this closure's own entry for the same package. Rewriting the direct spec
                // in place (same as "typescript" above) keeps both pinned to this checkout without that conflict.
                if (packageJson.dependencies && name in packageJson.dependencies) {
                    packageJson.dependencies[name] = localFileSpec(name);
                } else if (packageJson.devDependencies && name in packageJson.devDependencies) {
                    packageJson.devDependencies[name] = localFileSpec(name);
                } else {
                    overrideNames.push(name);
                }
            }
            packageJson.overrides = {
                ...packageJson.overrides,
                ...Object.fromEntries(overrideNames.map((name) => [name, localFileSpec(name)])),
            };
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));
        }
        return realRunCommand(command, args, cwd);
    };
}
