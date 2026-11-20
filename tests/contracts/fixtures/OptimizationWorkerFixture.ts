import fs from "fs";
import path from "path";
/** Runs the actual source worker without requiring a packaging/build gate. */
export function writeOptimizationWorkerEntry(directory: string): string {
    const entry = path.join(directory, "worker.cjs");
    fs.writeFileSync(entry, `const fs = require('fs'); const Module = require('module'); const ts = require(${JSON.stringify(require.resolve("typescript"))});
const original = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) { try { return original.call(this, request, ...rest); } catch (error) { if (request.endsWith('.js')) return original.call(this, request.slice(0, -3) + '.ts', ...rest); throw error; } };
Module._extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
require(${JSON.stringify(path.resolve("src/simulation/parallel/internal/simulationWorkerEntry.ts"))});`);
    return entry;
}
