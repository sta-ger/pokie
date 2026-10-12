#!/usr/bin/env node
/** Serial installed consumer. Building/packing/installing POKIE and release gates
 * belong to the controller. No source imports, aliases, mocks or RNG alignment. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile, rm, realpath, readdir, lstat, symlink, cp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const STAKES = [1, 0.01, 0.1, 1.5, 1e-7];
export const CASES = ['fractional', 'missing-symbol', 'missing-count', 'zero', 'positive'];
export const REQUIRED = [...CASES.flatMap(kind => ['cjs', 'ts'].map(format => `${kind}/${format}`)), 'wasm/initial-and-later', 'exact/bundle-and-report'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const tolerance = expected => 32 * Number.EPSILON * Math.max(Math.abs(expected), 1e-7);
export function assertAmount(actual, expected, ledger = false) {
    assert(Number.isFinite(actual));
    if (expected === 0) assert.equal(actual, 0);
    else {
        assert(actual !== 0, `zero cannot satisfy positive expectation ${expected}`);
        assert(Math.abs(actual - expected) <= tolerance(expected), `${ledger ? 'ledger' : 'amount'}: ${actual} != ${expected}`);
    }
}
export function fixture(kind, reachable = false) {
    const symbols = kind === 'fractional' ? ['A', 'A', 'A'] : kind === 'missing-count' ? ['A', 'A', 'A', 'B', 'B'] : ['B', 'B', 'B'];
    const paytable = kind === 'missing-count' ? {A: {5: 10}, B: {5: 2}} : {A: {3: 5}};
    if (kind === 'zero' || kind === 'positive') paytable.B = {3: kind === 'zero' ? 0 : 2};
    return {manifest: {id: `math-${kind}`, name: `Math ${kind}`, version: '1.0.0'}, reels: symbols.length, rows: 1,
        symbols: ['A', 'B'], wilds: [], scatters: [], paylines: [symbols.map(() => 0)],
        reelStrips: symbols.map(symbol => reachable ? ['A', 'B'] : [symbol]), paytable, availableBets: [...STAKES]};
}
export function assertComplete(completed) {
    assert.deepEqual([...completed].sort(), [...REQUIRED].sort(), 'incomplete or duplicate scenario results');
}

/** Await close, including drained stdout/stderr. Abort/timeout kills this owned
 * command; no shell, detached process, retry or fallback installation. */
export async function command(file, args, {cwd, signal, commands, temporaryRoot = cwd, timeoutMs = 60_000}) {
    signal?.throwIfAborted();
    const started = Date.now();
    const record = {file, args, cwd, temporaryRoot, startedAt: new Date(started).toISOString()};
    commands.push(record);
    return new Promise((resolve, reject) => {
        const child = spawn(file, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, NODE_OPTIONS: '', TMPDIR: temporaryRoot}});
        let stdout = '', stderr = '', failure;
        const stop = reason => {failure ??= reason; child.kill('SIGKILL');};
        const abort = () => stop(new Error('Collection cancelled'));
        const timeout = setTimeout(() => stop(new Error('Command timed out')), timeoutMs);
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) abort();
        child.stdout.on('data', bytes => {stdout += bytes; if (stdout.length > 8 * 1024 * 1024) stop(new Error('Command output exceeded limit'));});
        child.stderr.on('data', bytes => {stderr += bytes; if (stderr.length > 8 * 1024 * 1024) stop(new Error('Command output exceeded limit'));});
        child.on('error', error => {failure = error;});
        child.on('close', (exitCode, exitSignal) => {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            Object.assign(record, {exitCode, exitSignal, durationMs: Date.now() - started, stdout, stderr});
            if (failure || exitCode !== 0) reject(failure ?? new Error(`Command exited ${exitCode}: ${file} ${args.join(' ')}\n${stderr}`));
            else resolve(stdout);
        });
    });
}

/** Offline tests inject only the scenario body to test lifecycle failure paths;
 * they are never accepted as installed math evidence. */
