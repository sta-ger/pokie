import path from "path";
import {PackageJsonLike} from "./PackageJsonLike.js";

// Overrides whatever "@fromstan/pokie" dependency spec buildPackageJsonPatch already wrote (a semver range, e.g.
// "^2.0.0") with a `file:` specifier pointing at `pokiePackageRoot` -- the exact running POKIE
// installation's own root directory, wherever it actually lives on disk (a dev checkout, an npm-linked
// target, a tarball-installed or ordinarily npm-installed copy all resolve to the same kind of absolute
// path here -- see cli/pokie.ts's readOwnPackageRoot()). This is what lets an ephemeral, materialized-
// from-blueprint runtime's own "npm install" resolve "@fromstan/pokie" without ever asking a registry for it, even
// when the running installation's own version has never been published (a local build, a prerelease, an
// offline sandbox). Never mutates `pkg` -- returns a shallow patch, same convention as
// buildPackageJsonPatch itself.
export function withLocalPokieDependency(pkg: PackageJsonLike, pokiePackageRoot: string): PackageJsonLike {
    return {
        ...pkg,
        dependencies: {
            ...pkg.dependencies,
            "@fromstan/pokie": `file:${pokiePackageRoot}`,
        },
    };
}

// Same local-runtime intent as withLocalPokieDependency, but expressed relative to the generated
// package root. A generated game package is a portable directory: an absolute host path in its
// package.json/lockfile leaks the build machine and breaks as soon as the tree is copied. A relative
// `file:` link still lets that package install and run next to the POKIE checkout that built it, while
// `--portable` remains the option for a version-range dependency with no local link at all.
export function withRelativeLocalPokieDependency(pkg: PackageJsonLike, packageRoot: string, pokiePackageRoot: string): PackageJsonLike {
    const relative = path.relative(path.resolve(packageRoot), path.resolve(pokiePackageRoot)).split(path.sep).join("/");
    const specifier = relative.startsWith(".") ? relative : `./${relative}`;
    return {
        ...pkg,
        dependencies: {
            ...pkg.dependencies,
            "@fromstan/pokie": `file:${specifier}`,
        },
    };
}
