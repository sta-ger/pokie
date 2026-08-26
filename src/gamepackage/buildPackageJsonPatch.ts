import {PackageJsonLike} from "./PackageJsonLike.js";

const DEFAULT_TYPESCRIPT_VERSION = "^5.0.4";
const ENTRY_PATH = "./dist/index.js";
// A scaffolded package must retain the runtime range of the POKIE installation that created it.
// withLocalPokieInstall substitutes that range with an installation-local `file:` dependency only
// while its first npm install runs, then restores this portable range for the persisted package.
export function buildPackageJsonPatch(pkg: PackageJsonLike, pokieVersion: string): PackageJsonLike {
    return {
        ...pkg,
        // "main"/"exports" and "pokie.entry" below are always forced to the same ENTRY_PATH tsconfig's
        // own outDir/rootDir compiles src/index.ts to -- like pokie.entry already was, unconditionally,
        // before this field existed -- so a package.json this function has touched can never disagree
        // with itself about where its compiled output lives.
        main: ENTRY_PATH,
        exports: ENTRY_PATH,
        scripts: {
            build: "tsc",
            start: "pokie dev .",
            server: "pokie serve .",
            client: "pokie client .",
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