export async function collect({output, signal}, body) {
    await mkdir(output); // Fresh evidence only: never overwrite a prior collection.
    const work = path.join(output, 'work');
    await mkdir(work);
    const result = {kind: 'p10-installed-math-repro', status: 'running', startedAt: new Date().toISOString(), commands: [], observations: [], completed: [],
        node: {version: process.version, executable: process.execPath, execArgv: process.execArgv},
        tolerances: {amount: '32 * Number.EPSILON * max(abs(expected), 1e-7)', creditLedger: 'same formula scaled to absolute credits; separate from payout comparison'}};
    const releases = [];
    let failure;
    const cleanupErrors = [];
    try {
        signal?.throwIfAborted();
        await body({work, result, releases, signal, output});
        signal?.throwIfAborted();
        assertComplete(result.completed);
    } catch (error) {failure = error;}
    finally {
        for (const release of releases.reverse()) {
            try {await release();} catch (error) {failure ??= error; cleanupErrors.push(String(error));}
        }
        try {await rm(work, {recursive: true, force: true});} catch (error) {failure ??= error; cleanupErrors.push(String(error));}
        result.status = failure ? 'failed' : 'passed';
        result.error = failure?.stack;
        result.finishedAt = new Date().toISOString();
        result.durationMs = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
        result.resourcesDrained = cleanupErrors.length === 0 && !await lstat(work).catch(() => undefined);
        result.cleanupErrors = cleanupErrors;
        await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    }
    if (failure) throw failure;
    return result;
}

async function files(directory, prefix = '') {
    const list = [];
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) list.push(...await files(path.join(directory, entry.name), relative));
        else {assert(entry.isFile(), `nonregular file: ${relative}`); list.push(relative);}
    }
    return list.sort();
}

async function authenticate(candidate, context, run) {
    for (const name of ['archivePath', 'installationRoot']) assert(path.isAbsolute(candidate[name] ?? ''), `absolute ${name} required`);
    assert(/^[a-f0-9]{40}$/.test(candidate.candidateId));
    assert(/^[a-f0-9]{40}$/.test(candidate.candidateTreeId));
    assert.equal((await run('git', ['rev-parse', `${candidate.candidateId}^{tree}`], process.cwd())).trim(), candidate.candidateTreeId);
    assert(['npm run build', 'prepack:npm run build'].includes(candidate.buildCommand), 'normal build identity required');
    assert(['npm pack', 'npm pack --ignore-scripts'].includes(candidate.packCommand));
    assert.equal(candidate.installCommand, 'npm install <archive>');
    const bytes = await readFile(candidate.archivePath);
    assert.equal(digest(bytes), candidate.archiveSha256);
    const snapshot = path.join(context.work, 'candidate.tgz');
    await writeFile(snapshot, bytes);
    const names = (await run('tar', ['-tzf', snapshot])).trim().split('\n');
    const types = (await run('tar', ['-tvzf', snapshot])).trim().split('\n');
    assert(names.every(name => name.startsWith('package/') && !name.split('/').includes('..')));
    assert.equal(new Set(names).size, names.length);
    assert(types.every(entry => ['-', 'd'].includes(entry[0])));
    await run('tar', ['-xzf', snapshot, '-C', context.work, '--no-same-owner']);
    const packed = path.join(context.work, 'package');
    const packageRoot = await realpath(path.join(candidate.installationRoot, 'node_modules/pokie'));
    assert.equal(packageRoot, path.join(await realpath(candidate.installationRoot), 'node_modules/pokie'), 'borrowed runtime installation');
    for (const relative of await files(packed)) {
        const installed = path.join(packageRoot, relative);
        assert.equal(await realpath(installed), installed);
        assert.equal(digest(await readFile(installed)), digest(await readFile(path.join(packed, relative))), `installed bytes differ: ${relative}`);
    }
    assert.deepEqual(await files(path.join(packageRoot, 'dist')), await files(path.join(packed, 'dist')));
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json')));
    assert.equal(manifest.name, 'pokie');
    assert.equal(manifest.version, candidate.packageVersion);
    if (manifest.gitHead !== undefined) assert.equal(manifest.gitHead, candidate.candidateId);
    const resolver = createRequire(path.join(candidate.installationRoot, 'package.json'));
    const cjs = resolver.resolve('pokie');
    // Native ESM resolution is anchored at the installation, not this script.
    const resolutions = JSON.parse(await run(process.execPath, ['--input-type=module', '-e',
        "console.log(JSON.stringify(Object.fromEntries(['pokie','pokie/wasm'].map(n => [n,import.meta.resolve(n)]))))"], candidate.installationRoot));
    assert.equal(cjs, path.join(packageRoot, 'dist/cjs/index.js'));
    assert.equal(resolutions.pokie, pathToFileURL(path.join(packageRoot, 'dist/esm/index.js')).href);
    assert.equal(resolutions['pokie/wasm'], pathToFileURL(path.join(packageRoot, 'dist/esm/wasm/browser.js')).href);
    const api = resolver('pokie');
    const esm = await import(resolutions.pokie);
    assert.equal(typeof esm.GamePackageGenerator, 'function');
    const wasm = await import(resolutions['pokie/wasm']);
    assert.equal(typeof wasm.instantiatePokieWasm, 'function');
    const bin = await realpath(path.join(candidate.installationRoot, 'node_modules/.bin/pokie'));
    assert.equal(bin, path.join(packageRoot, manifest.bin.pokie));
    Object.assign(context.result, {candidate, packageRoot, resolutions: {...resolutions, require: cjs, bin}, packageName: manifest.name});
    return {api, bin, packageRoot, cjs};
}

