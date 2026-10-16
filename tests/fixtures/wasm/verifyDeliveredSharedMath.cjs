// Native consumer: no ts-jest resolver, source imports, rewinds or evaluator replacements.
// Invoked by WasmSharedMath.test.ts using the existing fresh-public-runtime compiler helper.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const crypto = require('node:crypto');
const directory = process.argv[2];
const nativeRequire = createRequire(path.join(directory, 'consumer.cjs'));
const pokie = nativeRequire('@fromstan/pokie');
const hash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const stakes = [0.05, 7.5, 1e-7];
const inventory = ['A', 'B', 'W', 'S'];
const base = {manifest: {id: 'shared-math', name: 'Shared math', version: '1.0.0'}, reels: 3, rows: 3, symbols: inventory,
    wilds: ['W'], scatters: ['S'], availableBets: stakes,
    reelStrips: [['A', 'W', 'S', 'B', 'A'], ['A', 'B', 'W', 'S', 'A', 'B', 'A'], ['W', 'A', 'S']],
    paytable: {A: {2: 0, 3: 0.3, 4: 0.7, 5: 1.1, 6: 1.3, 7: 1.7, 8: 1.9, 9: 2.3}, B: {2: 0.1, 3: 0.7, 4: 1.1, 5: 1.3, 6: 1.7, 7: 1.9, 8: 2.3, 9: 2.9}, S: {2: 0, 3: 1.1, 4: 1.9}}};
