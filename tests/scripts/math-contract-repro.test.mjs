// Hermetic runner contracts only. These are not installed-candidate evidence.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, access, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, test} from '@jest/globals';
import {STAKES, REQUIRED, CASES, fixture, assertAmount, assertComplete, command, collect, main} from '../../scripts/math-contract-repro.mjs';

const roots = [];
afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true});});
async function workspace() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'p10-repro-contract-'));
    roots.push(root);
    return root;
}
async function receipt(output) {return JSON.parse(await readFile(path.join(output, 'result.json')));}

test('retains exact fixture coverage, sparse entries and scientific-notation stake identities', () => {
    assert.deepEqual(REQUIRED, ['fractional/cjs', 'fractional/ts', 'missing-symbol/cjs', 'missing-symbol/ts', 'missing-count/cjs', 'missing-count/ts', 'zero/cjs', 'zero/ts', 'positive/cjs', 'positive/ts', 'wasm/initial-and-later', 'exact/bundle-and-report']);
    assert.deepEqual(STAKES, [1, 0.01, 0.1, 1.5, 1e-7]);
    for (const kind of CASES) {
        const model = fixture(kind);
        assert.deepEqual(model.availableBets, STAKES);
        assert.equal(model.reels, kind === 'missing-count' ? 5 : 3);
        assert.deepEqual(fixture(kind, true).reelStrips, Array.from({length: model.reels}, () => ['A', 'B']));
    }
    assert.deepEqual(fixture('fractional').reelStrips, [['A'], ['A'], ['A']]);
    assert.deepEqual(fixture('missing-symbol').reelStrips, [['B'], ['B'], ['B']]);
    assert.deepEqual(fixture('missing-symbol').paytable, {A: {3: 5}});
    assert.deepEqual(fixture('missing-count').reelStrips, [['A'], ['A'], ['A'], ['B'], ['B']]);
    assert.deepEqual(fixture('missing-count').paytable, {A: {5: 10}, B: {5: 2}});
    assert.deepEqual(fixture('zero').paytable, {A: {3: 5}, B: {3: 0}});
    assert.deepEqual(fixture('positive').paytable, {A: {3: 5}, B: {3: 2}});
});

test('amount tolerance cannot hide a missing tiny positive win or fabricated zero', () => {
    for (const stake of STAKES) {
        assertAmount(5 * stake, 5 * stake);
        assert.throws(() => assertAmount(0, 5 * stake));
        assert.throws(() => assertAmount(1e-20, 0));
        assert.throws(() => assertAmount(NaN, 5 * stake));
    }
    assert.throws(() => assertComplete(REQUIRED.slice(1)));
    assert.throws(() => assertComplete([...REQUIRED, REQUIRED[0]]));
});

test('incomplete execution fails, releases games/runtimes and removes only owned scratch', async () => {
    const root = await workspace(), output = path.join(root, 'collection');
    const shared = path.join(root, 'shared-install-marker');
    await writeFile(shared, 'keep');
    const released = [];
    await assert.rejects(collect({output}, async ({result, releases, work}) => {
        await writeFile(path.join(work, 'partial'), 'temporary');
        releases.push(() => {released.push('game');}, () => {released.push('wasm');});
        result.completed.push(...REQUIRED.slice(1));
    }), /incomplete/);
    assert.deepEqual(released, ['wasm', 'game']);
    const result = await receipt(output);
    assert.equal(result.status, 'failed');
    assert.equal(result.resourcesDrained, true);
    await assert.rejects(access(path.join(output, 'work')));
    assert.equal(await readFile(shared, 'utf8'), 'keep');
});

test('assertion/load failures preserve diagnostics and cleanup failures cannot become green', async () => {
    const root = await workspace();
    for (const message of ['assertion failed', 'module loading failed', 'release failed']) {
        const output = path.join(root, message);
        await assert.rejects(collect({output}, async ({releases, result}) => {
            if (message === 'release failed') {releases.push(() => {throw new Error(message);}); result.completed.push(...REQUIRED);}
            else throw new Error(message);
        }), new RegExp(message));
        const result = await receipt(output);
        assert.equal(result.status, 'failed');
        assert.match(result.error, new RegExp(message));
        assert.equal(result.resourcesDrained, message !== 'release failed');
    }
});

