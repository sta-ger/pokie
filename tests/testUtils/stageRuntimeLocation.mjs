import {copyFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/** Direct compiler fixtures must stage the same non-TypeScript loader asset as the package build. */
export function stageRuntimeLocation(sourceRoot, outputRoot, trees) {
    for (const tree of trees) {
        const destination = path.join(outputRoot, "dist", tree, "gamepackage/internal");
        mkdirSync(destination, {recursive: true});
        copyFileSync(path.join(sourceRoot, "src/gamepackage/internal/runtimeLocation.mjs"), path.join(destination, "runtimeLocation.mjs"));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const outputRoot = args[0] === "--output-root" ? args.splice(0, 2)[1] : process.cwd();
    stageRuntimeLocation(process.cwd(), outputRoot, args);
}
