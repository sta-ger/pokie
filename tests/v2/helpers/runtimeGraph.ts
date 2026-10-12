import fs from "node:fs";
import path from "node:path";
import {builtinModules} from "node:module";
import ts from "typescript";

export interface RuntimeGraphOptions {
    readonly portable?: boolean;
    readonly packageRoot?: string;
}

// Inspect emitted edges: syntax-only type dependencies are erased just as in the shipped JS.
export function runtimeEdges(source: string, fileName: string, rejectDynamic = true): string[] {
    const emitted = ts.transpileModule(source, {fileName, compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}}).outputText;
    const tree = ts.createSourceFile(fileName, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edges: string[] = [];
    const original = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    for (const statement of original.statements) {
        if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly && ts.isExternalModuleReference(statement.moduleReference)) {
            const expression = statement.moduleReference.expression;
            if (expression && ts.isStringLiteral(expression)) edges.push(expression.text);
        }
    }
    const visit = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            edges.push(node.moduleSpecifier.text);
        } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require") ||
            (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "require" && node.expression.name.text === "resolve"))) {
            const argument = node.arguments[0];
            if (!argument || !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
                if (rejectDynamic) throw new Error(`Unverifiable runtime dependency in ${fileName}`);
                return;
            }
            edges.push(argument.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(tree);
    return edges;
}

export function inspectRuntimeGraph(entries: readonly string[], options: RuntimeGraphOptions = {}): string[] {
    const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
    const visited = new Set<string>();
    const active: string[] = [];
    const root = options.packageRoot ?? process.cwd();
    const resolveFile = (file: string): string => {
        const candidates = [file.replace(/\.jsx?$/, ".ts"), file.replace(/\.jsx?$/, ".tsx"), file, path.join(file, "index.ts")];
        const found = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!found) throw new Error(`Missing dependency ${[...active, file].join(" -> ")}`);
        return path.resolve(found);
    };
    const visit = (file: string): void => {
        file = resolveFile(file);
        if (active.includes(file)) throw new Error(`Runtime dependency cycle: ${[...active, file].join(" -> ")}`);
        if (visited.has(file)) return;
        active.push(file);
        for (const edge of runtimeEdges(fs.readFileSync(file, "utf8"), file, options.portable === true)) {
            const trace = [...active, edge].join(" -> ");
            if (options.portable && (edge.startsWith("node:") || builtins.has(edge) || (/^@fromstan\/pokie$|^pokie(?:\/|$)/).test(edge))) {
                throw new Error(`Prohibited portable dependency: ${trace}`);
            }
            let next: string | undefined;
            if (edge.startsWith(".")) next = path.resolve(path.dirname(file), edge);
            else if (edge === "@fromstan/pokie") next = path.join(root, "src/index.ts");
            else if (edge === "@fromstan/pokie/browser") next = path.join(root, "src/browser.ts");
            else if (edge === "@fromstan/pokie/wasm") next = path.join(root, "src/wasm/browser.ts");
            else if (edge === "@fromstan/pokie/client/player") next = path.join(root, "cli/client/player/index.ts");
            else if (options.portable) throw new Error(`Unclassified portable dependency: ${trace}`);
            if (next) {
                const resolved = resolveFile(next);
                if (options.portable && (/\/(?:node|server|gamepackage|parallel\/internal)\//).test(resolved)) {
                    throw new Error(`Node adapter in portable graph: ${trace}`);
                }
                if (file.startsWith(path.join(root, "src") + path.sep) && resolved.startsWith(path.join(root, "cli") + path.sep)) {
                    throw new Error(`Runtime depends on CLI: ${trace}`);
                }
                if (!file.includes("/studio-client/") && resolved.includes("/studio-client/")) throw new Error(`Runtime depends on Studio presentation: ${trace}`);
                visit(resolved);
            }
        }
        active.pop();
        visited.add(file);
    };
    entries.forEach(visit);
    return [...visited].sort();
}