test('failed compiler/command records exact exit and cannot complete collection', async () => {
    const root = await workspace(), output = path.join(root, 'failed-command');
    await assert.rejects(collect({output}, async ({work, result, signal}) => {
        await command(process.execPath, ['-e', 'console.error("compile failure");process.exitCode=7'], {cwd: work, signal, commands: result.commands});
    }), /exited 7/);
    const result = await receipt(output);
    assert.equal(result.status, 'failed');
    assert.equal(result.commands[0].exitCode, 7);
    assert.match(result.commands[0].stderr, /compile failure/);
    assert.equal(typeof result.commands[0].durationMs, 'number');
});

test('cancellation kills and drains an actual owned child before releasing and deleting scratch', async () => {
    const root = await workspace(), output = path.join(root, 'cancelled');
    const controller = new AbortController();
    let released = false;
    await assert.rejects(collect({output, signal: controller.signal}, async ({work, result, releases, signal}) => {
        releases.push(() => {released = true;});
        // Abort after launch; the await still owns and drains the foreground child.
        const running = command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {cwd: work, signal, commands: result.commands});
        controller.abort();
        await running;
    }), /cancelled/);
    const result = await receipt(output);
    assert.equal(result.commands[0].exitCode, null);
    assert.equal(result.commands[0].exitSignal, 'SIGKILL');
    assert.equal(result.resourcesDrained, true);
    assert.equal(released, true);
    assert.equal(result.status, 'failed');
});

test('timeout and spawn failure are terminal command failures with drained handles', async () => {
    const root = await workspace();
    const commands = [];
    await assert.rejects(command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {cwd: root, commands, timeoutMs: 20}), /timed out/);
    await assert.rejects(command(path.join(root, 'nonexistent'), [], {cwd: root, commands}), /ENOENT/);
    assert.equal(commands.length, 2);
    assert.equal(commands[0].exitSignal, 'SIGKILL');
    assert.equal(commands[1].exitCode, -2);
});

test('pre-aborted, late-aborted and existing-evidence paths cannot emit a pass', async () => {
    const root = await workspace();
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const output = path.join(root, 'pre-aborted');
    await assert.rejects(collect({output, signal: controller.signal}, async () => {called = true;}));
    assert.equal(called, false);
    assert.equal((await receipt(output)).status, 'failed');
    const before = await readFile(path.join(output, 'result.json'));
    await assert.rejects(collect({output}, async () => {throw new Error('must not execute');}), /EEXIST/);
    assert.deepEqual(await readFile(path.join(output, 'result.json')), before);
    const late = new AbortController();
    const lateOutput = path.join(root, 'late');
    await assert.rejects(collect({output: lateOutput, signal: late.signal}, async ({result}) => {result.completed.push(...REQUIRED); late.abort();}));
    assert.equal((await receipt(lateOutput)).status, 'failed');
});

test('only complete successful execution writes passed; malformed invocation fails', async () => {
    const root = await workspace(), output = path.join(root, 'success');
    const result = await collect({output}, async ({result}) => {result.completed.push(...REQUIRED);});
    assert.equal(result.status, 'passed');
    assert.equal(result.resourcesDrained, true);
    assert.equal((await receipt(output)).status, 'passed');
    await assert.rejects(access(path.join(output, 'work')));
    await assert.rejects(main(['--output', output, '--unknown', root]), /Usage/);
    await assert.rejects(main([]), /absolute/);
});

test('executable exits nonzero on an incomplete candidate handoff and retains failure evidence', async () => {
    const root = await workspace(), output = path.join(root, 'invalid-handoff');
    const handoff = path.join(root, 'candidate.json');
    await writeFile(handoff, '{}');
    const commands = [];
    await assert.rejects(command(process.execPath, [path.resolve('scripts/math-contract-repro.mjs'), '--candidate', handoff,
        '--compiler', path.join(root, 'unused-tsc.js'), '--output', output], {cwd: root, commands}), /exited 1/);
    const result = await receipt(output);
    assert.equal(result.status, 'failed');
    assert.match(result.error, /absolute archivePath required/);
    assert.equal(result.resourcesDrained, true);
    assert.deepEqual(result.commands, []); // No build, install or fallback command.
});

test('command scratch is isolated from a shared installation working directory', async () => {
    const root = await workspace(), output = path.join(root, 'scratch-environment');
    const result = await collect({output}, async ({work, result}) => {
        const actual = await command(process.execPath, ['-e', 'console.log(process.env.TMPDIR)'],
            {cwd: root, temporaryRoot: work, commands: result.commands});
        assert.equal(actual.trim(), work);
        result.completed.push(...REQUIRED);
    });
    assert.equal(result.resourcesDrained, true);
    assert.equal(result.commands[0].temporaryRoot, path.join(output, 'work'));
});
