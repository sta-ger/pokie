import {PackageJsonLike} from "./PackageJsonLike.js";

const DEFAULT_TYPESCRIPT_VERSION = "^5.0.4";
const ENTRY_PATH = "./dist/index.js";

export function buildPackageJsonPatch(pkg: PackageJsonLike, pokieVersion: string): PackageJsonLike {
    return {
        ...pkg,
        scripts: {
            build: "tsc",
            sim: "pokie sim",
            ...pkg.scripts,
        },
        dependencies: {
            pokie: `^${pokieVersion}`,
            ...pkg.dependencies,
        },
        devDependencies: {
            typescript: DEFAULT_TYPESCRIPT_VERSION,
            ...pkg.devDependencies,
        },
        pokie: {
            ...pkg.pokie,
            entry: ENTRY_PATH,
        },
    };
}
