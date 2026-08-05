import {PackageJsonLike} from "./PackageJsonLike.js";

// Overrides whatever "pokie" dependency spec buildPackageJsonPatch already wrote (a semver range, e.g.
// "^1.3.0") with a `file:` specifier pointing at `pokiePackageRoot` -- the exact running POKIE
// installation's own root directory, wherever it actually lives on disk (a dev checkout, an npm-linked
// target, a tarball-installed or ordinarily npm-installed copy all resolve to the same kind of absolute
// path here -- see cli/pokie.ts's readOwnPackageRoot()). This is what lets an ephemeral, materialized-
// from-blueprint runtime's own "npm install" resolve "pokie" without ever asking a registry for it, even
// when the running installation's own version has never been published (a local build, a prerelease, an
// offline sandbox). Never mutates `pkg` -- returns a shallow patch, same convention as
// buildPackageJsonPatch itself.
export function withLocalPokieDependency(pkg: PackageJsonLike, pokiePackageRoot: string): PackageJsonLike {
    return {
        ...pkg,
        dependencies: {
            ...pkg.dependencies,
            pokie: `file:${pokiePackageRoot}`,
        },
    };
}
