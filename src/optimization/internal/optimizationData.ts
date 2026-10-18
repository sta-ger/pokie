export {pointerParts, at, put, checkPolicyPaths, constraintsHold, assertOnlyTuned, paytablePaths} from "./optimizationModel.js";
import {resolvePokieGameDependencyRoots} from "../../gamepackage/resolvePokieGameEntryModule.js";
import crypto from "crypto";
import {stableSlotMathJson} from "../../wasm/math/SharedSlotMath.js";
import fs from "fs";
import path from "path";
import type {PokieProject} from "../../project/PokieProject.js";

export function digest(value: string | Uint8Array): string {
    return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}
export function jsonHash(value: unknown): string {
    return digest(stableSlotMathJson(value));
}
export function readJson(file: string): unknown {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function writeJson(file: string, value: unknown): void {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
/** Includes every authored byte; dependency installations and Git metadata are not authored input. */
export function inventory(root: string): Record<string, string> {
    const entries: Record<string, string> = {};
    const visit = (file: string, relative: string): void => {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw new Error(`Filesystem alias is not supported: ${file}`);
        if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) {
            if (["node_modules", ".git", ".pokie-runtime-cache"].includes(name)) continue;
            visit(path.join(file, name), relative ? `${relative}/${name}` : name);
        }
        else if (stat.isFile()) entries[relative || path.basename(file)] = digest(fs.readFileSync(file));
        else throw new Error(`Unsupported input file ${file}.`);
    };
    visit(root, "");
    return entries;
}
export function sourceInventory(project: Pick<PokieProject, "type" | "rootPath">): Record<string, string> {
    const result = inventory(project.rootPath);
    if (project.type === "wasm") for (const suffix of [".pokie-wasm.json", ".tuning.json"]) {
        const file = `${project.rootPath}${suffix}`;
        if (fs.existsSync(file)) Object.assign(result, inventory(file));
    }
    return result;
}
export function projectRevision(project: Pick<PokieProject, "type" | "rootPath">): string {
    return jsonHash(sourceInventory(project));
}
export function copyPackage(from: string, to: string): void {
    fs.cpSync(from, to, {
        recursive: true,
        preserveTimestamps: true,
        filter: (file) => !["node_modules", ".git", ".pokie-runtime-cache"].includes(path.basename(file)),
    });
}
export function assertNoFilesystemAliases(file: string): void {
    let current = path.resolve(file);
    for (;;) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Filesystem alias is not supported: ${current}`);
        const parent = path.dirname(current);
        if (parent === current) return;
        current = parent;
    }
}

/** Content and resolution graph of executable dependencies; authored inventory remains separate.
 * Follow physical roots once (including nested/transitive/peer installations), never hash a
 * descriptor in place of installed code. Missing optional roots are part of the identity too.
 */
export async function packageExecutableRevision(packageRoot: string): Promise<string> {
    const identities = new Map<string, number>();
    const graph: {files: Record<string, string>; dependencies: Record<string, number | null>}[] = [];
    const visit = async (root: string): Promise<number> => {
        const known = identities.get(root);
        if (known !== undefined) return known;
        const id = graph.length;
        identities.set(root, id);
        const node = {files: inventory(root), dependencies: {} as Record<string, number | null>};
        graph.push(node);
        const dependencies = await resolvePokieGameDependencyRoots(root, false);
        for (const [name, dependency] of Object.entries(dependencies)) node.dependencies[name] = dependency === null ? null : await visit(dependency);
        return id;
    };
    const roots: Record<string, number | null> = {};
    for (const [name, root] of Object.entries(await resolvePokieGameDependencyRoots(packageRoot))) roots[name] = root === null ? null : await visit(root);
    return jsonHash({roots, graph});
}
