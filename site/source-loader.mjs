// Build-time only: inspect the real TypeScript contracts without building runtime/Studio dist.
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function resolve(specifier, context, next) {
    const entries = {'@fromstan/pokie': 'src/index.ts', '@fromstan/pokie/browser': 'src/browser.ts', '@fromstan/pokie/wasm': 'src/wasm/browser.ts'};
    if (entries[specifier]) return {url: pathToFileURL(path.join(root, entries[specifier])).href, shortCircuit: true};
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
        const candidate = fileURLToPath(new URL(specifier, context.parentURL)).replace(/\.js$/, '.ts');
        if (existsSync(candidate)) return {url: pathToFileURL(candidate).href, shortCircuit: true};
    }
    return next(specifier, context);
}
export async function load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
        return {format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
        }).outputText};
    }
    return next(url, context);
}
