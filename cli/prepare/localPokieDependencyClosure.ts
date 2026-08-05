import fs from "fs";
import {createRequire} from "module";
import path from "path";

export type LocalPokieDependencyClosureEntry = {readonly name: string; readonly root: string};

// Locates `name`'s own package root directory the same way Node itself would when a materialized
// runtime's "require(\"pokie\")" later walks into it -- resolving its main entry (never a
// "<name>/package.json" subpath import, which a modern package's own "exports" map routinely blocks,
// e.g. commander's) via `requireFromPokie`, then walking up from that entry's directory until a
// package.json declaring a matching "name" is found. Returns undefined for a name that isn't
// resolvable on disk at all (an unusual host layout, a package manager that doesn't leave a
// conventional node_modules behind) rather than throwing -- that name is simply left out of the
// closure below, so "npm install" falls back to the registry for it, exactly as if this mechanism
// didn't exist for that one dependency.
function resolvePackageRoot(
    requireFromPokie: NodeRequire,
    name: string,
): {readonly root: string; readonly dependencies: readonly string[]} | undefined {
    let entryPath: string;
    try {
        entryPath = requireFromPokie.resolve(name);
    } catch {
        return undefined;
    }

    let dir = path.dirname(entryPath);
    for (;;) {
        const candidate = path.join(dir, "package.json");
        if (fs.existsSync(candidate)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8")) as {name?: string; dependencies?: Record<string, string>};
                if (pkg.name === name) {
                    return {root: dir, dependencies: Object.keys(pkg.dependencies ?? {})};
                }
            } catch {
                // Not a valid package.json -- keep walking up in case a parent directory has one.
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

// Walks the real, on-disk runtime dependency closure of the running POKIE installation at
// `pokiePackageRoot` -- starting from its own package.json "dependencies" (never "devDependencies":
// those were never installed for a `pokiePackageRoot` that isn't a dev checkout, e.g. a real end
// user's "npm install -g pokie", so treating them as part of this closure would make materialization
// depend on state that doesn't exist for a real installation) -- resolved via Node's own
// require.resolve, the same algorithm Node itself uses when a materialized runtime's
// "require(\"pokie\")" later loads this exact tree. This is what lets withLocalPokieInstall rewrite
// every one of "pokie"'s own transitive dependencies (e.g. "exceljs" pulling in dozens of packages of
// its own) to this exact running installation's already-resolved copies, so a staged runtime's own
// "npm install" never needs a registry for any of them, not just "pokie" itself.
//
// A `pokiePackageRoot` whose own package.json can't be read (a nonexistent path, most commonly a test
// double) simply yields an empty closure -- npm install falls back to ordinary registry resolution for
// every name, same as before this mechanism existed, rather than this throwing.
export function resolveLocalPokieDependencyClosure(pokiePackageRoot: string): LocalPokieDependencyClosureEntry[] {
    const ownPackageJsonPath = path.join(pokiePackageRoot, "package.json");
    let ownDependencyNames: string[];
    let requireFromPokie: NodeRequire;
    try {
        const ownPackageJson = JSON.parse(fs.readFileSync(ownPackageJsonPath, "utf-8")) as {dependencies?: Record<string, string>};
        ownDependencyNames = Object.keys(ownPackageJson.dependencies ?? {});
        requireFromPokie = createRequire(ownPackageJsonPath);
    } catch {
        return [];
    }

    const resolvedRoots = new Map<string, string>();
    const queue = [...ownDependencyNames];
    while (queue.length > 0) {
        const name = queue.shift() as string;
        if (resolvedRoots.has(name)) {
            continue;
        }
        const resolved = resolvePackageRoot(requireFromPokie, name);
        if (resolved === undefined) {
            continue;
        }
        resolvedRoots.set(name, resolved.root);
        queue.push(...resolved.dependencies);
    }

    return [...resolvedRoots.entries()].map(([name, root]) => ({name, root}));
}
