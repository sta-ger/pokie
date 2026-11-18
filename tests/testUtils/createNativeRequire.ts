import type {createRequire} from "node:module";
import {runInThisContext} from "node:vm";

/** Load compiled package fixtures without Jest's source aliases or module registry. */
export function createNativeRequire(filename: string): ReturnType<typeof createRequire> {
    // Jest 30 also wraps process.getBuiltinModule() inside its sandbox. Resolve
    // Node's module loader in the host context to keep package copies independent.
    const nativeModule = runInThisContext('process.getBuiltinModule("module")') as typeof import("node:module");
    return nativeModule.createRequire(filename);
}