const fixtures = [];
for (const type of ['lines', 'ways', 'clusters']) {
    for (const variant of ['mixed', 'all-wild', 'multi', 'missing', 'missing-symbol', 'zero', 'scatter', 'scatter-zero', 'scatter-missing']) {
        const model = {...base, winModel: {type, ...(type === 'clusters' ? {minimumClusterSize: 2} : {})}};
        if (variant === 'all-wild') model.reelStrips = [['W'], ['W'], ['W']];
        if (variant === 'multi') model.reelStrips = [['A', 'B', 'S'], ['A', 'B', 'S'], ['A', 'B', 'S']];
        if (variant === 'missing') {model.reelStrips = [['A'], ['A'], ['A']]; model.paytable = {A: {2: 100}, S: {3: 100}};}
        if (variant === 'zero') {model.reelStrips = [['A'], ['A'], ['A']]; model.paytable = {A: {2: 100, 3: 0, 9: 0}};}
        if (variant === 'missing-symbol') {model.reelStrips = [['A'], ['A'], ['A']]; model.paytable = {};}
        if (variant.startsWith('scatter')) {
            model.reelStrips = [['S'], ['S'], ['S']];
            model.paytable = {S: variant === 'scatter' ? {9: 1.1} : variant === 'scatter-zero' ? {9: 0} : {2: 100}};
        }
        fixtures.push({name: `${type}-${variant}`, model});
    }
}
fixtures.push({name: 'explicit-lines-circular', model: {...base, paylines: [[2, 1, 0], [0, 2, 1], [1, 0, 2]]}});
fixtures.push({name: 'cluster-min-five', model: {...base, winModel: {type: 'clusters', minimumClusterSize: 5}}});
fixtures.push({name: 'scatter-order', model: {...base, symbols: ['A', 'S', 'T'], scatters: ['T', 'S'], wilds: [], reelStrips: [['A', 'S', 'T'], ['A', 'S', 'T'], ['A', 'S', 'T']], paytable: {A: {3: 0.7}, S: {3: 0.1}, T: {3: 0.3}}}});
fixtures.push({name: 'default-bets', model: {...base, availableBets: undefined}});
// A de Bruijn prefix plus an unused terminal symbol gives unique circular
// two-cell windows. A Node screen therefore identifies one exact stop, even
// when the total exceeds 32 bits; repeated-symbol strips cannot mask truncation.
const stopSymbols = Array.from({length: 128}, (_, i) => `X${i}`);
const pairs = [];
for (let a = 0; a < 127; a++) {
    pairs.push(a);
    for (let b = a + 1; b < 127; b++) pairs.push(a, b);
}
for (const lengths of [[1024, 1024, 1024], [1025, 1024, 1024], [1025, 1025, 1025, 5]]) {
    const reelStrips = lengths.map((length, reel) => [...pairs.slice(0, length - 1).map(i => stopSymbols[(i + reel) % 127]), stopSymbols[127]]);
    for (const strip of reelStrips) assert.equal(new Set(strip.map((symbol, i) => `${symbol}/${strip[(i + 1) % strip.length]}`)).size, strip.length);
    fixtures.push({name: `stops-${lengths.join('-')}`, model: {...base, reels: lengths.length, rows: 2, symbols: stopSymbols, wilds: [], scatters: [], reelStrips,
        paytable: {X0: {2: 0, 3: 0.3, 4: 0.7}, X1: {2: 0.1, 3: 0.7, 4: 1.1}}}});
}
for (const fixture of fixtures) {
    if (fixture.model.winModel?.type !== 'clusters') fixture.model.paytable = Object.fromEntries(Object.entries(fixture.model.paytable).map(([symbol, entries]) => [symbol,
        Object.fromEntries(Object.entries(entries).filter(([count]) => fixture.model.scatters?.includes(symbol) || Number(count) <= fixture.model.reels))]));
}
function referenceConfig(model) {
    const config = new pokie.VideoSlotConfig();
    config.setAvailableBets(model.availableBets ?? [...pokie.SHARED_SLOT_DEFAULT_BETS]);
    config.setReelsNumber(model.reels); config.setReelsSymbolsNumber(model.rows);
    config.setWildSymbols(model.wilds ?? []); config.setScatterSymbols(model.scatters ?? []); config.setAvailableSymbols(model.symbols);
    config.setSymbolsSequences(model.reelStrips.map(strip => new pokie.SymbolsSequence().fromArray(strip)));
    const paytable = new pokie.Paytable(config.getAvailableBets());
    for (const [symbol, entries] of Object.entries(model.paytable)) for (const [count, amount] of Object.entries(entries)) paytable.setPayoutForSymbol(symbol, Number(count), amount);
    config.setPaytable(paytable);
    if (model.paylines) {
        const lines = new pokie.CustomLinesDefinitions();
        model.paylines.forEach((line, i) => lines.setLineDefinition(String(i), line)); config.setLinesDefinitions(lines);
    }
    return config;
}
function referenceCalculator(model) {
    const config = referenceConfig(model);
    if (model.winModel?.type === 'ways') return new pokie.VideoSlotWinCalculator(config, undefined, undefined, undefined, undefined, new pokie.WaysWinCalculator(config), {aggregationPolicy: new pokie.SelectedEvaluatorGroupWinAggregationPolicy('ways')});
    if (model.winModel?.type === 'clusters') return new pokie.VideoSlotWinCalculator(config, undefined, undefined, new pokie.ClusterWinCalculator(config, model.winModel.minimumClusterSize ?? 5), undefined, undefined, {minimumClusterSize: model.winModel.minimumClusterSize ?? 5, aggregationPolicy: new pokie.SelectedEvaluatorGroupWinAggregationPolicy('cluster')});
    return new pokie.VideoSlotWinCalculator(config);
}
async function main() {
    // Resolve actual ESM/CJS and browser-safe exports with native Node conditions.
    const packageRoot = path.dirname(nativeRequire.resolve('@fromstan/pokie')).replace(/[/\\]dist[/\\]cjs$/, '');
    const esm = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/index.js')).href);
    const browser = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/browser.js')).href);
    const portable = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/wasm/browser.js')).href);
    for (const exports of [pokie, esm, browser, portable]) assert.equal(typeof exports.SharedSlotMath, 'function');
    const receipts = [];
    const negatives = [];
    const configurationChecks = [];
    // The same invalid models must keep Node diagnostics and fail portable preflight/loading.
    for (const kind of ['clusters', 'explicit-clusters', 'ways']) {
        const ways = kind === 'ways';
        const invalid = {manifest: {id: `invalid-${kind}`, name: 'Evaluator validation', version: '1.0.0'},
            reels: 3, rows: 1, symbols: ways ? ['W', 'S'] : ['A'],
            reelStrips: Array.from({length: 3}, () => ways ? ['W', 'S'] : ['A']),
            paytable: ways ? {W: {3: 2}, S: {3: 2}} : {A: {3: 2}}, wilds: ways ? ['W'] : [], scatters: ways ? ['S'] : [],
            winModel: ways ? {type: 'ways'} : {type: 'clusters', ...(kind === 'explicit-clusters' ? {minimumClusterSize: 4} : {})}};
        const corrected = {...invalid, symbols: ['A', ...(ways ? ['W', 'S'] : [])], reelStrips: [['A'], ['A'], ['A']], paytable: {A: {3: 2}},
            winModel: ways ? {type: 'ways'} : {type: 'clusters', minimumClusterSize: 3}};
        const code = ways ? 'ways-no-payable-symbols' : 'cluster-grid-too-small';
        const diagnostic = ways ? /no payable non-wild non-scatter symbols/ : new RegExp(`requires at least ${kind === 'clusters' ? 5 : 4} cells`);
        const folder = path.join(directory, `invalid-${kind}`); fs.mkdirSync(folder);
        const source = path.join(folder, 'game.blueprint.json'), artifact = path.join(folder, 'game.wasm');
        fs.writeFileSync(source, JSON.stringify(invalid));
        const sourceBytes = fs.readFileSync(source);
        const project = {type: 'blueprint', rootPath: source, capabilities: pokie.PROJECT_TYPE_CAPABILITIES.blueprint, provenance: 'native validation regression'};
        const builder = new pokie.WasmArtifactBuilder('1.3.0');
        const model = pokie.resolveSharedSlotMathModel(invalid);
        for (const exports of [pokie, esm, browser, portable]) assert.throws(() => exports.assertPlayableSharedSlotMathModel(model), diagnostic);
        assert.throws(() => pokie.resolveCanonicalWasmGameModel(invalid), new RegExp(code));
        await assert.rejects(builder.validate(project), diagnostic);
        await assert.rejects(builder.build(project, artifact), diagnostic);
        assert.deepEqual(fs.readFileSync(source), sourceBytes);
        assert.equal(fs.existsSync(artifact), false); assert.equal(fs.existsSync(`${artifact}.pokie-wasm.json`), false);
        const generated = new pokie.GamePackageGenerator('1.3.0').generate(invalid, folder);
        const ts = nativeRequire('typescript'), recompiled = path.join(generated.projectRoot, 'dist/recompiled.cjs');
        fs.writeFileSync(recompiled, ts.transpileModule(fs.readFileSync(path.join(generated.projectRoot, 'src/index.ts'), 'utf8'),
            {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText);
        for (const entry of [path.join(generated.projectRoot, 'dist/index.js'), recompiled]) {
            const game = nativeRequire(entry);
            const sessions = () => [game.createSession({seed: '0'}), game.createExactEnumerationSession({
                generateSymbolsCombination: () => new pokie.SymbolsCombination().fromMatrix(invalid.reelStrips.map(strip => [strip[0]])),
            })];
            for (const session of sessions()) assert.throws(() => session.play(), diagnostic);
            Object.assign(game.getModelDescriptor().model, corrected);
            // New sessions use the corrected declarations in both factories, without a separate model.
            const exact = game.createExactEnumerationSession({generateSymbolsCombination: () => new pokie.SymbolsCombination().fromMatrix([['A'], ['A'], ['A']])});
            for (const session of [game.createSession({seed: '0'}), exact]) for (let round = 0; round < 2; round++) {
                session.play(); assert.equal(session.getWinAmount(), 2);
            }
        }
        // Compile a fully consistent rejected model independently of the publisher.
        const configurationHash = hash(new TextEncoder().encode(pokie.stableSlotMathJson(model)));
        const descriptor = {schemaVersion: '1.0.0', component: {id: invalid.manifest.id, version: '1.0.0'},
            serialization: {session: 'pokie.session.v2', play: 'pokie.play.v2', state: 'pokie.state.v3'}, host: {rng: 'pokie.rng.v2', services: []},
            capabilities: ['runtime.play', 'runtime.serialize', 'runtime.replay'],
            artifact: {format: 'pokie.wasm.v1', abiVersion: '2.0.0', adapter: '@fromstan/pokie/wasm', configurationHash}};
        const binary = pokie.compileSharedSlotArtifact(model, descriptor);
        const sidecar = {...descriptor, artifact: {...descriptor.artifact, bytes: binary.length, sha256: hash(binary)}};
        assert.equal(WebAssembly.validate(binary), true);
        let draws = 0; const host = {nextRandom() {draws++; return 0.5;}};
        for (const exports of [pokie, esm, browser, portable]) await assert.rejects(exports.instantiatePokieWasm(binary, sidecar, host), diagnostic);
        const worker = new pokie.PokieWasmWorkerProtocol();
        const rejected = await worker.handle({id: kind, type: 'instantiate', bytes: binary, manifest: sidecar});
        assert.equal(rejected.ok, false); assert.match(rejected.error, diagnostic);
        fs.writeFileSync(artifact, binary); fs.writeFileSync(`${artifact}.pokie-wasm.json`, JSON.stringify(sidecar));
        await assert.rejects(pokie.loadPokieWasmFileRuntime(artifact, host), diagnostic);
        await assert.rejects(new pokie.ProjectTargetResolver().resolve(artifact), diagnostic);
        await assert.rejects(pokie.readWasmComponentManifest({type: 'wasm', rootPath: artifact, capabilities: pokie.PROJECT_TYPE_CAPABILITIES.wasm, provenance: 'direct readback'}), diagnostic);
        assert.deepEqual(fs.readFileSync(artifact), Buffer.from(binary));
        assert.deepEqual(JSON.parse(fs.readFileSync(`${artifact}.pokie-wasm.json`)), sidecar);
        assert.equal(draws, 0);
        fs.rmSync(artifact); fs.rmSync(`${artifact}.pokie-wasm.json`);
        fs.writeFileSync(source, JSON.stringify(corrected));
        await builder.validate(project); await builder.build(project, artifact);
        const runtime = await pokie.loadPokieWasmFileRuntime(artifact, host);
        const session = runtime.createSession('0');
        for (const sequence of [1, 2]) assert.deepEqual([ (await session.play()).sequence, session.serialize().credits ], [sequence, 1000 + sequence]);
        runtime.dispose();
        negatives.push(code + (kind === 'explicit-clusters' ? '-explicit' : ''));
    }
    for (const type of ['lines', 'ways', 'clusters']) {
        const folder = path.join(directory, `config-${type}`); fs.mkdirSync(folder);
        const model = {...base, rows: 1, availableBets: [1], reelStrips: [['A'], ['A'], ['A']], paytable: {A: {3: 2}},
            winModel: {type, ...(type === 'clusters' ? {minimumClusterSize: 3} : {})}};
        const generated = new pokie.GamePackageGenerator('1.3.0').generate(model, folder);
        const ts = nativeRequire('typescript');
        const compiledPath = path.join(generated.projectRoot, 'dist', 'recompiled.cjs');
        fs.writeFileSync(compiledPath, ts.transpileModule(fs.readFileSync(path.join(generated.projectRoot, 'src/index.ts'), 'utf8'),
            {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText);
        for (const entry of [path.join(generated.projectRoot, 'dist', 'index.js'), compiledPath]) {
            const game = nativeRequire(entry);
            const sessions = () => [game.createSession({seed: '0'}), game.createExactEnumerationSession({
                generateSymbolsCombination: () => new pokie.SymbolsCombination().fromMatrix([['A'], ['A'], ['A']]),
            })];
            for (const session of sessions()) {
                session.play(); assert.equal(session.getWinAmount(), 2);
                session.getPaytable().setPayoutForSymbol('A', 3, 9);
                session.play(); assert.equal(session.getWinAmount(), 9);
                assert.equal(session.getPaytable().getWinAmountForSymbol('A', 3, 1), 9);
            }
            const before = game.getConfigHash();
            const blueprint = game.getModelDescriptor().model;
            blueprint.paytable.A[3] = 7;
            assert.notEqual(game.getConfigHash(), before);
            assert.equal(game.getConfigHash(), pokie.computeGameBlueprintHash(blueprint));
            for (const session of sessions()) {
                session.play(); assert.equal(session.getWinAmount(), 7);
                assert.equal(session.getPaytable().getWinAmountForSymbol('A', 3, 1), 7);
            }
        }
        configurationChecks.push(type);
    }
    for (const {name, model} of fixtures) {
        const folder = path.join(directory, name); fs.mkdirSync(folder);
        const source = path.join(folder, 'game.blueprint.json'), artifact = path.join(folder, 'game.wasm');
        fs.writeFileSync(source, JSON.stringify(model));
        const generated = new pokie.GamePackageGenerator('1.3.0').generate(model, folder);
        const project = {type: 'blueprint', rootPath: source, capabilities: pokie.PROJECT_TYPE_CAPABILITIES.blueprint, provenance: 'native acceptance'};
        await new pokie.WasmArtifactBuilder('1.3.0').build(project, artifact);
        const bytes = new Uint8Array(fs.readFileSync(artifact));
        const manifest = JSON.parse(fs.readFileSync(`${artifact}.pokie-wasm.json`, 'utf8'));
        assert.equal(hash(bytes), manifest.artifact.sha256);
        const loaded = await pokie.loadPokieGameRuntime(generated.projectRoot);
        const ts = nativeRequire('typescript');
        const sourceEntry = path.join(generated.projectRoot, 'dist', 'recompiled.cjs');
        fs.writeFileSync(sourceEntry, ts.transpileModule(fs.readFileSync(path.join(generated.projectRoot, 'src/index.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText);
        const recompiled = nativeRequire(sourceEntry).createSession({seed: '0'});
        const reference = referenceCalculator(model);
        const runtime = await pokie.loadPokieWasmFileRuntime(artifact, new pokie.SeededPokieWasmHost('wrong-before-create'));
        const node = loaded.game.createSession({seed: '0'});
        const wasm = runtime.createSession('0');
        const rawHost = new pokie.SeededPokieWasmHost('0');
        let rawDraws = 0;
        const rawDrawTape = [];
        const {instance} = await WebAssembly.instantiate(bytes, {pokie: {next_random() {rawDraws++; const draw = rawHost.nextRandom(); rawDrawTape.push(draw); return draw;}}});
        const canonical = pokie.readCanonicalPokieWasmModule(bytes);
        const bets = model.availableBets ?? [...pokie.SHARED_SLOT_DEFAULT_BETS];
        // Constructor initialization: same untouched seed, no restoration/offset to manufacture parity.
        const initialized = pokie.readSharedSlotMathResult(instance, canonical.model, instance.exports.play(bets[0]));
        function stopsFromNodeScreen(screen) {
            return screen.map((window, reel) => {
                const strip = model.reelStrips[reel];
                const candidates = strip.flatMap((symbol, stop) => symbol === window[0] && strip[(stop + 1) % strip.length] === window[1] ? [stop] : []);
                assert.equal(candidates.length, 1, 'the real Node screen must identify one exact stop');
                return candidates[0];
            });
        }
        assert.deepEqual(initialized.screen, node.getSymbolsCombination().toMatrix(), name);
        assert.deepEqual(initialized.stops, rawDrawTape.map((draw, reel) => Math.floor(draw * model.reelStrips[reel].length)));
        if (name.startsWith('stops-')) assert.deepEqual(initialized.stops, stopsFromNodeScreen(node.getSymbolsCombination().toMatrix()));
        assert.equal(rawDraws, model.reels);
        assert.equal(wasm.serialize().drawCount, model.reels);
        assert.equal(rawHost.serializeState(), node.toSessionState().rngState);
        assert.equal(wasm.serialize().rngState, node.toSessionState().rngState);
        const initial = JSON.parse(JSON.stringify(wasm.serialize()));
        let checkpoint, nodeCheckpoint;
        const observed = [];
        let multi = false;
        for (let i = 0; i < 36; i++) {
            const bet = bets[i % bets.length]; node.setBet(bet); node.play(); recompiled.setBet(bet); recompiled.play();
            const round = await wasm.play({bet});
            const raw = pokie.readSharedSlotMathResult(instance, canonical.model, instance.exports.play(bet));
            const screen = node.getSymbolsCombination().toMatrix();
            reference.calculateWin(bet, new pokie.SymbolsCombination().fromMatrix(screen));
            assert.deepEqual(round.screen, screen, name); assert.deepEqual(raw.screen, screen, name);
            assert.deepEqual(raw.stops, round.stops, name);
            assert.deepEqual(round.stops, rawDrawTape.slice(-model.reels).map((draw, reel) => Math.floor(draw * model.reelStrips[reel].length)));
            if (name.startsWith('stops-')) assert.deepEqual(round.stops, stopsFromNodeScreen(screen));
            assert.deepEqual(recompiled.getSymbolsCombination().toMatrix(), screen); assert.equal(recompiled.getWinAmount(), node.getWinAmount());
            assert.equal(round.payout, node.getWinAmount(), name); assert.equal(raw.payout, round.payout, name);
            assert.equal(reference.getWinAmount(), round.payout, `existing evaluator ${name}`);
            assert.deepEqual(node.getWinEvaluationResult().getWinComponents().map(c => [c.getType(), c.getSymbolId(), c.getWinningPositions(), c.getWinAmount()]),
                reference.getWinEvaluationResult().getWinComponents().map(c => [c.getType(), c.getSymbolId(), c.getWinningPositions(), c.getWinAmount()]), `component semantics ${name}`);
            assert.equal(round.credits, node.getCreditsAmount(), name);
            assert.equal(wasm.serialize().rngState, node.toSessionState().rngState, name);
            assert.equal(rawHost.serializeState(), node.toSessionState().rngState, name);
            assert.equal(rawDraws, model.reels * (i + 2)); assert.equal(wasm.serialize().drawCount, rawDraws);
            multi ||= raw.components.length > 1;
            observed.push(round);
            if (i === 17) {checkpoint = JSON.parse(JSON.stringify(wasm.serialize())); nodeCheckpoint = {state: JSON.parse(JSON.stringify(node.toSessionState())), credits: node.getCreditsAmount()};}
        }
        if (name === 'lines-multi' || name === 'ways-multi') assert.equal(multi, true, 'must actually observe simultaneous fractional wins');
        const empty = await runtime.replay(initial, []); assert.deepEqual(empty.stateAfter, initial); assert.equal(empty.stateBeforeFinal, undefined);
        const origin = {schemaVersion: 'pokie.state.v2', seed: '0', sequence: 0, drawCount: 0, credits: 1000};
        assert.deepEqual((await runtime.replay(origin, [])).stateAfter, initial);
        const fresh = await pokie.loadPokieWasmFileRuntime(artifact, new pokie.SeededPokieWasmHost('unrelated'));
        const restored = fresh.restoreSession(checkpoint);
        const restoredNode = loaded.game.createSession({seed: 'unrelated'}); restoredNode.fromSessionState(nodeCheckpoint.state); restoredNode.setCreditsAmount(nodeCheckpoint.credits);
        for (const expected of observed.slice(18)) {
            assert.deepEqual(await restored.play({bet: expected.stake}), expected);
            restoredNode.setBet(expected.stake); restoredNode.play();
            assert.deepEqual(restoredNode.getSymbolsCombination().toMatrix(), expected.screen);
            assert.equal(restoredNode.getWinAmount(), expected.payout); assert.equal(restoredNode.getCreditsAmount(), expected.credits);
        }
        assert.deepEqual(restored.serialize(), wasm.serialize());
        const replay = await fresh.replay(checkpoint, observed.slice(18).map(round => ({bet: round.stake})));
        assert.deepEqual(replay.rounds, observed.slice(18)); assert.deepEqual(replay.stateAfter, wasm.serialize());
        const before = wasm.serialize();
        await assert.rejects(wasm.play({bet: -1})); await assert.rejects(wasm.play({bet: 0.125})); assert.deepEqual(wasm.serialize(), before);
        const poor = runtime.createSession('0', {credits: 0}), poorBefore = poor.serialize(); await assert.rejects(poor.play({bet: bets[0]})); assert.deepEqual(poor.serialize(), poorBefore);
        assert.throws(() => runtime.restoreSession({...before, artifactIdentity: 'wrong'}), /identity/);
        // A real module also rejects an unavailable stake before consuming host RNG.
        const drawsBeforeInvalid = rawDraws; assert.throws(() => instance.exports.play(-1), WebAssembly.RuntimeError); assert.equal(rawDraws, drawsBeforeInvalid);
        if (name.startsWith('stops-')) assert.ok(observed.some(round => round.stops.at(-1) > 0));
        let longSession;
        if (name === 'ways-mixed' || name === 'clusters-mixed') {
            const live = runtime.createSession('0', {credits: 10000000});
            const liveNode = loaded.game.createSession({seed: '0'}); liveNode.setCreditsAmount(10000000);
            const initialDiagnostics = runtime.getDiagnostics();
            const started = performance.now();
            const samples = [];
            for (let i = 1; i <= 100000; i++) {
                const bet = stakes[(i - 1) % stakes.length]; liveNode.setBet(bet); liveNode.play(); const round = await live.play({bet});
                if (i === 10000 || i === 100000) {
                    assert.deepEqual(round.screen, liveNode.getSymbolsCombination().toMatrix());
                    assert.equal(round.payout, liveNode.getWinAmount()); assert.equal(round.credits, liveNode.getCreditsAmount());
                    const state = JSON.parse(JSON.stringify(live.serialize())); assert.equal(state.rngState, liveNode.toSessionState().rngState);
                    assert.ok(JSON.stringify(state).length < 340); assert.equal(state.drawCount, (i + 1) * model.reels);
                    assert.deepEqual(Object.keys(state).sort(), ['artifactIdentity', 'credits', 'drawCount', 'rngState', 'schemaVersion', 'seed', 'sequence']);
                    const continuation = await fresh.replay(state, [{bet: stakes[0]}]);
                    assert.deepEqual(continuation.stateBeforeFinal, state);
                    const nativeRestored = loaded.game.createSession({seed: 'different'}); nativeRestored.fromSessionState(JSON.parse(JSON.stringify(liveNode.toSessionState()))); nativeRestored.setCreditsAmount(liveNode.getCreditsAmount()); nativeRestored.setBet(stakes[0]); nativeRestored.play();
                    assert.deepEqual(continuation.rounds[0].screen, nativeRestored.getSymbolsCombination().toMatrix()); assert.equal(continuation.rounds[0].payout, nativeRestored.getWinAmount());
                    samples.push({rounds: i, bytes: JSON.stringify(state).length, rngState: state.rngState});
                }
            }
            const diagnostics = runtime.getDiagnostics();
            assert.equal(diagnostics.generatedDraws - initialDiagnostics.generatedDraws, 100000 * model.reels);
            assert.equal(diagnostics.hostRestorations - initialDiagnostics.hostRestorations, 100000);
            longSession = {samples, milliseconds: performance.now() - started};
        }
        if (name === 'lines-mixed') {
            let draws = 0;
            const host = {nextRandom() {draws++; return 0.5;}};
            async function reject(label, binary, sidecar) {
                await assert.rejects(pokie.instantiatePokieWasm(binary, sidecar, host));
                await assert.rejects(browser.instantiatePokieWasm(binary, sidecar, host));
                await assert.rejects(portable.instantiatePokieWasm(binary, sidecar, host));
                const worker = new pokie.PokieWasmWorkerProtocol();
                assert.equal((await worker.handle({id: label, type: 'instantiate', bytes: binary, manifest: sidecar})).ok, false);
                const target = path.join(folder, `${label}.wasm`); fs.writeFileSync(target, binary); fs.writeFileSync(`${target}.pokie-wasm.json`, JSON.stringify(sidecar));
                await assert.rejects(pokie.loadPokieWasmFileRuntime(target, host));
                await assert.rejects(new pokie.ProjectTargetResolver().resolve(target));
                assert.equal(draws, 0); negatives.push(label);
            }
            await reject('changed-bytes', new Uint8Array([...bytes.slice(0, -1), bytes.at(-1) ^ 1]), manifest);
            await reject('swapped-component', bytes, {...manifest, component: {...manifest.component, id: 'identical-mechanics-other-id'}});
            await reject('old-abi', bytes, {...manifest, artifact: {...manifest.artifact, abiVersion: '1.0.0'}});
            const executable = pokie.compileSharedSlotMath(canonical.model);
            const changed = executable.slice();
            // Locate a valid i32.load and alter its offset without changing module validity.
            let codeOffset = 8;
            while (changed[codeOffset] !== 10) {
                codeOffset++; let size = 0, factor = 1, byte;
                do {byte = changed[codeOffset++]; size += (byte & 127) * factor; factor *= 128;} while (byte & 128);
                codeOffset += size;
            }
            const load = changed.indexOf(0x28, codeOffset); changed[load + 2] = 1;
            const altered = new Uint8Array([...changed, ...pokie.sharedSlotCustomSection('pokie.game.v2', pokie.stableSlotMathJson(canonical.model)), ...pokie.sharedSlotCustomSection('pokie.component.v2', pokie.stableSlotMathJson(canonical.descriptor))]);
            assert.equal(WebAssembly.validate(altered), true);
            await reject('rehashed-code', altered, {...manifest, artifact: {...manifest.artifact, bytes: altered.length, sha256: hash(altered)}});
            const otherModel = {...canonical.model, paytable: {...canonical.model.paytable, A: {3: 99}}};
            const configurationHash = hash(new TextEncoder().encode(pokie.stableSlotMathJson(otherModel)));
            const otherDescriptor = {...canonical.descriptor, artifact: {...canonical.descriptor.artifact, configurationHash}};
            const mismatched = new Uint8Array([...executable, ...pokie.sharedSlotCustomSection('pokie.game.v2', pokie.stableSlotMathJson(otherModel)), ...pokie.sharedSlotCustomSection('pokie.component.v2', pokie.stableSlotMathJson(otherDescriptor))]);
            await reject('rehashed-model-code', mismatched, {...manifest, artifact: {...manifest.artifact, bytes: mismatched.length, sha256: hash(mismatched), configurationHash}});
        }
        receipts.push({name, longSession, artifact: manifest.artifact.sha256, model: manifest.artifact.configurationHash, bytes: bytes.length, rounds: observed.length, draws: rawDraws, multi});
        runtime.dispose(); fresh.dispose(); await loaded.release();
    }
    console.log(JSON.stringify({native: true, runtime: process.version, configurationChecks, negatives, receipts}));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
