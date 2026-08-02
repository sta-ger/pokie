import type {PackageJsonLike} from "../gamepackage/PackageJsonLike.js";

// A minimal, offline-generated lockfile seed for the "pokie build" package.json this accompanies --
// deterministic (no timestamps), so re-running "pokie build" on an unchanged blueprint reproduces a
// byte-identical file, same as every other file GamePackageGenerator writes. Unlike the real
// package-lock.json a genuine `npm install` would write (see GamePackagePreparer's own "dependencies"
// phase), this carries no resolved/integrity metadata -- producing that would mean actually
// contacting the npm registry, which "pokie build" never does (the whole package it writes stays
// immediately usable with no separate install/compile step). Running `npm install` in the built
// package still works exactly as it would against any lockfile that predates a fresh install: npm
// reconciles/rewrites this file against whatever it actually resolves.
export function renderBuiltPackageLock(packageJson: PackageJsonLike): string {
    const name = typeof packageJson.name === "string" ? packageJson.name : undefined;
    const version = typeof packageJson.version === "string" ? packageJson.version : undefined;

    const rootPackage = {
        ...(name !== undefined ? {name} : {}),
        ...(version !== undefined ? {version} : {}),
        ...(packageJson.dependencies ? {dependencies: packageJson.dependencies} : {}),
        ...(packageJson.devDependencies ? {devDependencies: packageJson.devDependencies} : {}),
    };

    const lockfile = {
        ...(name !== undefined ? {name} : {}),
        ...(version !== undefined ? {version} : {}),
        lockfileVersion: 3,
        requires: true,
        packages: {
            "": rootPackage,
        },
    };

    return `${JSON.stringify(lockfile, null, 4)}\n`;
}