function checkSession(game, model, session, stake, expectedScreen, expectedWin) {
    assert.deepEqual(session.getAvailableBets(), model.availableBets);
    assert.equal(session.getBet(), stake);
    const screen = session.getSymbolsCombination().toMatrix();
    assert.deepEqual(screen, expectedScreen);
    assertAmount(session.getWinAmount(), expectedWin);
    const expectedMap = Object.fromEntries(model.availableBets.map(bet => [String(bet), Object.fromEntries(Object.entries(model.paytable).map(([symbol, counts]) =>
        [symbol, Object.fromEntries(Object.entries(counts).map(([count, multiplier]) => [count, multiplier * bet]))]))]));
    assert.deepEqual(session.getPaytable().toMap(), expectedMap); // exact sparse keys and amounts
    const data = game.getSessionSerializer().getRoundData(session);
    assert.deepEqual(data.reelsSymbols, screen);
    assert.equal(data.bet, stake);
    assertAmount(data.totalWin, expectedWin);
    const wins = Object.values(data.winningLines ?? {});
    assert.equal(wins.length, expectedWin > 0 ? 1 : 0);
    assert.equal(session.getWinEvaluationResult().getWinComponents().length, expectedWin > 0 ? 1 : 0);
    for (const win of wins) {assert.equal(win.symbolId, screen[0][0]); assertAmount(win.winAmount, expectedWin);}
    return data;
}

