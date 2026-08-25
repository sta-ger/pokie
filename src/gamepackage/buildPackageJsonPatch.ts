import {PackageJsonLike} from "./PackageJsonLike.js";

const DEFAULT_TYPESCRIPT_VERSION = "^5.0.4";
const ENTRY_PATH = "./dist/index.js";
// v1.3.0 is the current development candidate, not an npm release. Generated and scaffolded game
// packages must declare a runtime a fresh `npm install` can actually resolve; the generated game
// module uses the public API contract retained by this released baseline. The caller's version is
// still carried in generated provenance/header data where it describes the tool that built it.
export const PUBLISHED_POKIE_RUNTIME_VERSION = "1.2.1";

export function buildPackageJsonPatch(pkg: PackageJsonLike, _pokieVersion: string): PackageJsonLike {
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
            pokie: `^${PUBLISHED_POKIE_RUNTIME_VERSION}`,
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
