// Native public consumer. No source resolver, private evaluator or existing dist tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const ts = require('typescript');
const directory = process.argv[2];
const native = createRequire(path.join(directory, 'consumer.cjs'));
const api = native('@fromstan/pokie');
const clone = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
// Independent FNV-1a/mulberry32 oracle for authored stop scripts and next-draw checks.
function random(seed) {
    let state = 0x811c9dc5;
    for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), state | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
function script(blueprint, screens, seed) {
    blueprint.paytable = {A: {3: 2}};
    const rng = random(seed);
    for (let i = 0; i < 3; i++) rng(); // unpaid constructor display
    const stops = screens.map(() => Array.from({length: 3}, () => Math.floor(rng() * 1024)));
    blueprint.reelStrips = Array.from({length: 3}, (_, reel) => {
        const strip = Array(1024).fill('A');
        const assigned = new Map();
        screens.forEach((screen, index) => {
            assert.ok(!assigned.has(stops[index][reel]) || assigned.get(stops[index][reel]) === screen[reel], 'script stop collision');
            assigned.set(stops[index][reel], screen[reel]);
            strip[stops[index][reel]] = screen[reel];
        });
        return strip;
    });
    return stops;
}
function existingFixture(fixture) {
    const {row, blueprint} = fixture;
    let screens = Array.from({length: 6}, () => ['A', 'A', 'A']);
    if (row.progression === 'freeGames') screens = [['S','S','A'], ['S','S','S'], ['S','S','S'], ['A','A','A'], ['A','A','A'], ['A','A','A']];
    if (row.progression === 'holdAndWin') screens = [['C','A','A'], ['A','A','A'], ['A','M','A'], ['A','A','A'], ['A','A','A'], ['A','A','A']];
    screens.push(['J','A','A'], ['J','A','A'], ['A','A','A']);
    fixture.screens = screens;
    fixture.stops = script(blueprint, screens, fixture.seed);
}
// Both positive arrays agree at the independently enumerated sampled stops, but
// differ at an unused stop. This isolates progression/context accounting from
// the variant/stop interval oracles exercised by the weighted distribution cells.
function weightFirstReel(blueprint, seed) {
    const original = blueprint.reelStrips[0];
    const strip = original.length === 1 ? Array(1024).fill(original[0]) : [...original];
    const rng = random(seed), used = new Set(Array.from({length:512},()=>Math.floor(rng()*strip.length)));
    let unused=0;while (used.has(unused)) unused++;
    assert.ok(unused < strip.length,'finite independent unsampled position');
    const alternative=blueprint.symbols.find(symbol=>symbol!==strip[unused]);
    const second=[...strip];second[unused]=alternative;
    blueprint.reelSequences=[{type:'weighted',variants:[{id:'First',symbols:strip,weight:1},{id:'first',symbols:second,weight:3},{id:'zero',symbols:Array(strip.length).fill(alternative),weight:0}]},...blueprint.reelStrips.slice(1).map(symbols=>({type:'exact',symbols}))];
    delete blueprint.reelStrips;
}
async function build(fixture) {
    const folder = path.join(directory, 'features', fixture.id);
    fs.mkdirSync(folder, {recursive: true});
    const source = path.join(folder, 'game.blueprint.json');
    fs.writeFileSync(source, JSON.stringify(fixture.blueprint));
    const packageDir = path.join(folder, 'package');
    new api.GamePackageGenerator('1.3.0').generate(fixture.blueprint, source, packageDir);
    const artifact = path.join(folder, 'game.wasm');
    await new api.WasmArtifactBuilder('1.3.0').build({type: 'blueprint', rootPath: source, capabilities: api.PROJECT_TYPE_CAPABILITIES.blueprint, provenance: 'V2C-21 public parity'}, artifact);
    return {...fixture, folder, packageDir, artifact, bytes: fs.readFileSync(artifact), manifest: JSON.parse(fs.readFileSync(`${artifact}.pokie-wasm.json`, 'utf8'))};
}
function compilePackages(fixtures) {
    const types = path.join(directory, 'public-types.ts');
    fs.writeFileSync(types, `import type {CanonicalWasmGameModel as Root} from '@fromstan/pokie';
import type {CanonicalWasmGameModel as Browser} from '@fromstan/pokie/browser';
import type {CanonicalWasmGameModel as Portable} from '@fromstan/pokie/wasm';
export const compatible = (model: Root): [Browser, Portable] => [model, model];`);
    const rootNames = [types,...fixtures.map(fixture => path.join(fixture.packageDir, 'src/index.ts'))];
    const outDir = path.join(directory, 'typed');
    const program = ts.createProgram(rootNames, {module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16, target: ts.ScriptTarget.ES2022, strict: true, skipLibCheck: true, noEmitOnError: true, rootDir: directory, outDir});
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCurrentDirectory: () => directory, getCanonicalFileName: file => file, getNewLine: () => '\n'}));
    assert.equal(program.emit().emitSkipped, false);
    fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({type: 'commonjs'}));
    for (const fixture of fixtures) fixture.typed = path.join(outDir, path.relative(directory, path.join(fixture.packageDir, 'src/index.js')));
}
function nodeSession(game, seed, bet = 0.05) {
    const session = game.createSession({seed});
    session.setCreditsAmount(10000);
    session.setBet(bet);
    return session;
}
async function compare(fixture, portable) {
    const game = native(path.join(fixture.packageDir, 'dist/index.js'));
    const typed = native(fixture.typed);
    const node = nodeSession(game, fixture.seed, fixture.bet), typedNode = nodeSession(typed, fixture.seed, fixture.bet);
    const runtime = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost(fixture.seed));
    const session = runtime.createSession(fixture.seed, {credits: 10000});
    const origin = session.serialize();
    const initialRestored = runtime.restoreSession(clone(origin));
    assert.deepEqual(initialRestored.getInitialData(),session.getInitialData(),`${fixture.id}: initialized sequence-zero screen`);
    initialRestored.dispose();
    const commands = [], results = [];
    let entry = 0, contribution = 0, compositionPool = 10, roundId, continuation;
    const bet = fixture.bet ?? 0.05;
    const count = fixture.count ?? (fixture.kind === 'existing' ? 9 : fixture.kind === 'bounded' ? 18 : 12);
    let expectedCollection = 0;
    const weightedRng = random(fixture.seed);
    const weightedCounts = [0,0,0];
    if (fixture.kind === 'weighted' && fixture.distribution === 'dyadic') {weightedRng();weightedRng();weightedRng();}
    for (let index = 0; index < count; index++) {
        const command = continuation ? {kind: 'spin', delivery: 'stepwise', continuation} : {kind: 'spin', bet, ...(fixture.entryMode ? {mode: fixture.entryMode} : fixture.row?.modes && index === 8 ? {mode: 'ante'} : {}), delivery: 'stepwise', roundId: `${fixture.id}-${entry++}`};
        roundId = command.roundId ?? roundId;
        const before = node.getCreditsAmount();
        const expected = new api.SessionRuntime(node).execute(command);
        const typedResult = new api.SessionRuntime(typedNode).execute(command);
        assert.equal(expected.status, 'played', `${fixture.id}: ${JSON.stringify(expected)}`);
        assert.deepEqual(typedResult, expected);
        const observed = await session.play(command);
        assert.deepEqual(observed.screen, node.getVisibleSymbolsCombination().toMatrix(), `${fixture.id}/${index} screen`);
        assert.deepEqual(observed.network, game.getSessionSerializer().getRoundData(node), `${fixture.id}/${index} network`);
        assert.deepEqual(observed.sequenceSelections, node.getSequenceSelections());
        near(observed.win, expected.deliveryOnly ? 0 : node.getWinAmount(), `${fixture.id}/${index} mathematical win`);
        near(observed.stake, expected.stake, 'stake');
        near(observed.payout, node.getCreditsAmount() - before + expected.stake, 'wallet payout');
        near(observed.credits, node.getCreditsAmount(), 'credits');
        const nodeRound = expected.logicalRound;
        for (const key of ['status', 'cursor', 'deliveryCursor', 'stageCursor', 'mathematicalStatus', 'totalStake', 'totalWin', 'totalPayout']) assert.equal(observed.logicalRound[key], nodeRound[key], `${fixture.id}/${index}/${key}`);
        if (fixture.known) {
            near(observed.win, fixture.known.wins[index % fixture.known.wins.length], 'independent edge award');
            if (fixture.known.stakes) near(observed.stake, fixture.known.stakes[index % fixture.known.stakes.length], 'independent edge stake');
        }
        if (fixture.weightedLifecycle) {
            const statistics=observed.sequenceStatistics[0];
            assert.equal(statistics.selections,entry,'one eligible selection per paid entry');
            assert.deepEqual(statistics.variants.map(variant=>variant.id),['First','first','zero']);
            assert.equal(statistics.variants[2].count,0,'zero mass never selected');
            assert.equal(observed.sequenceSelections[0].context,`logical:${roundId}`);
        }
        if (fixture.known?.drawCounts) assert.equal(session.serialize().drawCount,fixture.known.drawCounts[index],'independent selection/refill draw accounting');
        if (fixture.kind === 'geometry') {
            assert.deepEqual(observed.screen,Array.from({length:5},()=>['W','B','B','B']),'independent projected screen');
            assert.deepEqual(observed.network.visibleRowCoverage,[1,1,1,0.5]);
            assert.equal(observed.network.freeGamesSum,0,'hidden scatters must not grant free games');
            assert.deepEqual(observed.network.modifiers.sticky,[],'off-window wild must not acquire sticky state');
        }
        if (fixture.kind === 'weighted') {
            const selected = fixture.distribution === 'dyadic' ? Math.floor(weightedRng() * 4) === 0 ? 0 : 1 : 1;
            weightedCounts[selected]++;
            const stop = fixture.distribution === 'dyadic' ? Math.floor(weightedRng() * 2) : undefined;
            const exactStop = fixture.distribution === 'dyadic' ? Math.floor(weightedRng() * 2) : undefined;
            const expectedId = ['a','A'][selected];
            assert.equal(observed.sequenceSelections[0].variantId, expectedId);
            near(observed.win, selected === 0 ? bet * 4 : 0, 'independent weighted payout');
            const stats = observed.sequenceStatistics[0];
            assert.equal(stats.selections, index + 1);
            assert.deepEqual(stats.variants.map(item => item.id), ['a','A','zero']);
            assert.deepEqual(stats.variants.map(item => item.count), weightedCounts);
            assert.deepEqual(stats.variants.map(item => item.frequency), weightedCounts.map(count => count / (index + 1)));
            if (fixture.distribution === 'dyadic') assert.deepEqual(observed.stops, [stop,exactStop]);
            else {assert.equal(stats.variants[0].probabilityRatio.numerator,'1');assert.equal(stats.variants[0].probabilityRatio.denominator, ((1n << 1074n) + 1n).toString());}
        }
        if (fixture.kind === 'composition') {
            const flat = observed.screen.flat();
            const wilds = fixture.blueprint.mechanics.modifiers.wilds;
            const eligible = flat.includes('A') && flat.every(symbol => symbol === 'A' || fixture.blueprint.wilds.includes(symbol) && (wilds.find(wild => wild.symbol === symbol)?.substitutes ?? ['A']).includes('A'));
            const factor = flat.reduce((value, symbol) => value * (wilds.find(wild => wild.symbol === symbol)?.factor ?? 1), 1);
            const stake=index%2===0?bet*10:0;
            near(observed.stake,stake,'independent composed purchase stake');
            const contributed=stake*0.1;
            const award=flat.includes('A')?compositionPool+contributed:0;
            compositionPool=award>0?10:compositionPool+contributed;
            near(observed.win,(eligible?10*bet*factor:0)+award,'independent composed modifier/jackpot amount');
            near(observed.network.jackpot.award?.amount??0,award,'independent composed jackpot award');
            near(observed.network.jackpot.pools[0].value,compositionPool,'independent composed jackpot reset');
            assert.equal(observed.network.chargedBetModeId, 'buy');
            assert.equal(observed.network.betModeId, 'base');
        }
        if (fixture.kind === 'existing') {
            const row = fixture.row;
            const free = row.progression === 'freeGames' ? index >= 2 && index <= 5 : row.progression === 'holdAndWin' && index >= 1 && index <= 4;
            near(observed.stake, free ? 0 : index === 8 && row.modes ? 0.075 : 0.05, 'independent charged stake');
            contribution += observed.stake * 0.1;
            if (row.progression === 'freeGames') {
                if (index === 1) assert.equal(observed.network.freeGamesSum, 2);
                if (index === 2) assert.deepEqual([observed.network.freeGamesNum, observed.network.freeGamesSum], [1, 4]);
                if (index === 5) {assert.equal(observed.network.freeGamesNum, 4); near(observed.network.freeGamesBank, 0.3, 'known bank');}
            }
            if (row.progression === 'holdAndWin' && index <= 4) {
                assert.equal(observed.network.holdAndWin.respinsRemaining, [2,1,2,1,0][index]);
                if (index === 2) assert.deepEqual(observed.network.holdAndWin.locks.map(lock => lock.position), [[0,0],[1,0]]);
                if (index === 4) near(observed.win, row.values === 'bet' ? 0.3 : 6, 'known lock payout');
            }
            if (row.jackpot) {
                near(observed.network.jackpot.statistics.mini.totalContributed, contribution, 'known pool contribution');
                if (index === 6 || index === 7) {near(observed.network.jackpot.award.amount, row.jackpot === 'fixed' ? 10 : 10 + (index === 6 ? contribution : 0.005), 'known jackpot award'); assert.equal(observed.network.jackpot.pools[0].value, 10);}
            }
        } else if (fixture.kind === 'modifier') {
            near(observed.win, (fixture.variant === 'restricted' || fixture.id === 'modifier-restricted' ? 20 : 60) * bet, 'independent modifier amount');
        } else if (fixture.kind === 'bounded') {
            const rules = fixture.blueprint.mechanics;
            if (rules.collection) {
                const accumulated = Math.min(rules.collection.cap, expectedCollection + 3);
                const triggered = accumulated >= rules.collection.threshold;
                expectedCollection = triggered ? accumulated - rules.collection.threshold : accumulated;
                near(observed.win, triggered ? 10 : 0, 'known collection payout');
                assert.equal(observed.network.boundedMechanics.collection.value, expectedCollection);
            } else near(observed.win, 0, 'bounded zero paytable');
        } else if (fixture.kind === 'bonus') {
            const bonus = observed.network.boundedMechanics.weightedBonus;
            if (bonus.selectedNow) near(observed.win, bonus.selection.outcomeId === 'small' ? 3.1 : 0.35, 'known selected award');
            else near(observed.win, 0.1, 'known continuation win');
            assert.notEqual(bonus.selection.outcomeId, 'zero');
        }
        commands.push(command); results.push(observed);
        const saved = clone(session.serialize());
        const fresh = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost('fresh'));
        const restored = fresh.restoreSession(saved);
        assert.deepEqual(restored.serialize(), saved);
        const replayed = await fresh.replay(index ? checkpoints[index - 1] : origin, [command]);
        assert.deepEqual(replayed.rounds[0], observed, `${fixture.id}/${index} replay boundary`);
        assert.deepEqual(replayed.stateAfter, saved);
        if (observed.logicalRound.status === 'pending') continuation = {roundId: observed.logicalRound.id, cursor: observed.logicalRound.deliveryCursor};
        else continuation = undefined;
        if (index === 0) {
            const mutations = [];
            const walk = (value, predicate) => {let current=value;while (current && !predicate(current)) current=current.base;return current;};
            const add = (id, change) => {const corrupt=clone(saved);change(corrupt);mutations.push([id,corrupt]);};
            const currentState=saved.feature.state;
            if (walk(currentState,value=>'freeGamesSum' in value)) {
                add('free-counters',state=>{const free=walk(state.feature.state,value=>'freeGamesSum' in value);free.freeGamesNum++;free.freeGamesSum++;});
                add('free-bank',state=>walk(state.feature.state,value=>'freeGamesBank' in value).freeGamesBank+=0.125);
            }
            if (walk(currentState,value=>value.lockedSymbols?.length)) add('hold-lock',state=>walk(state.feature.state,value=>value.lockedSymbols?.length).lockedSymbols[0].position[0]=2);
            if (walk(currentState,value=>value.poolStatistics)) add('jackpot-stats',state=>walk(state.feature.state,value=>value.poolStatistics).poolStatistics.mini.totalContributed+=1);
            if (walk(currentState,value=>value.pools?.mini)) add('jackpot-pool',state=>walk(state.feature.state,value=>value.pools?.mini).pools.mini.value+=1);
            if (fixture.blueprint.mechanics?.collection) add('collection',state=>state.feature.state.value=state.feature.state.value===2?1:2);
            if (fixture.blueprint.mechanics?.respins && currentState.remaining > 0) add('respins',state=>{state.feature.state.remaining--;state.feature.state.executed++;});
            if (currentState.bonus) add('bonus-counts',state=>{const bonus=state.feature.state.bonus;const selected=fixture.blueprint.mechanics.weightedBonus.outcomes.findIndex(row=>row.id===bonus.selection.outcomeId);bonus.counts[selected]++;bonus.completed++;});
            const leaf=walk(currentState,value=>value.rngState!==undefined);
            if (leaf.sequenceState) add('weighted-counts',state=>{const leaf=walk(state.feature.state,value=>value.rngState!==undefined);const selected=leaf.sequenceState.selections[0];leaf.sequenceState.counts[selected.reelIndex][selected.variantId]++;});
            if (leaf.modifierState) add('modifier-model',state=>walk(state.feature.state,value=>value.rngState!==undefined).modifierState.identity='foreign-model');
            const beforeRejection=fresh.getDiagnostics().hostRestorations;
            for (const [id,corrupt] of mutations) {assert.throws(()=>fresh.restoreSession(corrupt),undefined,`${fixture.id}: coordinated ${id}`);rejectionIds.add(id);}
            assert.equal(fresh.getDiagnostics().hostRestorations,beforeRejection,'invalid restoration must not mutate host RNG');
        }
        // Duplicate delivery is a read of the saved receipt, never a new selection or charge.
        assert.deepEqual(await restored.play(command), observed);
        assert.deepEqual(restored.serialize(), saved);
        checkpoints.push(saved);
        fresh.dispose();
    }
    const composite = runtime.restoreSession(clone(origin));
    const groups = [];
    for (let index=0;index<commands.length;index++) {
        if (!commands[index].continuation) groups.push({command:commands[index],frames:[]});
        groups[groups.length-1].frames.push(results[index]);
    }
    for (const group of groups) {
        const command={...group.command,delivery:'composite',maxSubrounds:group.frames.length};
        const output=await composite.play(command);
        const last=group.frames[group.frames.length-1];
        near(output.stake,group.frames.reduce((sum,frame)=>sum+frame.stake,0),'composite actual stake');
        near(output.win,group.frames.reduce((sum,frame)=>sum+(frame.deliveryOnly?0:frame.win),0),'composite mathematical win');
        near(output.payout,group.frames.reduce((sum,frame)=>sum+frame.payout,0),'composite wallet payout');
        near(output.credits,last.credits,'composite credits');
        assert.deepEqual(output.network,last.network);
        assert.deepEqual((output.deliveries ?? [output]).map(frame=>[frame.network,frame.sequenceSelections]),group.frames.map(frame=>[frame.network,frame.sequenceSelections]),'ordered composite feature/selection observations');
        for (const key of ['totalStake','totalWin','totalPayout','status','cursor','deliveryCursor']) assert.equal(output.logicalRound[key],last.logicalRound[key]);
    }
    const compositeState=composite.serialize();
    const stepwiseState=session.serialize();
    assert.equal(compositeState.drawCount,stepwiseState.drawCount,'composite draw consumption');
    assert.equal(compositeState.rngState,stepwiseState.rngState,'composite next RNG');
    assert.deepEqual(compositeState.feature.state,stepwiseState.feature.state,'composite executable progress');
    composite.dispose();
    const replay = await runtime.replay(origin, commands);
    assert.deepEqual(replay.rounds, results);
    assert.deepEqual(replay.stateAfter, session.serialize());
    const final = session.serialize();
    const next = continuation ? {kind: 'spin', delivery: 'stepwise', continuation} : {kind: 'spin', bet, delivery: 'stepwise', roundId: `${fixture.id}-next`};
    const fresh = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost('next'));
    assert.deepEqual(await fresh.restoreSession(clone(final)).play(next), await session.play(next), 'next RNG continuation');
    fresh.dispose(); runtime.dispose();
    return {id: fixture.id, boundaries: count, artifact: fixture.manifest.artifact.sha256};
}
async function longSessions(fixtures, portable) {
    const receipts = [];
    for (const fixture of fixtures) {
        const runtime = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost(fixture.seed));
        const session = runtime.createSession(fixture.seed, {credits:100000});
        let fresh = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost('fresh'));
        let restored = fresh.restoreSession(clone(session.serialize()));
        let maximum = 0, firstSize = 0;
        for (let index = 0; index < 128; index++) {
            const command = portable.nextPokieWasmCommand(session.serialize());
            const expected = await session.play(command);
            assert.deepEqual(await restored.play(command), expected, `${fixture.id}: repeated fresh-host continuation ${index}`);
            const checkpoint = session.serialize();
            const size = Buffer.byteLength(JSON.stringify(checkpoint));
            if (index === 16) firstSize = size;
            if (index >= 16) maximum = Math.max(maximum,size);
            assert.ok(size < 24576 + (fixture.weightedLifecycle ? Buffer.byteLength(JSON.stringify(fixture.blueprint))*8 : 0), `${fixture.id}: compact snapshot ${size}`);
            assert.ok(!('commands' in checkpoint) && !('draws' in checkpoint));
            assert.ok((checkpoint.feature.logicalRound?.subrounds.length ?? 0) <= 1);
            assert.equal(checkpoint.feature.lastRound?.deliveries,undefined);
            if (index % 16 === 15) {
                fresh.dispose();
                fresh = await portable.instantiatePokieWasm(fixture.bytes, fixture.manifest, new portable.SeededPokieWasmHost('fresh'));
                restored = fresh.restoreSession(clone(checkpoint));
                assert.equal(fresh.getDiagnostics().generatedDraws,0,'restoration must not consume or replay host draws');
            }
        }
        assert.ok(maximum <= firstSize + 4096, `${fixture.id}: snapshot growth ${firstSize} -> ${maximum}`);
        const settled = clone(session.serialize());
        for (const corrupt of [
            {...clone(settled),schemaVersion:'pokie.state.v999'},
            {...clone(settled),artifactIdentity:'foreign'},
            {...clone(settled),drawCount:settled.drawCount-1},
            {...clone(settled),feature:{...clone(settled.feature),bet:999}},
        ]) assert.throws(() => fresh.restoreSession(corrupt));
        const corrupt = clone(settled);
        let leaf = corrupt.feature.state;
        while (leaf.base) leaf = leaf.base;
        leaf.rngState = -1;
        assert.throws(() => fresh.restoreSession(corrupt));
        assert.deepEqual(session.serialize(), settled);
        const next = portable.nextPokieWasmCommand(settled);
        assert.deepEqual(await session.play(next), await restored.play(next));
        receipts.push({id:fixture.id,iterations:128,maximumBytes:maximum});
        fresh.dispose(); runtime.dispose();
    }
    return receipts;
}
const rejectionIds = new Set();
async function conversionRoutes(fixtures, portable) {
    const routes=[];
    for (const id of ['modes','weighted-dyadic']) {
        const fixture=fixtures.find(row=>row.id===id);
        const registry=new api.ArtifactBuilderRegistry('1.3.0');
        const source=await new api.ProjectTargetResolver().resolve(fixture.packageDir);
        assert.equal(source.type,'tsPackage');
        const sourceEntry=path.join(fixture.packageDir,'dist/index.js');
        const original=fs.readFileSync(sourceEntry);
        const workbook=path.join(fixture.folder,'source.xlsx');
        const issues=await new api.ParSheetExporter('1.3.0').exportToFile(fixture.blueprint,workbook);
        assert.deepEqual(issues.filter(issue=>issue.severity==='error'),[]);
        const workbookBytes=fs.readFileSync(workbook);
        for (const [kind, project] of [['package',source],['PAR',await new api.ProjectTargetResolver().resolve(workbook)]]) {
            const destination=path.join(fixture.folder,`${kind}.wasm`);
            await registry.build('wasm',project,destination);
            assert.deepEqual(fs.readFileSync(sourceEntry),original);
            assert.deepEqual(fs.readFileSync(workbook),workbookBytes);
            const manifest=JSON.parse(fs.readFileSync(`${destination}.pokie-wasm.json`,'utf8'));
            const converted=await portable.instantiatePokieWasm(fs.readFileSync(destination),manifest,new portable.SeededPokieWasmHost(fixture.seed));
            const baseline=await portable.instantiatePokieWasm(fixture.bytes,fixture.manifest,new portable.SeededPokieWasmHost(fixture.seed));
            try {
                const command={bet:0.05,roundId:'route',delivery:'composite',...(id==='modes'?{mode:'buy'}:{})};
                const actual=await converted.createSession(fixture.seed).play(command);
                const expected=await baseline.createSession(fixture.seed).play(command);
                for (const key of ['screen','win','stake','payout','network','sequenceSelections','sequenceStatistics']) assert.deepEqual(actual[key],expected[key],`${id}/${kind}/${key}`);
                routes.push(`${id}:${kind}`);
            } finally {converted.dispose();baseline.dispose();}
        }
    }
    return routes;
}
let checkpoints = [];
async function main() {
    const packageRoot = path.join(directory, 'node_modules/@fromstan/pokie');
    const esm = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/index.js')).href);
    const browser = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/browser.js')).href);
    const portable = await import(pathToFileURL(path.join(packageRoot, 'dist/esm/wasm/browser.js')).href);
    for (const exports of [api, esm, browser, portable]) assert.equal(typeof exports.instantiatePokieWasm, 'function');
    const inputs = JSON.parse(fs.readFileSync(path.join(directory, 'feature-fixtures.json'), 'utf8'));
    assert.equal(inputs.length, 36);
    const fixtures = [];
    const extras = [];
    for (const variant of api.AUTHORED_MODIFIER_CATALOG) for (const type of ['lines','ways','clusters']) for (const bet of [0.05,7.5,1e-7]) {
        const original = inputs.find(fixture => fixture.id === `modifier-${variant}`);
        const blueprint = clone(original.blueprint);
        blueprint.winModel = {type, ...(type === 'clusters' ? {minimumClusterSize: 2} : {})};
        blueprint.manifest.id = `modifier-${variant}-${type}-${bet}`;
        extras.push({id: blueprint.manifest.id, kind: 'modifier', variant, blueprint, bet, count: 4});
    }
    for (const variant of api.AUTHORED_MODIFIER_CATALOG) {
        const blueprint = clone(inputs.find(fixture => fixture.id === `modifier-${variant}`).blueprint);
        blueprint.manifest.id = `composition-${variant}`;
        if (!blueprint.symbols.includes('S')) blueprint.symbols.push('S'); blueprint.scatters = ['S'];
        blueprint.mechanics.freeGames = {scatterSymbol: 'S', awardsByCount: {3: 0}};
        blueprint.mechanics.jackpot = {pool: {id:'mini',type:'accumulating',seedValue:10},contribution:{type:'percentage',percentage:0.1},trigger:{type:'symbol-count',symbolId:'A',minimumCount:1},award:'single-tier'};
        blueprint.betModes = [{id:'base',runtimeType:'base',isDefault:true},{id:'ante',runtimeType:'ante',costMultiplier:1.5},{id:'buy',runtimeType:'buyFeature',costMultiplier:10,forcedFreeGames:2}];
        blueprint.reelSequences = blueprint.reelStrips.map((strip, index) => index === 1 ? {type:'exact',symbols:[...strip,...strip,...strip]} : {type:'weighted',variants:[
            {id:'First',symbols:[...strip,...strip,...strip],weight:1}, {id:'first',symbols:[...strip,strip[0] === 'B' ? 'A' : 'B',...strip],weight:3}, {id:'zero',symbols:['S',...strip,'B'],weight:0}]});
        delete blueprint.reelStrips;
        extras.push({id:blueprint.manifest.id,kind:'composition',blueprint,entryMode:'buy',count:8});
    }
    for (const values of ['flat','bet']) {
        const blueprint = clone(inputs.find(fixture => fixture.id === `hold-${values}`).blueprint);
        const seed = 'feature-parity-31';
        script(blueprint, [['C','M','C'],['A','A','A'],['A','A','A']], seed);
        extras.push({id:`hold-full-${values}`,kind:'edge',blueprint,count:2,known:{wins:[values === 'flat' ? 12 : 0.6,0.1],stakes:[0.05,0.05]}});
    }
    for (const outcome of ['small','large','zero-effect']) {
        const blueprint = clone(inputs.find(fixture => fixture.kind === 'bonus').blueprint);
        const table = blueprint.mechanics.weightedBonus;
        table.outcomes.forEach(row => row.weight = row.id === (outcome === 'small' ? 'small' : 'large') ? 1 : 0);
        if (outcome === 'zero-effect') {table.outcomes[1].payout = 0;table.outcomes[1].duration = 0;}
        extras.push({id:`bonus-${outcome}`,kind:'edge',blueprint,count:6,known:{wins:outcome === 'small' ? [3.1] : outcome === 'large' ? [0.35,0.1,0.1] : [0.1],stakes:outcome === 'large' ? [0.05,0,0] : [0.05]}});
    }
    const cascade = clone(inputs.find(fixture => fixture.id === 'bounded-cascade').blueprint);
    cascade.mechanics.cascade.maxCascades = 2;
    script(cascade,[['A','A','A'],['A','A','A'],['B','B','B'],['B','B','B']], 'feature-parity-31');
    extras.push({id:'cascade-terminal-bound',kind:'edge',blueprint:cascade,count:3,known:{wins:[0.2,0,0],stakes:[0.05,0,0]}});
    for (const distribution of ['dyadic','binary64-extreme']) {
        const blueprint = {manifest:{id:`weighted-${distribution}`,name:'Weighted portable',version:'1'},reels:2,rows:1,symbols:['A','B'],wilds:[],scatters:[],availableBets:[0.05,7.5,1e-7],paytable:{A:{2:4}},reelSequences:[
            {type:'weighted',variants:[{id:'a',symbols:['A','A'],weight:distribution === 'dyadic' ? 0.125 : Number.MIN_VALUE},{id:'A',symbols:['B','B'],weight:distribution === 'dyadic' ? 0.375 : 1},{id:'zero',symbols:['A','B'],weight:0}]},
            {type:'exact',symbols:['A','A']}]};
        extras.push({id:blueprint.manifest.id,kind:'weighted',distribution,blueprint,count:24});
    }
    for (const type of ['lines','ways','clusters']) for (const weighted of [false,true]) {
        const blueprint = {manifest:{id:`projection-${type}-${weighted}`,name:'Projection portable',version:'1'},reels:5,rows:4,symbols:['A','B','W','S'],wilds:['W'],scatters:['S'],availableBets:[0.05,7.5,1e-7],
            screenGeometry:{generated:{reels:5,rows:7},visible:{rowOffset:1,rows:3.5},evaluated:{rowOffset:2,rows:3},paylineSpace:'evaluated'},
            paylines:[[0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2]],winModel:{type,...(type === 'clusters' ? {minimumClusterSize:2} : {})},
            paytable:{B:type === 'clusters' ? {15:2} : {5:1},S:{1:1000}},
            mechanics:{freeGames:{scatterSymbol:'S',awardsByCount:{1:2}},modifiers:{wilds:[{symbol:'W',factor:11}],rules:[{id:'hidden-expand',type:'expand',symbol:'W',space:'generated',positions:[[0,1]]},{id:'hidden-sticky',type:'sticky',symbol:'W',space:'generated',positions:[[0,1]],lifetime:2}]}}};
        if (type === 'lines' && !weighted) delete blueprint.paylines;
        let seed, strips, occupied;
        for (let attempt = 0; attempt < 100; attempt++) {
            seed = `projection-${weighted}-${attempt}`;
            const rng = random(seed), assigns = Array.from({length:5},()=>new Map());
            let conflict = false;
            for (let step = 0; step < 9; step++) for (let reel = 0; reel < 5; reel++) {
                if (weighted && reel === 0) rng();
                const stop = Math.floor(rng()*4096);
                ['S','W','B','B','B','A','S'].forEach((symbol,row) => {const position=(stop+row)%4096; if (assigns[reel].has(position) && assigns[reel].get(position)!==symbol) conflict=true;assigns[reel].set(position,symbol);});
            }
            if (conflict) continue;
            strips = assigns.map(positions => {const strip=Array(4096).fill('B');for (const [position,symbol] of positions) strip[position]=symbol;return strip;});
            occupied=assigns;break;
        }
        assert.ok(strips,'finite geometry fixture search');
        if (weighted) {
            const variants = ['First','first','zero'].map((id,index) => {const symbols=[...strips[0]];let unused=index;while (occupied[0].has(unused)) unused++;if (index) symbols[unused]=index===1?'A':'S';return {id,symbols,weight:index===0?1:index===1?3:0};});
            blueprint.reelSequences = [{type:'weighted',variants},...strips.slice(1).map(symbols=>({type:'exact',symbols}))];
        } else blueprint.reelStrips=strips;
        extras.push({id:blueprint.manifest.id,kind:'geometry',blueprint,seed,count:6,known:{wins:[(type==='lines'?3:type==='ways'?243:2)*0.05]}});
    }
    for (const values of ['flat','bet']) {
        const blueprint=clone(inputs.find(fixture=>fixture.id===`hold-${values}`).blueprint), seed='weighted-feature-context';
        blueprint.reelStrips=[['C'],['A'],['A']];
        weightFirstReel(blueprint,seed);
        extras.push({id:`weighted-hold-${values}`,kind:'edge',blueprint,seed,weightedLifecycle:true,count:12,known:{wins:[0,0,values==='flat'?2:0.1],stakes:[0.05,0,0]}});
    }
    for (const id of api.AUTHORED_BOUNDED_MECHANIC_CATALOG) for (const type of ['lines','ways','clusters']) {
        const blueprint=clone(inputs.find(fixture=>fixture.id===`bounded-${id}`).blueprint),seed='weighted-feature-context';
        blueprint.reelStrips=[['C'],['C'],['C']];blueprint.paytable={A:{3:2}};
        blueprint.winModel={type,...(type==='clusters'?{minimumClusterSize:3}:{})};
        weightFirstReel(blueprint,seed);
        extras.push({id:`weighted-bounded-${id}-${type}`,kind:'bounded',blueprint,seed,weightedLifecycle:true,count:18});
    }
    for (const type of ['lines','ways','clusters']) {
        const blueprint=clone(inputs.find(fixture=>fixture.kind==='bonus').blueprint),seed='weighted-feature-context';
        blueprint.winModel={type,...(type==='clusters'?{minimumClusterSize:3}:{})};
        blueprint.mechanics.weightedBonus.outcomes.forEach(outcome=>outcome.weight=outcome.id==='large'?3:0);
        weightFirstReel(blueprint,seed);
        extras.push({id:`weighted-bonus-${type}`,kind:'bonus',blueprint,seed,weightedLifecycle:true,count:12,known:{wins:[0.35,0.1,0.1],stakes:[0.05,0,0]}});
    }
    {
        const blueprint=clone(inputs.find(fixture=>fixture.id==='bounded-cascade').blueprint),seed='weighted-refill-context',rng=random(seed);
        for(let i=0;i<4;i++)rng(); // weighted initialization, then three stops
        rng(); // paid entry variant
        const entry=Array.from({length:3},()=>Math.floor(rng()*1024));
        const refill=Array.from({length:3},()=>Math.floor(rng()*1024));
        blueprint.reelStrips=entry.map((stop,reel)=>{assert.notEqual(stop,refill[reel]);const strip=Array(1024).fill('B');strip[stop]='A';return strip;});
        blueprint.paytable={A:{3:2}};
        weightFirstReel(blueprint,seed);
        extras.push({id:'weighted-cascade-refill',kind:'edge',blueprint,seed,weightedLifecycle:true,count:3,known:{wins:[0.1,0,0],stakes:[0.05,0,0.05],drawCounts:[11,11,15]}});
    }
    for (const input of [...inputs, ...extras]) {
        input.seed ??= 'feature-parity-31';
        if (input.kind === 'existing') existingFixture(input);
        if (input.kind === 'bounded' && !input.weightedLifecycle) {input.blueprint.reelStrips = [['C'],['C'],['C']]; input.blueprint.paytable = {};}
        try {fixtures.push(await build(input));} catch (error) {error.message = `${input.id}: ${error.message}`; throw error;}
    }
    compilePackages(fixtures);
    const receipts = [];
    for (const fixture of fixtures) {
        checkpoints = [];
        try {receipts.push(await compare(fixture, portable));} catch (error) {error.message = `${fixture.id}: ${error.message}`; throw error;}
    }
    const routes = await conversionRoutes(fixtures,portable);
    const compact = await longSessions([...fixtures.slice(0,36),...['weighted-hold-flat','weighted-bounded-cascade-respins-collection-lines','weighted-bonus-lines','weighted-cascade-refill'].map(id=>fixtures.find(fixture=>fixture.id===id))], portable);
    process.stdout.write(JSON.stringify({compact, routes, rejectionIds:[...rejectionIds].sort(), catalogueIds: inputs.map(fixture => fixture.id), crossProducts: extras.map(fixture => fixture.id), publicExports: ['cjs','esm','browser','wasm'], receipts}));
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;});
