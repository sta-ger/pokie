import fs from 'node:fs';
import {instantiatePokieWasm, SeededPokieWasmHost, collectPokieWasmSimulation, collectPokieWasmReplay, POKIE_WASM_RUNTIME_VERSION, optimizeBrowserBlueprint} from '@fromstan/pokie/wasm';
const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('model.wasm.pokie-wasm.json', 'utf8'));
if (settings.schemaVersion !== 'pokie.playground.v1' || settings.status !== 'completed' || settings.runtimeVersion !== POKIE_WASM_RUNTIME_VERSION || settings.artifact.sha256 !== manifest.artifact.sha256 || settings.artifact.configurationHash !== manifest.artifact.configurationHash) throw new Error('Incompatible settings or artifact identity.');
const runtime = await instantiatePokieWasm(fs.readFileSync('model.wasm'), manifest, new SeededPokieWasmHost(settings.seed));
try {
    const result = {simulation: await collectPokieWasmSimulation(runtime, settings.seed, settings.rounds, {mode: settings.mode, bet: settings.bet})};
    if (settings.mode !== 'all' && settings.rounds <= 1024) result.replay = await collectPokieWasmReplay(runtime, {seed: settings.seed, round: settings.rounds, unit: 'step', initialCredits: settings.initialCredits, modeName: settings.mode, entryCommands: Array.from({length: settings.rounds}, () => ({kind: 'spin', bet: settings.bet}))});
    if (fs.existsSync('replay.json')) {
        const replay = JSON.parse(fs.readFileSync('replay.json', 'utf8'));
        if (replay.artifact.sha256 !== manifest.artifact.sha256) throw new Error('Replay artifact mismatch.');
        result.entryReplay = await runtime.replay(replay.state, replay.commands);
    }
    if (fs.existsSync('optimization.json')) {
        const optimization = JSON.parse(fs.readFileSync('optimization.json', 'utf8'));
        const blueprint = JSON.parse(fs.readFileSync('model.blueprint.json', 'utf8'));
        result.optimization = await optimizeBrowserBlueprint(blueprint, optimization.request, {yieldToHost: () => new Promise(resolve => setTimeout(resolve, 0))});
        if (result.optimization.candidateRevision !== optimization.candidateRevision) throw new Error('Optimization reproduction mismatch.');
    }
    console.log(JSON.stringify(result, null, 2));
} finally { runtime.dispose(); }
