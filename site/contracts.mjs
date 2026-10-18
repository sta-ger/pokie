import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {GameBlueprintValidator} from '../src/generated/GameBlueprintValidator.ts';
import {validateOptimizationRequest} from '../src/optimization/validateOptimizationRequest.ts';
import {registerCliCommands} from '../cli/registerCliCommands.ts';

const inventory = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const example of inventory.examples) {
    const value = fs.readFileSync(example.source, 'utf8');
    if (example.kind === 'blueprint') {
        const errors = new GameBlueprintValidator().validate(JSON.parse(value)).filter(issue => issue.severity === 'error');
        if (errors.length) throw new Error(`Invalid Blueprint example ${example.source}: ${JSON.stringify(errors)}`);
    } else if (example.kind === 'policy') validateOptimizationRequest(JSON.parse(value));
    else if (example.kind !== 'typescript') throw new Error(`Unknown example kind: ${example.kind}`);
}
const config = ts.readConfigFile('tsconfig.typecheck.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(inventory.examples.filter(example => example.kind === 'typescript').map(example => example.source), parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => '\n',
}));
function commandTree(command) {
    return {name: command.name(), help: command.helpInformation(), children: command.commands.map(commandTree)};
}
const commands = registerCliCommands({version: metadata.version, pokiePackageRoot: process.cwd(), clientRoot: '', studioRoot: ''})
    .filter(command => !command.getName().startsWith('__')).map(command => commandTree(command.getCommanderCommand()));
process.stdout.write(JSON.stringify({commands, exports: metadata.exports, examples: inventory.examples.map(example => path.basename(example.source))}));