export async function installedScenarios(candidate, compiler, context) {
    const {work, result, releases, signal, output} = context;
    result.candidate = candidate;
    const run = (file, args, cwd = work) => command(file, args, {cwd, signal, commands: result.commands, temporaryRoot: work});
    const {api, bin, packageRoot, cjs} = await authenticate(candidate, context, run);
    assert(path.isAbsolute(compiler));
    const compilerPath = await realpath(compiler);
    const compilerRoot = path.resolve(path.dirname(compilerPath), '..');
    const compilerManifest = JSON.parse(await readFile(path.join(compilerRoot, 'package.json')));
    assert.equal(compilerManifest.name, 'typescript');
    result.compiler = {path: compilerPath, version: compilerManifest.version, sha256: digest(await readFile(compilerPath)), identity: (await run(process.execPath, [compilerPath, '--version'])).trim()};
    await mkdir(path.join(output, 'fixtures'));
    const attach = async directory => {
        await mkdir(path.join(directory, 'node_modules'), {recursive: true});
        await symlink(packageRoot, path.join(directory, 'node_modules/pokie'), 'dir');
        await symlink(path.join(compilerRoot, '..', '@types'), path.join(directory, 'node_modules/@types'), 'dir');
        assert.equal(createRequire(path.join(directory, 'package.json')).resolve('pokie'), cjs);
    };
    for (const kind of CASES) {
        signal?.throwIfAborted();
        const model = fixture(kind);
        await writeFile(path.join(output, 'fixtures', `${kind}.json`), JSON.stringify(model, null, 2));
        const directory = path.join(work, kind);
        new api.GamePackageGenerator(candidate.packageVersion).generate(model, work, directory, undefined, {signal});
        await attach(directory);
        const declaration = JSON.parse(await readFile(path.join(directory, 'package.json')));
        assert.equal(declaration.main, './dist/index.js');
        assert.equal(declaration.exports, declaration.main);
        assert.equal(declaration.pokie.entry, declaration.main);
        result.observations.push({kind, packageEntrypoints: {main: declaration.main, exports: declaration.exports, pokie: declaration.pokie}, sourceSha256: digest(await readFile(path.join(directory, 'src/index.ts')))});
        const outputHashes = [];
        for (const format of ['cjs', 'ts']) {
            if (format === 'ts') {
                await rm(path.join(directory, 'dist'), {recursive: true});
                await run(process.execPath, [compilerPath, '--project', path.join(directory, 'tsconfig.json')], directory);
            }
            outputHashes.push(digest(await readFile(path.join(directory, declaration.main))));
            const loaded = await api.loadPokieGameRuntime(directory);
            releases.push(loaded.release);
            try {
                for (const stake of STAKES) {
                    const session = loaded.game.createSession({seed: '0'});
                    assert(session instanceof api.VideoSlotSession, 'game resolved a different POKIE runtime');
                    session.setBet(stake);
                    const before = session.getCreditsAmount();
                    session.play();
                    const expectedWin = (kind === 'fractional' ? 5 : kind === 'positive' ? 2 : 0) * stake;
                    const observation = {id: `${kind}/${format}`, stake, expectedWin, actualWin: session.getWinAmount(), creditsBefore: before,
                        ...loaded.game.getSessionSerializer().getRoundData(session), paytable: session.getPaytable().toMap(), state: session.toSessionState()};
                    result.observations.push(observation);
                    checkSession(loaded.game, model, session, stake, model.reelStrips.map(strip => [strip[0]]), expectedWin);
                    assertAmount(session.getCreditsAmount(), before - stake + expectedWin, true);
                    observation.verified = true;
                }
            } finally {await releases.pop()();}
            result.completed.push(`${kind}/${format}`);
        }
        assert.notEqual(outputHashes[0], outputHashes[1], 'compiled TS output was not independently emitted');
        result.observations.push({kind, outputHashes});
    }

    // Validated routes keep reachability: one reachable, sparse, supported line model.
    const model = fixture('fractional', true);
    const source = path.join(work, 'reachable.json');
    await writeFile(source, JSON.stringify(model));
    await cp(source, path.join(output, 'fixtures/reachable.json'));
    const nodePackage = path.join(work, 'reachable-package');
    const artifact = path.join(work, 'reachable.wasm');
    await run(process.execPath, [bin, 'build', source, '--target', 'tsPackage', '--out', nodePackage], candidate.installationRoot);
    await run(process.execPath, [bin, 'build', source, '--target', 'wasm', '--out', artifact], candidate.installationRoot);
    for (const file of await readdir(work)) {
        if (file.startsWith('reachable.wasm')) await cp(path.join(work, file), path.join(output, file));
    }
    assert.equal(createRequire(path.join(nodePackage, 'package.json')).resolve('pokie'), cjs);
    const loaded = await api.loadPokieGameRuntime(nodePackage);
    releases.push(loaded.release);
    const fresh = async () => {
        const runtime = await api.loadPokieWasmFileRuntime(artifact, new api.SeededPokieWasmHost('0'));
        releases.push(() => runtime.dispose());
        return runtime;
    };
    const runtime = await fresh();
    const wasmSession = runtime.createSession('0');
    const node = loaded.game.createSession({seed: '0'});
    assert(node instanceof api.VideoSlotSession);
    const capture = () => json({state: node.toSessionState(), credits: node.getCreditsAmount(), bet: node.getBet(), network: loaded.game.getSessionSerializer().getInitialData(node)});
    const checkpoints = [{offset: 0, node: capture(), wasm: json(wasmSession.serialize())}];
    assert.deepEqual(checkpoints[0].node.state.rngState, checkpoints[0].wasm.rngState);
    const rounds = [];
    const commands = Array.from({length: 10}, (_, i) => ({bet: STAKES[i % STAKES.length]}));
    for (const [index, cmd] of commands.entries()) {
        node.setBet(cmd.bet);
        const before = node.getCreditsAmount();
        node.play();
        const round = await wasmSession.play(cmd);
        const screen = node.getSymbolsCombination().toMatrix();
        const expectedWin = screen.every(reel => reel[0] === 'A') ? 5 * cmd.bet : 0;
        checkSession(loaded.game, model, node, cmd.bet, round.screen, expectedWin);
        assert.equal(round.stake, cmd.bet);
        assertAmount(round.payout, expectedWin);
        assertAmount(round.creditsBefore, before, true);
        assertAmount(round.credits, before - cmd.bet + expectedWin, true);
        assertAmount(round.credits, node.getCreditsAmount(), true);
        assert.deepEqual(wasmSession.serialize().rngState, node.toSessionState().rngState);
        rounds.push({...round, expectedWin, rngState: node.toSessionState().rngState});
        if (index === 3) checkpoints.push({offset: 4, node: capture(), wasm: json(wasmSession.serialize())});
    }
    for (const checkpoint of checkpoints) {
        const restoredRuntime = await fresh();
        const restored = restoredRuntime.restoreSession(checkpoint.wasm);
        const freshNodeRuntime = await api.loadPokieGameRuntime(nodePackage);
        releases.push(freshNodeRuntime.release);
        const restoredNode = freshNodeRuntime.game.createSession({seed: '0'});
        restoredNode.fromSessionState(checkpoint.node.state);
        restoredNode.setCreditsAmount(checkpoint.node.credits);
        restoredNode.setBet(checkpoint.node.bet);
        for (let i = checkpoint.offset; i < commands.length; i++) {
            restoredNode.setBet(commands[i].bet);
            restoredNode.play();
            const round = await restored.play(commands[i]);
            const {expectedWin, rngState, ...expected} = rounds[i];
            assert.deepEqual(round, expected);
            checkSession(loaded.game, model, restoredNode, commands[i].bet, expected.screen, expectedWin);
            assertAmount(restoredNode.getCreditsAmount(), expected.credits, true);
            assert.deepEqual(restoredNode.toSessionState().rngState, rngState);
        }
        assert.deepEqual(restored.serialize(), wasmSession.serialize());
        const replayRuntime = await fresh();
        const replay = await replayRuntime.replay(checkpoint.wasm, commands.slice(checkpoint.offset));
        assert.deepEqual(replay.rounds, rounds.slice(checkpoint.offset).map(({expectedWin, rngState, ...round}) => round));
        assert.deepEqual(replay.stateAfter, wasmSession.serialize());
    }
    await writeFile(path.join(output, 'wasm-parity.json'), JSON.stringify({checkpoints, rounds, finalState: wasmSession.serialize()}, null, 2));
    result.observations.push({id: 'wasm/initial-and-later', checkpoints, rounds});
    result.completed.push('wasm/initial-and-later');

    // Fresh exact bundle from the installed generated game's runtime, canonical CLI.
    const bundle = path.join(work, 'exact-library');
    await run(process.execPath, [bin, 'build', nodePackage, '--target', 'outcomeLibrary', '--exact', '--out', bundle], candidate.installationRoot);
    await cp(bundle, path.join(output, 'exact-library'), {recursive: true});
    const reader = new api.OutcomeLibraryBundleReader();
    const manifest = await reader.readManifest(bundle);
    assert.deepEqual(manifest.game, loaded.game.getManifest());
    assert.equal(manifest.configHash, loaded.game.getConfigHash());
    assert.equal(manifest.artifactPokieVersion, candidate.packageVersion);
    assert.equal(manifest.modes.length, 1);
    const mode = manifest.modes[0];
    assert.equal(mode.outcomeCount, 8);
    assert.equal(mode.totalWeight, 8);
    const outcomes = [];
    let totalWin = 0;
    for await (const outcome of reader.iterateModeOutcomes(bundle, mode.modeName)) {
        const {artifact: a, weight} = outcome;
        assert.deepEqual(a.provenance.game, manifest.game);
        assert.equal(a.provenance.configHash, manifest.configHash);
        assert.equal(a.provenance.pokieVersion, candidate.packageVersion);
        assert.equal(weight, 1);
        assert.equal(a.stake, STAKES[0]); // Runtime-selected default, never metadata override.
        const expectedWin = a.screen.every(reel => reel[0] === 'A') ? 5 * a.stake : 0;
        assertAmount(a.totalWin, expectedWin);
        assertAmount(a.payoutMultiplier, expectedWin / a.stake);
        assert.equal(a.wins.length, expectedWin > 0 ? 1 : 0);
        assert.deepEqual(a.steps.flatMap(step => step.wins), a.wins);
        assert.equal(a.steps.length, 1);
        assert.deepEqual(a.steps[0].screen, a.screen);
        assertAmount(a.steps[0].totalWin, expectedWin);
        assert.deepEqual(a.featureEvents ?? [], []);
        assert.deepEqual(a.steps[0].featureEvents ?? [], []);
        for (const win of a.wins) {assert.equal(win.symbolId, 'A'); assertAmount(win.winAmount, expectedWin);}
        totalWin += weight * a.totalWin;
        outcomes.push(outcome);
    }
    assert.equal(outcomes.length, 8);
    assert.deepEqual(outcomes.map(o => o.artifact.screen.map(r => r[0]).join('')).sort(), ['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB']);
    assertAmount(totalWin, 5 * mode.stake);
    assertAmount(mode.analysis.rtp, 5 / 8);
    assertAmount(mode.analysis.hitFrequency, 1 / 8);
    const reportPath = path.join(output, 'report.json');
    await run(process.execPath, [bin, 'report', bundle, '--format', 'json', '--out', reportPath], candidate.installationRoot);
    const report = JSON.parse(await readFile(reportPath));
    assert(!report.issues.some(issue => issue.severity === 'error'));
    assert.equal(report.modes.length, 1);
    assertAmount(report.modes[0].analysis.rtp, 5 / 8);
    assertAmount(report.modes[0].analysis.hitFrequency, 1 / 8);
    assert.equal(report.modes[0].analysis.totalWeight, 8);
    result.observations.push({id: 'exact/bundle-and-report', expectedTotalWin: 5 * mode.stake, actualTotalWin: totalWin, manifest, report});
    result.completed.push('exact/bundle-and-report');
}

export async function main(argv = process.argv.slice(2)) {
    const options = {};
    for (let i = 0; i < argv.length; i += 2) {
        assert(['--candidate', '--compiler', '--output'].includes(argv[i]) && argv[i + 1] && !options[argv[i]], 'Usage: --candidate <controller-json> --compiler <absolute-tsc.js> --output <fresh-directory>');
        options[argv[i]] = argv[i + 1];
    }
    for (const name of ['--candidate', '--compiler', '--output']) assert(path.isAbsolute(options[name] ?? ''), `${name} must be absolute`);
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
        const candidate = JSON.parse(await readFile(options['--candidate']));
        return await collect({output: options['--output'], signal: controller.signal}, context => installedScenarios(candidate, options['--compiler'], context));
    } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {console.error(error.stack); process.exitCode = 1;});
}
