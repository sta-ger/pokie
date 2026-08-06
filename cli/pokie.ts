#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";
import {dispatch} from "./dispatch.js";
import {registerCliCommands} from "./registerCliCommands.js";

// This compiled file always lives at "<pokiePackageRoot>/dist/cli/pokie.js", regardless of how the
// running POKIE installation actually got onto disk -- a dev checkout, an npm-linked target (Node's own
// module loader resolves a symlinked entry to its real, target-side path before import.meta.url is ever
// read), a tarball install, or an ordinary registry install all share that same two-levels-up shape. That
// makes this the one safe place every materialization call site (below, and StudioCommand's own) gets
// both the running version and the running installation's own root from -- see readOwnPackageRoot()'s
// own doc comment for what the latter is for.
function ownPackageDir(): string {
    return path.dirname(fileURLToPath(import.meta.url));
}

function readOwnVersion(): string {
    const packageJsonPath = path.join(ownPackageDir(), "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {version: string};
    return pkg.version;
}

// The running POKIE installation's own root directory -- passed into every
// createMaterializingRuntimePackageResolver() call (and StudioCommand) as `pokiePackageRoot`, so a
// materialized Blueprint's own "npm install" can resolve "pokie" against this exact installation (via
// withLocalPokieInstall) instead of a registry. See this file's own ownPackageDir() doc comment for why
// the same "two levels up from this compiled file" computation is correct across every install mechanism.
function readOwnPackageRoot(): string {
    return path.join(ownPackageDir(), "../..");
}

// Where the compiled cli/client assets live relative to this compiled file (dist/cli/pokie.js) —
// computed once, here, and passed into ClientCommand/DevCommand, since resolving it needs
// import.meta.url (see those commands' own comments on why they don't compute it themselves).
function ownClientRoot(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.join(currentDir, "client");
}

// Same reasoning as ownClientRoot() above, for the separately-built POKIE Studio frontend
// (dist/cli/studio-client) — see StudioCommand's own comment on why studioRoot isn't computed there.
function ownStudioRoot(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.join(currentDir, "studio-client");
}

function run(): Promise<number> {
    const commands = registerCliCommands({
        version: readOwnVersion(),
        pokiePackageRoot: readOwnPackageRoot(),
        clientRoot: ownClientRoot(),
        studioRoot: ownStudioRoot(),
    });
    return dispatch(commands, process.argv);
}

run().then((exitCode) => {
    process.exitCode = exitCode;
});
