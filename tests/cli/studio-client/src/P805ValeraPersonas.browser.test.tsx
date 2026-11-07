import {MantineProvider} from "@mantine/core";
import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MathDefinitionDiffPreview} from "../../../../cli/studio-client/src/components/common/MathDefinitionDiffPreview";
import {OptimizationPanel} from "../../../../cli/studio-client/src/components/project/OptimizationPanel";
import {StudioApiProvider, useStudioApi} from "../../../../cli/studio-client/src/context/StudioApiProvider";
import {useProjectJobs} from "../../../../cli/studio-client/src/hooks/useProjectJobs";
import type {FetchLike} from "../../../../cli/studio-client/src/api/apiClient";
import {optimizationRequest} from "../../../v2/fixtures/OptimizationFixture";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chmod, lstat, mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

// Jest is launched through the implementer command policy, whose npm wrapper
// intentionally refuses broad build commands. This whole-file test owns a
// candidate build as part of its packed-package assertion, so invoke Node's
// installed npm CLI directly rather than inheriting that test-launch wrapper.
const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
const candidatePath = (process.env.PATH ?? "").split(path.delimiter).filter((entry) => !entry.includes("pokie-command-policy")).join(path.delimiter);
const runCandidateNpm = (args: string[]) => {
    if (!npmCli) throw new Error("the candidate package test requires npm");
    return execFileSync(process.execPath, [npmCli, ...args], {cwd: process.cwd(), encoding: "utf8", env: {...process.env, NODE_ENV: "production", PATH: candidatePath}, stdio: "pipe", maxBuffer: 64 * 1024 * 1024});
};

type PointerDelivery = {
    kind: string;
    controlId: string;
    capturedControlId: string;
    count: number;
    captureKey: string;
    preDispatchFocus: {controlId: string; native: boolean};
    hitTest: {region: unknown};
    dispatch: {
        pointerDownCount: number; pointerUpCount: number; clickCount: number;
        eventBindings: Array<{
            eventType: string; trusted: boolean; captureKey: string; capturedControlId: string;
            pathContainsCapturedControl: boolean; capturedControlConnected: boolean;
            identityPreserved: boolean; hitMatchesCapturedControl: boolean;
            region: unknown;
            reflow?: {kind: string; measuredRegion: unknown; deliveredRegion: unknown};
        }>;
    };
};

// The complete packed proof consumes the producer's unchanged pointer records,
// including delivery-time diagnostics, rather than substituting keyboard claims.
const assertPointerDeliveries = (pointers: PointerDelivery[]) => {
    for (const pointer of pointers) {
        expect(pointer.kind).toBe("pointer");
        expect(pointer.count).toBe(1);
        expect(pointer.preDispatchFocus).toEqual({controlId: pointer.controlId, native: true});
        expect(pointer.dispatch.pointerDownCount).toBe(1);
        expect(pointer.dispatch.pointerUpCount).toBe(1);
        expect(pointer.dispatch.clickCount).toBe(1);
        expect(pointer.dispatch.eventBindings.map((event) => event.eventType)).toEqual(["pointerdown", "pointerup", "click"]);
        const reflowed = pointer.dispatch.eventBindings.some((event) => event.reflow !== undefined);
        for (const event of pointer.dispatch.eventBindings) {
            expect(event).toEqual(expect.objectContaining({trusted: true, captureKey: pointer.captureKey, capturedControlId: pointer.capturedControlId, capturedControlConnected: true, identityPreserved: true, hitMatchesCapturedControl: true}));
            if (reflowed) expect(event.pathContainsCapturedControl).toBe(true);
            if (event.reflow !== undefined) {
                expect(event.reflow).toEqual({kind: "same-node-delivery-reflow", measuredRegion: pointer.hitTest.region, deliveredRegion: event.region});
                expect(event.region).not.toEqual(pointer.hitTest.region);
            }
        }
    }
};

type PackedTupleChild = {
    tuple: {persona: string; observation: string; viewport: string};
    worker: {pid: number; processIdentity: string; nonce: string};
    auditPath: string;
    auditSha256: string;
    tupleReceiptPath: string;
    tupleReceiptSha256: string;
    cleanupPath: string;
    cleanupSha256: string;
    checkpointReceiptSha256s: string[];
    cleanupEvidenceId: string;
    endedAt: string;
    exitCode: number;
    signal: string | null;
    parentCleanup: {
        authenticated: boolean;
        operationId: string;
        registryPath: string;
        processTreeDrained: boolean;
        resourcesDrained: boolean;
        ownedProcessIdentities: Array<{pid: number; processIdentity: string}>;
        ownedResources: Array<{pid?: number; released: boolean}>;
    };
};

const makeWritableForCleanup = async (directory: string): Promise<void> => {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await makeWritableForCleanup(target);
    }
};

describe("P8-05 rendered Valera persona evidence", () => {
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");
    const controller = path.join(process.cwd(), "scripts/p8-05-product-readiness-controller.mjs");
    const verifier = path.join(process.cwd(), "scripts/p8-05-candidate-package-verifier.mjs");

    // The retained packed audit reported these visible controls as disabled
    // without title or aria-describedby. Exercise their actual components and
    // request boundary without starting another packed/browser collection.
    it("explains disabled optimization prerequisites and preserves support, start and edit boundaries", async () => {
        function ObservedOptimization() {
            const jobs = useProjectJobs(useStudioApi(), "/project", 0);
            return <OptimizationPanel projectRoot="/project" jobs={jobs} />;
        }
        const calls: Array<{url: string; body?: string}> = [];
        let supported = false;
        let releaseSupport: (() => void) | undefined;
        let releaseDiscovery: (() => void) | undefined;
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({url, body: init?.body as string | undefined});
            if (url === "/api/project/jobs") await new Promise<void>(resolve => {
                releaseDiscovery = resolve;
            });
            if (url.endsWith("support")) {
                await new Promise<void>(resolve => {
                    releaseSupport = resolve;
                });
                return {ok: true, status: 200, json: () => Promise.resolve({supported, reason: supported ? "Finite workflow available" : "This source has no writable tuning contract.", sourceRevision: "sha256:reviewed"})};
            }
            if (url.endsWith("start")) return {ok: true, status: 200, json: () => Promise.resolve({job: {id: "optimization-1", operation: "optimization", status: "running", createdAt: 1, projectId: "/project", request: {}, conflictKey: "optimization"}})};
            return {ok: true, status: 200, json: () => Promise.resolve({jobs: []})};
        };
        render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><ObservedOptimization /></StudioApiProvider></MantineProvider>);
        const run = screen.getByRole("button", {name: "Run optimization"});
        expect(run).toBeDisabled();
        expect(run).toHaveAccessibleDescription("Checking for retained work before starting optimization.");
        await act(() => {
            releaseDiscovery!();
            return Promise.resolve();
        });
        await waitFor(() => expect(run).toHaveAccessibleDescription("Check tuning support for the current targets and policy before running optimization."));
        expect(run).toBeDisabled();
        const user = userEvent.setup();
        await user.click(run);
        expect(calls.some(call => call.url.endsWith("start"))).toBe(false);
        fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {target: {value: JSON.stringify(optimizationRequest())}});
        await user.click(screen.getByRole("button", {name: "Check tuning support"}));
        expect(run).toBeDisabled();
        expect(run).toHaveAccessibleDescription("Wait for the current optimization request to finish.");
        await act(() => {
            releaseSupport!();
            return Promise.resolve();
        });
        await waitFor(() => expect(run).toHaveAccessibleDescription("Optimization is unavailable: This source has no writable tuning contract."));
        expect(document.getElementById(run.getAttribute("aria-describedby")!)).toBeVisible();
        expect(run).toBeDisabled();
        supported = true;
        await user.click(screen.getByRole("button", {name: "Check tuning support"}));
        await act(() => {
            releaseSupport!();
            return Promise.resolve();
        });
        await waitFor(() => expect(run).toBeEnabled());
        expect(run).not.toHaveAttribute("aria-describedby");
        // A policy edit invalidates the prior support approval.
        fireEvent.change(screen.getByLabelText("Math targets and optimization policy (JSON)"), {target: {value: JSON.stringify({...optimizationRequest(), targets: [{metric: "rtp", unit: "ratio", value: 0.8}]})}});
        expect(run).toBeDisabled();
        expect(run).toHaveAccessibleDescription("Check tuning support for the current targets and policy before running optimization.");
        await user.click(screen.getByRole("button", {name: "Check tuning support"}));
        await act(() => {
            releaseSupport!();
            return Promise.resolve();
        });
        await waitFor(() => expect(run).toBeEnabled());
        await user.click(run);
        await waitFor(() => expect(run).toHaveAccessibleDescription("Wait for the active optimization to finish or cancel it before starting another."));
        expect(run).toBeDisabled();
        expect(screen.getByRole("button", {name: "Cancel optimization"})).toBeEnabled();
        const starts = calls.filter(call => call.url.endsWith("start"));
        expect(starts).toHaveLength(1);
        expect(JSON.parse(starts[0].body!)).toMatchObject({sourceRevision: "sha256:reviewed", expectedProjectRoot: "/project", request: {targets: [{value: 0.8}]}});
    });

    it("explains disabled definition comparison and submits only after both saved sources are chosen", async () => {
        const calls: Array<{url: string; body: unknown}> = [];
        const fetchImpl: FetchLike = (url, init) => {
            calls.push({url, body: JSON.parse(init!.body as string)});
            return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({error: "Source missing"})});
        };
        const view = (sourcePath?: string, draft?: unknown) => <StudioApiProvider fetchImpl={fetchImpl}><MathDefinitionDiffPreview sourcePath={sourcePath} draft={draft} /></StudioApiProvider>;
        const rendered = render(view());
        const compare = screen.getByRole("button", {name: "Compare definitions"});
        expect(compare).toBeDisabled();
        expect(compare).toHaveAccessibleDescription("Load or save a source before comparing definitions.");
        rendered.rerender(view("/saved.blueprint.json"));
        expect(compare).toBeDisabled();
        expect(compare).toHaveAccessibleDescription("Choose a saved source to compare with the current definition.");
        const descriptionId = compare.getAttribute("aria-describedby")!;
        expect(document.getElementById(descriptionId)).toBeVisible();
        const user = userEvent.setup();
        await user.click(compare);
        expect(calls).toHaveLength(0);
        fireEvent.change(screen.getByLabelText("Compare with saved source"), {target: {value: "  "}});
        expect(compare).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Compare with saved source"), {target: {value: "/other.blueprint.json"}});
        expect(compare).toBeEnabled();
        expect(compare).not.toHaveAttribute("aria-describedby");
        expect(document.getElementById(descriptionId)).not.toBeInTheDocument();
        await user.click(compare);
        await screen.findByRole("alert");
        expect(calls).toEqual([{url: "/api/math-definition-diff/preview", body: {leftPath: "/saved.blueprint.json", rightPath: "/other.blueprint.json", revision: 0}}]);
        expect(compare).toBeEnabled();
        rendered.rerender(view("/saved.blueprint.json", {}));
        expect(screen.getByRole("button", {name: "Compare saved versus draft"})).toBeEnabled();
        rendered.rerender(view(undefined, {}));
        expect(screen.getByRole("button", {name: "Compare saved versus draft"})).toHaveAccessibleDescription("Load or save a source before comparing definitions.");
    });

    it("waits for imported package validation before compact fairness navigation and retains timeout diagnostics", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {spawn} from 'node:child_process';
            import {mkdtemp,readFile,rm} from 'node:fs/promises';
            import {tmpdir} from 'node:os';
            import path from 'node:path';
            import {createServer} from 'node:http';
            import {connectP805Devtools,observeP805NavigationReadiness,revealP805RenderedNavigationControl,activateP805FocusedControl,hasP805NativeActivation} from './scripts/p8-05-valera-browser-audit.mjs';
            const profile=await mkdtemp(path.join(tmpdir(),'p805-fairness-readiness-'));
            const browser=spawn(process.env.P805_CHROMIUM_BINARY??'chromium-browser',['--headless=new','--no-sandbox','--no-first-run','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
            let terminal;
            const exited=new Promise(resolve=>{browser.once('error',error=>{terminal=error;resolve();});browser.once('exit',(code,signal)=>{terminal={code,signal};resolve();});});
            const now=Date.now;
            let offset=0,cdp,html='';
            const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end(html);});
            await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
            const poll=async read=>{const deadline=now()+30000;for(;;){const value=await read();if(value)return value;assert.equal(terminal,undefined);assert.ok(now()<deadline,'focused Chromium readiness timeout');await new Promise(resolve=>setTimeout(resolve,25));}};
            try {
                const port=await poll(async()=>{try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(String.fromCharCode(10))[0];}catch(error){if(error.code!=='ENOENT')throw error;return false;}});
                cdp=await connectP805Devtools('http://127.0.0.1:'+port);
                const evaluate=async expression=>{const value=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(value.exceptionDetails,undefined);return value.result.value;};
                const load=async()=>{
                    await cdp.send('Emulation.setDeviceMetricsOverride',{width:800,height:900,mobile:false,deviceScaleFactor:1});
                    html='<!doctype html><button type="button" id="studio-navigation-toggle" aria-label="Toggle navigation" aria-controls="studio-navigation-panel" aria-expanded="false" style="position:fixed;left:300px;top:10px;width:50px;height:30px">Menu</button><nav id="studio-navigation-panel" inert style="position:fixed;left:0;top:60px;width:260px;height:800px;transform:translateX(-260px)"><button type="button" id="project-tab:provablyFair" data-pokie-lifecycle="navigation" data-pokie-lifecycle-route="provablyFair" data-pokie-transaction-state="navigation" style="width:220px;height:40px">Provably Fair</button></nav><main style="margin-left:280px"><p id="navigation-result" data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="rendered">Overview ready</p><p id="validation" data-pokie-lifecycle-result="project-validation" data-pokie-lifecycle-terminal="loading">Checking project…</p></main>';
                    const url='http://127.0.0.1:'+server.address().port+'/'+Math.random();
                    await cdp.send('Page.navigate',{url});
                    await poll(()=>evaluate("location.href==="+JSON.stringify(url)+"&&document.readyState==='complete'&&document.getElementById('validation')!==null"));
                    await evaluate("location.hash='#/project/source/overview'");
                    await poll(()=>evaluate("location.hash==='#/project/source/overview'"));
                    await evaluate("window.activations=[];const toggle=document.getElementById('studio-navigation-toggle'),panel=document.getElementById('studio-navigation-panel');toggle.onclick=event=>{window.activations.push({id:toggle.id,trusted:event.isTrusted});toggle.setAttribute('aria-expanded','true');panel.inert=false;panel.style.transform='none';};document.getElementById('project-tab:provablyFair').onclick=event=>{window.activations.push({id:event.currentTarget.id,trusted:event.isTrusted});location.hash='#/project/source/provablyFair';};");
                };
                Date.now=()=>now()+offset;
                for(const terminal of ['completed','error']){
                    await load();
                    const diagnostics={};
                    assert.equal(await observeP805NavigationReadiness(evaluate,'provablyFair',diagnostics),false);
                    assert.equal(diagnostics.phase,'project-validation');
                    let polls=0;
                    const delayed=async expression=>{
                        if(expression.includes('data-pokie-lifecycle-result="project-validation"')){
                            polls++;
                            assert.deepEqual(await evaluate('window.activations'),[],'validation must settle before the drawer or tab receives input');
                            if(polls===2)offset+=31000;
                            if(polls===3)await evaluate("document.getElementById('validation').setAttribute('data-pokie-lifecycle-terminal',"+JSON.stringify(terminal)+")");
                        }
                        return evaluate(expression);
                    };
                    const control=await revealP805RenderedNavigationControl(cdp,delayed,'provablyFair','fairness-conditional');
                    assert.equal(polls,3,'package preparation may exceed the ordinary 30s control deadline');
                    assert.equal(hasP805NativeActivation(control.navigationDisclosure,'studio-navigation-toggle'),true);
                    const activation=await activateP805FocusedControl(cdp,evaluate,'navigation',control);
                    assert.equal(hasP805NativeActivation(activation,'project-tab:provablyFair'),true);
                    assert.deepEqual(await evaluate('window.activations'),[{id:'studio-navigation-toggle',trusted:true},{id:'project-tab:provablyFair',trusted:true}]);
                    assert.equal(await evaluate('location.hash'),'#/project/source/provablyFair');
                }
                await load();
                let polls=0;
                await assert.rejects(()=>revealP805RenderedNavigationControl(cdp,async expression=>{
                    if(expression.includes('data-pokie-lifecycle-result="project-validation"')&&++polls===2)offset+=121000;
                    return evaluate(expression);
                },'provablyFair','fairness-conditional'),error=>/last navigation readiness:/.test(error.message)&&/project-validation/.test(error.message)&&/loading/.test(error.message));
                assert.deepEqual(await evaluate('window.activations'),[],'an exhausted preparation budget never authorizes native input');
                console.log(JSON.stringify({validationTerminals:2,delayedPreparation:true,nativeDrawerAndTab:true,timeoutDiagnostics:true}));
            } finally {Date.now=now;cdp?.close();browser.kill('SIGTERM');await exited;await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 60_000}));
        expect(result).toEqual({validationTerminals: 2, delayedPreparation: true, nativeDrawerAndTab: true, timeoutDiagnostics: true});
    }, 90_000);

    it("waits for packed serve preparation beyond the rendered deadline and retains startup failures", () => {
        const result = execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {spawn} from 'node:child_process';
            import {once} from 'node:events';
            import {setTimeout as pause} from 'node:timers/promises';
            import {waitForP805PackedServer} from './scripts/p8-05-valera-browser-audit.mjs';
            const child=spawn(process.execPath,['-e',
                "const http=require('node:http');const server=http.createServer((req,res)=>{res.writeHead(404);res.end('no index');});server.listen(0,'127.0.0.1',()=>process.send(server.address().port));process.stdin.once('data',()=>console.log('POKIE dev server listening'));"
            ],{stdio:['pipe','pipe','pipe','ipc']});
            const exited=once(child,'exit');
            try {
                const [port]=await once(child,'message');
                let elapsed=0,polls=0;
                const output=await waitForP805PackedServer(child,'http://127.0.0.1:'+port,{
                    now:()=>elapsed,
                    pause:async()=>{elapsed+=15000;if(++polls===3)child.stdin.write('ready\\n');await pause(10);}
                });
                assert.ok(elapsed>30000);
                assert.match(output,/POKIE dev server listening/);
                assert.equal((await fetch('http://127.0.0.1:'+port)).status,404);
            } finally {child.kill();await exited;}
            for(const timeout of [false,true]){
                const child=spawn(process.execPath,['-e',timeout
                    ? "console.error('still preparing package');setInterval(()=>{},1000);"
                    : "console.error('invalid package input');process.exitCode=7;"
                ],{stdio:['ignore','pipe','pipe']});
                const exited=once(child,'exit');
                try {
                    let elapsed=0;
                    await assert.rejects(waitForP805PackedServer(child,'http://127.0.0.1:1',{
                        now:()=>elapsed,pause:async()=>{await pause(20);elapsed+=timeout?30000:1;}
                    }),timeout?/Timed out waiting for packed CLI serve[\\s\\S]*still preparing package/:/stopped before readiness: 7[\\s\\S]*invalid package input/);
                } finally {if(child.exitCode===null)child.kill();await exited;}
            }
            console.log('PACKED_SERVE_BOUNDARY_OK');
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000});
        expect(result).toContain("PACKED_SERVE_BOUNDARY_OK");
    });

    it("admits the complete bounded correction through pinned candidate readers without exempting product inputs", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {execFileSync} from 'node:child_process';
            import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
            import {tmpdir} from 'node:os';
            import path from 'node:path';
            import {candidateFixture,P911_TOOLING_DESCENDANT_PATHS,V2C37_SAVED_GATE_CORRECTION_PATHS} from './tests/testUtils/createP911CandidateFixture.mjs';
            import {authenticateP805ProductTree} from './scripts/p8-05-release-handoff.mjs';
            import {readP911CandidateFromEnvironment,readP911SmokeCandidateFromEnvironment} from './scripts/p9-11-candidate.mjs';
            const directory=await mkdtemp(path.join(tmpdir(),'p805-bounded-handoff-'));
            try {
                const fixture=await candidateFixture(directory),repository=fixture.repository;
                const paths=[...new Set([
                    ...V2C37_SAVED_GATE_CORRECTION_PATHS,
                    'tests/cli/commands/ReplayCommand.test.ts','tests/cli/commands/SimCommand.test.ts',
                    'tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx',
                    'tests/gamepackage/loadPokieGame.test.ts','tests/project/wasm/WasmRuntimeParity.golden.test.ts',
                    'tests/v2/OptimizationContractsAdapters.test.ts','tests/v2/OptimizationSearchConvergence.test.ts',
                    'tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts',
                    'tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx',
                    'tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx',
                    'scripts/p8-05-valera-browser-audit.mjs','scripts/p8-05-release-handoff.mjs',
                    'scripts/p9-11-candidate.mjs','tests/testUtils/createP911CandidateFixture.mjs',
                ])].sort();
                for(const file of paths){assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file),file);await mkdir(path.dirname(path.join(repository,file)),{recursive:true});await writeFile(path.join(repository,file),'// bounded correction fixture');}
                const commit=()=>{execFileSync('git',['add','.'],{cwd:repository});execFileSync('git',['-c','user.name=sta-ger','-c','user.email=pascaldelger@gmail.com','commit','--quiet','-m','bounded correction fixture'],{cwd:repository});return execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim();};
                const descendant=commit();
                assert.deepEqual(authenticateP805ProductTree(fixture.handoff.candidateId,descendant,repository).changedToolingAndEvidencePaths,paths);
                const environment={POKIE_P911_CANDIDATE_HANDOFF:fixture.reference.path,POKIE_P911_CANDIDATE_HANDOFF_SHA256:fixture.reference.sha256};
                for(const read of [readP911CandidateFromEnvironment,readP911SmokeCandidateFromEnvironment]){
                    const selected=await read(environment,{repository});
                    assert.equal(selected.installationRoot,fixture.handoff.installationRoot);
                    assert.deepEqual(selected.archive,await readFile(fixture.handoff.archivePath));
                    await assert.rejects(()=>read({...environment,POKIE_P911_CANDIDATE_HANDOFF_SHA256:'b'.repeat(64)},{repository}),/digest mismatch/);
                    const driver=await readFile(fixture.handoff.browserDriver.path);
                    try {await writeFile(fixture.handoff.browserDriver.path,'substituted driver');await assert.rejects(()=>read(environment,{repository}),/authenticated controller browser driver required/);}finally{await writeFile(fixture.handoff.browserDriver.path,driver);}
                }
                for(const file of ['src/changed.ts','tsconfig.prod.json','tests/unnamed.test.ts']){
                    await mkdir(path.dirname(path.join(repository,file)),{recursive:true});await writeFile(path.join(repository,file),'protected');
                    const changed=commit();
                    assert.throws(()=>authenticateP805ProductTree(fixture.handoff.candidateId,changed,repository),/new blind retests are required/);
                    for(const read of [readP911CandidateFromEnvironment,readP911SmokeCandidateFromEnvironment])await assert.rejects(()=>read(environment,{repository}),/product[/]build inputs changed/);
                    execFileSync('git',['reset','--hard',descendant],{cwd:repository});
                }
                console.log(JSON.stringify({completeCorrectionAdmitted:true,archivePreserved:true,pinsProtected:true,protectedPaths:3}));
            } finally {await rm(directory,{recursive:true,force:true});}
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 30_000}));
        expect(result).toEqual({completeCorrectionAdmitted: true, archivePreserved: true, pinsProtected: true, protectedPaths: 3});
    });

    it("records budget-exhausted validation as inconclusive and rejects other terminals", async () => {
        const source = await readFile(runner, "utf8");
        expect(source.match(/await runInconclusiveValidation\(/g)).toHaveLength(7);
        expect(source).toContain('await runInconclusiveValidation("packed CLI bounded modeler validate", fixturePath, "json")');
        expect(source).not.toMatch(/await runPackedCli\("packed CLI[^"]*validate"/);
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {describeP805InconclusiveValidation} from './scripts/p8-05-valera-browser-audit.mjs';
            const limitation = 'Analysis outcomes limit exhausted.';
            const stdout = [
                '  valid           yes (structural/contract validation)',
                '  advanced        budget-exhausted: inconclusive (declared-model)',
                '  unknown analysis.completion [$]: ' + limitation,
                '  Limit: ' + limitation,
                'No structural issues found.',
            ].join(String.fromCharCode(10));
            const terminal = {exitCode:2, signal:null, stdout, stderr:''};
            const expected = {exitCode:2, structuralValid:true, status:'inconclusive', advancedStatus:'budget-exhausted', limitation};
            assert.deepEqual(describeP805InconclusiveValidation(terminal), expected);
            const report = {valid:true, errors:[], advanced:{scope:'declared-model', structuralValid:true, status:'budget-exhausted', verdict:'inconclusive', issues:[], limitations:[limitation], checks:[{id:'analysis.completion', status:'unknown', message:limitation}]}};
            const json = value => ({...terminal, stdout:JSON.stringify(value)});
            assert.deepEqual(describeP805InconclusiveValidation(json(report), 'json'), expected);
            // The literal reel-editor fixture also has honest weighting warnings.
            // They do not become structural errors or a completed advanced proof.
            const warnings = [{severity:'warning', code:'blueprint-weighting-pay-mismatch'}];
            assert.deepEqual(describeP805InconclusiveValidation(json({...report, warnings, advanced:{...report.advanced, issues:warnings}}), 'json'), expected);
            let rejected = 0;
            const reject = (value, format = 'text') => {
                assert.throws(() => describeP805InconclusiveValidation(value, format));
                rejected++;
            };
            for (const exitCode of [0, 1, 3, 130, null]) reject({...terminal, exitCode});
            reject({...terminal, signal:'SIGTERM'});
            reject({...terminal, stderr:'cleanup failed'});
            reject({...terminal, stdout:stdout.replace('yes (structural', 'no (structural')});
            reject({...terminal, stdout:stdout + String.fromCharCode(10) + '  violation accounting: mismatch'});
            reject({...terminal, stdout:stdout.replace(limitation, 'Unsupported model.')});
            reject({...terminal, stdout:'not JSON'}, 'json');
            reject(json({...report, valid:false}), 'json');
            reject(json({...report, errors:[{message:'invalid input'}]}), 'json');
            for (const status of ['complete', 'unsupported', 'failed', 'invalid', 'cancelled']) reject(json({...report, advanced:{...report.advanced, status}}), 'json');
            for (const structuralValid of [false, null]) reject(json({...report, advanced:{...report.advanced, structuralValid}}), 'json');
            reject(json({...report, advanced:{...report.advanced, verdict:'violated'}}), 'json');
            reject(json({...report, advanced:{...report.advanced, limitations:[]}}), 'json');
            reject(json({...report, advanced:{...report.advanced, checks:[]}}), 'json');
            reject(json({...report, advanced:{...report.advanced, checks:[...report.advanced.checks, {status:'violation'}]}}), 'json');
            reject(json({...report, advanced:{...report.advanced, issues:[{severity:'error'}]}}), 'json');
            console.log(JSON.stringify({structuralValid:true, advancedProof:false, rejected}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({structuralValid: true, advancedProof: false, rejected: 25});
    });

    it("binds recovery terminals to their captured job and retains failure or slow-job diagnostics", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {readP805RenderedTerminal} from './scripts/p8-05-valera-browser-audit.mjs';
            const pathname = '/api/project/simulations/captured-job';
            const event = (requestId, status = 200) => ({method:'Network.responseReceived', params:{requestId, response:{url:'http://localhost' + pathname, status}}});
            const cdp = (payload, status) => ({events:[event('poll', status)], send:async () => ({body:JSON.stringify(payload)})});
            for (const status of ['completed', 'cancelled']) {
                const payload = {id:'captured-job', status};
                assert.deepEqual((await readP805RenderedTerminal(cdp(payload), 0, pathname, [status], 'expected terminal', 150)).payload, payload);
            }
            await assert.rejects(readP805RenderedTerminal(cdp({id:'captured-job', status:'failed', error:'worker cleanup failed'}), 0, pathname, ['completed'], 'failed retry', 150), /unexpected terminal:.*failed.*worker cleanup failed/);
            await assert.rejects(readP805RenderedTerminal(cdp({id:'captured-job', status:'completed'}, 500), 0, pathname, ['completed'], 'HTTP failure', 150), /unexpected terminal/);
            await assert.rejects(readP805RenderedTerminal(cdp({id:'other-job', status:'completed'}), 0, pathname, ['completed'], 'wrong job', 150), /Timed out/);
            await assert.rejects(readP805RenderedTerminal(cdp({id:'captured-job', status:'running', roundsCompleted:12, requestedRounds:50000}), 0, pathname, ['completed'], 'slow retry', 150), /observed job:.*running.*roundsCompleted.*12.*requestedRounds.*50000/);
            const restored = {events:[event('expired')], send:async (_method, {requestId}) => {
                if (requestId === 'expired') {
                    restored.events.push(event('restored'));
                    throw Error('No resource with given identifier found');
                }
                return {body:JSON.stringify({id:'captured-job', status:'completed'})};
            }};
            assert.equal((await readP805RenderedTerminal(restored, 0, pathname, ['completed'], 'expired poll', 1000)).event.params.requestId, 'restored');
            const reads = [];
            const delayed = {events:[event('preparing')], send:async (_method, {requestId}) => {
                reads.push(requestId);
                return {body:JSON.stringify({id:'captured-job', status:requestId === 'settled' ? 'cancelled' : 'running'})};
            }};
            const timer = setTimeout(() => delayed.events.push(event('settled')), 300);
            try {
                assert.equal((await readP805RenderedTerminal(delayed, 0, pathname, ['cancelled'], 'safe cleanup', 1000)).event.params.requestId, 'settled');
            } finally { clearTimeout(timer); }
            assert.deepEqual(reads, ['preparing', 'settled']);
            console.log(JSON.stringify({expectedTerminals:2, wrongJobRejected:true, failedTerminalRejected:true, httpFailureRejected:true, progressRetained:true, expiredBodyRecovered:true, immutableBodiesReadOnce:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({expectedTerminals: 2, wrongJobRejected: true, failedTerminalRejected: true, httpFailureRejected: true, progressRetained: true, expiredBodyRecovered: true, immutableBodiesReadOnce: true});
    });

    it("observes imported Open preparation before its exact dashboard and retains rejected responses", () => {
        // Synthetic CDP events test the observation boundary only; they are never
        // saved as native browser activation or installed acceptance evidence.
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {setTimeout as delay} from 'node:timers/promises';
            import {observeP805ImportedProjectOpen} from './scripts/p8-05-valera-browser-audit.mjs';
            const priorRoute = '#/';
            const projectRoot = '/resolved package/runtime';
            const expectedRoute = '#/project/' + encodeURIComponent(projectRoot) + '/overview';
            const request = (requestId = 'open') => ({method:'Network.requestWillBeSent', params:{requestId, request:{
                method:'POST', url:'http://localhost/api/home/projects/open', postData:JSON.stringify({projectRoot:'/imported.blueprint.json'})
            }}});
            const response = (requestId = 'open', status = 200) => ({method:'Network.responseReceived', params:{requestId, response:{status}}});
            const fixture = (status = 200, payload = {context:{projectRoot}}) => ({
                events:[request(), response('unrelated', 500), response('open', status)],
                send:async (method, {requestId}) => {
                    assert.equal(method, 'Network.getResponseBody');
                    assert.equal(requestId, 'open');
                    return {body:JSON.stringify(payload)};
                }
            });
            const budget = {responseTimeout:1000, dashboardTimeout:50};
            const slow = fixture();
            slow.events = [request()];
            let bodyRead = false, bodyReads = 0;
            const delayedResponse = delay(180).then(() => slow.events.push(response()));
            const [opened] = await Promise.all([
                observeP805ImportedProjectOpen(slow, async expression => {
                    assert.equal(expression, 'location.hash');
                    assert.equal(bodyRead, true, 'dashboard deadline starts after preparation and body availability');
                    return expectedRoute;
                }, priorRoute, 0, async (id, label) => {
                    assert.equal(id, 'open'); assert.equal(label, 'imported-project Open');
                    bodyReads++; bodyRead = true;
                    return {body:Buffer.from(JSON.stringify({context:{projectRoot}})).toString('base64'), base64Encoded:true};
                }, budget),
                delayedResponse,
            ]);
            assert.equal(bodyReads, 1);
            assert.equal(opened.route, expectedRoute);
            assert.equal(opened.request.browserRequestId, 'open');
            assert.deepEqual(opened.response, {browserRequestId:'open', status:200, projectRoot});
            const noDashboard = async () => { throw Error('must reject before dashboard observation'); };
            await assert.rejects(observeP805ImportedProjectOpen(fixture(409, {error:'Active jobs require confirmation'}), noDashboard, priorRoute, 0), /HTTP 409:.*Active jobs require confirmation/);
            await assert.rejects(observeP805ImportedProjectOpen(fixture(200, {}), noDashboard, priorRoute, 0), /HTTP 200/);
            const duplicate = fixture(); duplicate.events.push(request('second-open'));
            await assert.rejects(observeP805ImportedProjectOpen(duplicate, noDashboard, priorRoute, 0), /exactly one public Open request/);
            const lateDuplicate = fixture();
            await assert.rejects(observeP805ImportedProjectOpen(lateDuplicate, async () => {
                lateDuplicate.events.push(request('late-open')); return expectedRoute;
            }, priorRoute, 0), /duplicate public requests/);
            const unrelatedRoute = '#/project/unrelated/overview';
            await assert.rejects(observeP805ImportedProjectOpen(fixture(), async expression => expression === 'location.hash'
                ? unrelatedRoute : {route:unrelatedRoute, text:'Opening another project'}, priorRoute, 0, undefined, budget),
                error => error.message.includes('expected ' + expectedRoute) && error.message.includes(unrelatedRoute) && error.message.includes('Opening another project'));
            const wrongResponse = fixture(); wrongResponse.events = [request(), response('unrelated')];
            await assert.rejects(observeP805ImportedProjectOpen(wrongResponse, noDashboard, priorRoute, 0, undefined,
                {responseTimeout:50, dashboardTimeout:50}), /Timed out waiting for imported-project Open response/);
            console.log(JSON.stringify({delayedPreparation:true, scopedBodyReader:true, exactDashboard:true, httpFailureRejected:true,
                missingContextRejected:true, duplicateRejected:true, lateDuplicateRejected:true, unrelatedRouteRejected:true, unrelatedResponseRejected:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({delayedPreparation: true, scopedBodyReader: true, exactDashboard: true, httpFailureRejected: true,
            missingContextRejected: true, duplicateRejected: true, lateDuplicateRejected: true, unrelatedRouteRejected: true, unrelatedResponseRejected: true});
    });

    it("waits for imported Open response bytes before starting the dashboard deadline", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {setTimeout as delay} from 'node:timers/promises';
            import {observeP805ImportedProjectOpen} from './scripts/p8-05-valera-browser-audit.mjs';
            const projectRoot = '/resolved library';
            const expectedRoute = '#/project/' + encodeURIComponent(projectRoot) + '/overview';
            const cdp = {events:[
                {method:'Network.requestWillBeSent', params:{requestId:'open', request:{
                    method:'POST', url:'http://localhost/api/home/projects/open', postData:JSON.stringify({projectRoot:'/library'})
                }}},
                {method:'Network.responseReceived', params:{requestId:'open', response:{status:200}}},
            ], send:async () => { throw Error('must use the scoped response-body reader'); }};
            let releaseBody, entered;
            const bodyGate = new Promise(resolve => { releaseBody = resolve; });
            const reading = new Promise(resolve => { entered = resolve; });
            let routeReads = 0, settled = false;
            const evaluate = async expression => {
                assert.equal(expression, 'location.hash');
                routeReads++;
                return expectedRoute;
            };
            const opened = observeP805ImportedProjectOpen(cdp, evaluate, '#/', 0, async (id, label) => {
                assert.equal(id, 'open'); assert.equal(label, 'imported-project Open');
                entered();
                await bodyGate;
                return {body:JSON.stringify({context:{projectRoot}})};
            }, {responseTimeout:50, dashboardTimeout:50});
            opened.then(() => { settled = true; }, () => { settled = true; });
            try {
                await reading;
                // DevTools has response headers but has not exposed its bytes yet.
                // This wait exceeds the dashboard budget without consuming it.
                await delay(100);
                assert.equal(settled, false);
                assert.equal(routeReads, 0);
            } finally { releaseBody(); }
            assert.equal((await opened).route, expectedRoute);
            assert.equal(routeReads, 1);
            routeReads = 0;
            await assert.rejects(observeP805ImportedProjectOpen(cdp, evaluate, '#/', 0, async () => {
                throw Error('imported-project Open browser response body was unavailable: captured request open');
            }), /browser response body was unavailable: captured request open/);
            assert.equal(routeReads, 0);
            console.log(JSON.stringify({delayedBody:true, dashboardBudgetPreserved:true, unavailableBodyRejected:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({delayedBody: true, dashboardBudgetPreserved: true, unavailableBodyRejected: true});
    });

    it("authenticates nested Worker owners and keeps unbound or unauthenticated resources fail-closed", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {spawn} from 'node:child_process';
            import {randomBytes} from 'node:crypto';
            import {mkdtempSync, readFileSync, appendFileSync, rmSync} from 'node:fs';
            import path from 'node:path';
            import {tmpdir} from 'node:os';
            import {once} from 'node:events';
            import {createPc20OwnershipTracker, drainProcessTree, registerPc20OwnedResource} from './scripts/pc-20-release-completion.mjs';
            import {drainP805TrackedOwner} from './scripts/p8-05-valera-browser-audit.mjs';
            const root = mkdtempSync(path.join(tmpdir(), 'p805-nested-worker-'));
            const registry = path.join(root, 'resources.ndjson');
            const secret = randomBytes(32).toString('hex'), operationId = randomBytes(16).toString('hex');
            const hook = path.resolve('scripts/pc-20-resource-ownership-hook.cjs');
            const env = {...process.env, POKIE_PC20_RESOURCE_REGISTRY:registry, POKIE_PC20_RESOURCE_REGISTRY_SECRET:secret, POKIE_PC20_OPERATION_ID:operationId, NODE_OPTIONS:[process.env.NODE_OPTIONS, '--require=' + hook].filter(Boolean).join(' ')};
            const nested = "require('node:worker_threads').parentPort.postMessage('ready'); setInterval(() => {}, 1000);";
            const outer = "const {Worker,parentPort} = require('node:worker_threads'); new Worker(" + JSON.stringify(nested) + ", {eval:true, execArgv:[]}).once('message', () => parentPort.postMessage('ready'));";
            const code = "setTimeout(() => process.exit(99), 5000); const {Worker} = require('node:worker_threads'); new Worker(" + JSON.stringify(outer) + ", {eval:true, execArgv:[]}).once('message', () => process.exit(0));";
            const child = spawn(process.execPath, ['-e', code], {env, detached:true, stdio:'pipe'});
            const tracker = createPc20OwnershipTracker(child.pid, registry, secret, {operationId});
            const owner = {child, tracker};
            try {
                const [exitCode, signal] = await once(child, 'exit');
                assert.equal(exitCode, 0);
                assert.equal(signal, null);
                tracker.capture({final:true});
                const workers = [...tracker.ownedResources.values()].filter(r => r.kind === 'worker');
                assert.equal(workers.length, 2);
                for (const worker of workers) {
                    assert.equal(worker.pid, child.pid);
                    assert.match(worker.processIdentity, /^linux-start-ticks:/);
                    assert.match(worker.resourceId, new RegExp(':process:' + child.pid + '$'));
                }
                assert.equal(workers.some(r => !r.released), true);
                const drained = await drainP805TrackedOwner(owner, 1000);
                assert.equal(drained.processTreeDrained, true);
                assert.equal(drained.resourcesDrained, true);
                assert.equal(drained.ownedProcessIdentities.some(r => r.pid === child.pid), true);
                registerPc20OwnedResource({kind:'worker', resourceId:'unbound-worker'}, 'acquired', env);
                const before = readFileSync(registry);
                const unbound = await drainP805TrackedOwner(owner, 1000);
                assert.equal(unbound.resourcesDrained, false);
                assert.deepEqual(readFileSync(registry), before);
                appendFileSync(registry, JSON.stringify({schemaVersion:1, operationId, action:'released', kind:'worker', resourceId:'unbound-worker', signature:'0'.repeat(64)}) + String.fromCharCode(10));
                await assert.rejects(drainP805TrackedOwner(owner, 1000), /signature|authenticated|ownership/i);
                let captures = 0, drains = 0;
                const unresolved = {child:{}, tracker:{ownedProcesses:new Map(), ownedResources:new Map(), capture() { captures++; }}};
                const live = await drainP805TrackedOwner(unresolved, 1000, async () => { drains++; return {processTreeDrained:false, resourcesDrained:false}; });
                assert.equal(live.processTreeDrained, false);
                assert.equal(captures, 0);
                assert.equal(drains, 1);
                console.log(JSON.stringify({nestedWorkers:workers.length, boundOwnerAbsence:true, unboundRejected:true, invalidSignatureRejected:true, liveOwnerRejected:true}));
            } finally {
                tracker.stop();
                await drainProcessTree(child, 1000, tracker.ownedProcesses, tracker.ownedResources);
                rmSync(root, {recursive:true, force:true});
            }
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({nestedWorkers: 2, boundOwnerAbsence: true, unboundRejected: true, invalidSignatureRejected: true, liveOwnerRejected: true});
    });

    it("exposes a fail-closed public runner command instead of accepting claim objects", () => {
        expect(() => execFileSync(process.execPath, [runner], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
    });

    it("retains accepted tuple receipts and drains every owned child when the next tuple fails", () => {
        const fixture = path.join(process.cwd(), "tests/cli/studio-client/src/p805TupleLedgerNegative.mjs");
        const result = JSON.parse(execFileSync(process.execPath, [fixture], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe"}));
        const {controlledTimeout, ...substitutionCoverage} = result;
        expect(controlledTimeout).toEqual({
            acceptedReceipts: 1,
            failedTuple: {persona: "mathematician", observation: "blueprint", viewport: "compact"},
            aggregatePublished: false,
            failureKind: "timeout",
            terminalStatus: "failed-and-drained",
            initialAcceptedReceiptValidation: "verified",
            finalAcceptedReceiptValidation: "verified",
            revalidatedBeforeTermination: true,
            terminalAndCleanupHashesVerified: true,
            authenticated: true,
            processTreeDrained: true,
            resourcesDrained: true,
            ownedKinds: ["browser", "process", "worker"],
            forcedReleaseKinds: ["browser", "process", "worker"],
            ownedProcessCount: expect.any(Number),
            ownedProcessesVerifiedAbsent: true,
        });
        expect(controlledTimeout.ownedProcessCount).toBeGreaterThanOrEqual(4);
        expect(substitutionCoverage).toEqual({acceptedReceipts: 1, aggregatePublished: false, failureKind: "timeout", cleanupKinds: ["success", "timeout"], retainedFailureKinds: {failure: ["success", "failure"], cancellation: ["success", "cancellation"], "spawn-failure": ["success", "spawn-failure"], restart: ["success", "restart"], "detached-descendant": ["success", "success", "detached-descendant"], "cleanup-substitution": ["success", "failure"]}, rejectedReceiptSubstitutions: {missing: true, stale: true, "cross-candidate": true, "cross-persona": true, "cross-viewport": true, duplicate: true, "content-equivalent": true}, pointerSemanticSubstitutionRejected: true, stateClassSubstitutionRejected: true, runtimeSubstitutionRejected: true, retryTerminalSubstitutionRejected: true, retryTerminalJobSubstitutionRejected: true, retryPreDispatchSubstitutionRejected: true});
    });

    it("discovers reload/restart jobs after an expired first response without accepting another job", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {readP805RenderedJobDiscovery, readP805RenderedResponse, reloadP805Page, P805_DEVTOOLS_OBSERVATION_EVENTS} from './scripts/p8-05-valera-browser-audit.mjs';
            assert.equal(P805_DEVTOOLS_OBSERVATION_EVENTS.includes('Page.lifecycleEvent'), true);
            assert.equal(P805_DEVTOOLS_OBSERVATION_EVENTS.includes('Network.responseReceived'), true);
            assert.equal(P805_DEVTOOLS_OBSERVATION_EVENTS.includes('Network.dataReceived'), false);
            const event = (id) => ({method:'Network.responseReceived', params:{requestId:id, response:{url:'http://localhost/api/project/jobs', status:200}}});
            const reads = [];
            const cdp = {events:[event('before-reload'), event('expired'), event('unrelated')],
                send:async (method, {requestId}) => {
                    reads.push(requestId);
                    if (requestId === 'expired') {
                        cdp.events.push(event('restored'));
                        throw new Error('No resource with given identifier found');
                    }
                    return {body:JSON.stringify({jobs:[{id:requestId === 'restored' ? 'captured-job' : 'other-job'}]})};
                }};
            const discovery = await readP805RenderedJobDiscovery(cdp, 1, 'captured-job', 'reload', 2_000);
            assert.equal(discovery.event.params.requestId, 'restored');
            assert.equal(reads.includes('before-reload'), false);
            assert.equal(reads.includes('expired'), true);
            const restart = await readP805RenderedJobDiscovery(cdp, 1, 'captured-job', 'restart', 2_000);
            assert.equal(restart.payload.jobs[0].id, 'captured-job');
            await assert.rejects(readP805RenderedJobDiscovery({events:[event('unrelated')], send:async () => ({body:'{"jobs":[]}'})}, 0, 'absent', 'missing job', 150), /Timed out waiting for missing job/);
            const pollEvents = [event('expired'), event('old-job')].map(value => ({...value, params:{...value.params, response:{url:'http://localhost/api/project/simulations/captured-job', status:200}}}));
            const poll = {events:pollEvents, send:async (method, {requestId}) => {
                if (requestId === 'expired') { pollEvents.push({...pollEvents[0], params:{...pollEvents[0].params, requestId:'current'}}); throw new Error('expired'); }
                return {body:JSON.stringify({id:requestId === 'current' ? 'captured-job' : 'other-job', status:'running'})};
            }};
            const restored = await readP805RenderedResponse(poll, 0, '/api/project/simulations/captured-job', value => value.id === 'captured-job' && value.status === 'running', 'restored poll', 2_000);
            assert.equal(restored.event.params.requestId, 'current');
            const loader = {events:[], send:async method => {
                if (method === 'Page.getFrameTree') return {frameTree:{frame:{id:'main', loaderId:'old'}}};
                if (method === 'Page.reload') {
                    loader.events.push({method:'Page.lifecycleEvent', params:{name:'load', frameId:'main', loaderId:'old'}});
                    setTimeout(() => loader.events.push({method:'Page.lifecycleEvent', params:{name:'load', frameId:'main', loaderId:'new'}}), 25);
                }
                return {};
            }};
            await reloadP805Page(loader, 2_000);
            assert.equal(loader.events.at(-1).params.loaderId, 'new');
            process.stdout.write(JSON.stringify({reload:'restored', restart:'captured-job', missing:'rejected'}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({reload: "restored", restart: "captured-job", missing: "rejected"});
    });

    it("waits for exact restart project restoration before spending the job discovery deadline", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {readP805RenderedJobDiscovery, readP805RestartJobDiscovery} from './scripts/p8-05-valera-browser-audit.mjs';
            const response = (id, pathname, status = 200) => ({method:'Network.responseReceived', params:{requestId:id, response:{url:'http://localhost'+pathname, status}}});
            const bodies = new Map([
                ['old-context', {status:'loaded', projectRoot:'/restored'}],
                ['other-context', {status:'loaded', projectRoot:'/other'}],
                ['loading', {status:'loading', projectRoot:'/restored'}],
                ['restored-context', {status:'loaded', projectRoot:'/restored'}],
                ['old-list', {jobs:[{id:'captured-job', status:'completed'}]}],
                ['other-list', {jobs:[{id:'other-job', status:'recovery-required'}]}],
                ['restored-list', {jobs:[{id:'captured-job', status:'recovery-required'}]}],
                ['failed-context', {status:'error', projectRoot:'/restored', error:'Runtime preparation failed'}],
            ]);
            const reads = [];
            const cdp = {events:[response('old-context','/api/project/context'), response('old-list','/api/project/jobs')], send:async (method,{requestId}) => {
                reads.push(requestId);
                return {body:JSON.stringify(bodies.get(requestId))};
            }};
            const cursor = cdp.events.length;
            cdp.events.push(response('other-context','/api/project/context'), response('loading','/api/project/context'), response('other-list','/api/project/jobs'));
            // Reproduce the retained failure: document load and an unchanged
            // hash cannot start the list deadline while project Open is pending.
            await assert.rejects(readP805RenderedJobDiscovery(cdp,cursor,'captured-job','premature discovery',100),/Timed out waiting for premature discovery/);
            const restored = readP805RestartJobDiscovery(cdp,cursor,'/restored','captured-job',2_000);
            const delivery = setTimeout(() => {
                cdp.events.push(response('restored-context','/api/project/context'), response('restored-list','/api/project/jobs'));
            },175);
            try {
                const discovery = await restored;
                assert.equal(discovery.event.params.requestId,'restored-list');
                assert.deepEqual(discovery.payload.jobs,[{id:'captured-job',status:'recovery-required'}]);
                assert.equal(reads.includes('old-context'),false);
                assert.equal(reads.includes('old-list'),false);
            } finally {clearTimeout(delivery);}
            const failed = {events:[response('failed-context','/api/project/context',500),response('restored-list','/api/project/jobs')],send:cdp.send};
            await assert.rejects(readP805RestartJobDiscovery(failed,0,'/restored','captured-job',500),/restart project restoration failed.*Runtime preparation failed/);
            const foreign = {events:[response('other-context','/api/project/context'),response('restored-list','/api/project/jobs')],send:cdp.send};
            await assert.rejects(readP805RestartJobDiscovery(foreign,0,'/restored','captured-job',100),/Timed out waiting for restored restart project context/);
            const wrongJob = {events:[response('restored-context','/api/project/context'),response('other-list','/api/project/jobs')],send:cdp.send};
            await assert.rejects(readP805RestartJobDiscovery(wrongJob,0,'/restored','captured-job',100),/Timed out waiting for rendered restart job recovery/);
            process.stdout.write(JSON.stringify({prematureDiscovery:'rejected',restored:'captured-job',stale:'rejected',foreignContext:'rejected',failedContext:'rejected',foreignJob:'rejected'}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({prematureDiscovery: "rejected", restored: "captured-job", stale: "rejected", foreignContext: "rejected", failedContext: "rejected", foreignJob: "rejected"});
    });

    it("builds its own candidate package and executes every packed CLI and rendered Studio persona workflow", async () => {
        // This test owns the local candidate.  It deliberately does not accept
        // controller-provided environment receipts, so a green result cannot
        // be a configuration-only branch or a stale external archive.
        const worktree = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {cwd: process.cwd(), encoding: "utf8"});
        if (worktree.trim()) throw new Error("the packed candidate must be built from a clean committed worktree");
        const candidate = execFileSync("git", ["rev-parse", "HEAD"], {cwd: process.cwd(), encoding: "utf8"}).trim();
        const candidateDirectory = await mkdtemp(path.join(tmpdir(), "p8-05-packed-candidate-"));
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        let passed = false;
        try {
            // The controller reads tuple artifacts from this one operation
            // root.  Keep the final public proof honest about that boundary:
            // a lexical escape or a symlinked checkpoint cannot stand in for
            // a byte-for-byte receipt produced by the packed worker.
            const readOperationArtifact = async (relativePath: string): Promise<Buffer> => {
                expect(path.isAbsolute(relativePath)).toBe(false);
                expect(path.normalize(relativePath)).toBe(relativePath);
                const target = path.resolve(output, relativePath);
                expect(path.relative(output, target)).not.toMatch(/^(?:\.\.(?:[\\/]|$)|$)/);
                const rootMetadata = await lstat(output);
                expect(rootMetadata.isDirectory()).toBe(true);
                expect(rootMetadata.isSymbolicLink()).toBe(false);
                let current = output;
                for (const component of relativePath.split(path.sep)) {
                    current = path.join(current, component);
                    const metadata = await lstat(current);
                    expect(metadata.isSymbolicLink()).toBe(false);
                    expect(current === target ? metadata.isFile() : metadata.isDirectory()).toBe(true);
                }
                return readFile(target);
            };
            // The package test is the browser-bundle boundary: refresh the
            // candidate's Studio assets before packing so this cannot exercise
            // a stale checked-in dist directory while asserting source-only
            // accessibility identities.
            try {
                runCandidateNpm(["run", "build"]);
            } catch (error) {
                const output = error as {stdout?: Buffer | string; stderr?: Buffer | string};
                const asText = (value: Buffer | string | undefined): string => Buffer.isBuffer(value) ? value.toString("utf8") : value ?? "";
                throw new Error(`candidate build failed:\n${asText(output.stdout)}${asText(output.stderr)}`);
            }
            const packed = JSON.parse(runCandidateNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", candidateDirectory])) as Array<{filename: string}>;
            expect(packed).toHaveLength(1);
            const sourceArchivePath = path.join(candidateDirectory, packed[0].filename);
            const archivePath = path.join(candidateDirectory, "candidate-package.tgz");
            const receiptPath = path.join(candidateDirectory, "candidate-executable-receipt.json");
            execFileSync(process.execPath, [verifier, "--source-archive", sourceArchivePath, "--candidate-archive", archivePath, "--candidate", candidate, "--receipt", receiptPath], {encoding: "utf8", stdio: "pipe"});
            const archive = await readFile(archivePath);
            const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
            const receiptSha256 = createHash("sha256").update(await readFile(receiptPath)).digest("hex");
            expect(receipt.authentication.scheme).toBe("verifier-owned-candidate-tree");
            expect(receipt.candidateId).toBe(candidate);
            const personas = ["mathematician", "programmer", "producer", "ui-ux", "graphic-designer"];
            const packageSha256 = createHash("sha256").update(archive).digest("hex");
            // The controller is the exact-candidate parent.  Its public
            // initial-audit phase spawns one fresh child for every
            // persona/observation/viewport tuple, validates that child's
            // immutable receipt and cleanup before the next tuple, and only
            // then hands a complete CLI/Studio matrix to independent review.
            const controllerConfig = path.join(candidateDirectory, "controller-initial-audit.json");
            await writeFile(controllerConfig, JSON.stringify({
                directory: output,
                packedCli: path.join(process.cwd(), "dist/cli/pokie.js"),
                packedPackage: archivePath,
                initialCandidate: {
                    candidateId: candidate,
                    candidatePackageSha256: packageSha256,
                    candidateExecutableSha256: receipt.candidateExecutableSha256,
                    candidateExecutableReceipt: {path: receiptPath, sha256: receiptSha256},
                },
                provenance: {
                    campaignId: "p8-05-exact-candidate-machine-proof",
                    cleanRoomAttestation: "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.",
                },
            }));
            execFileSync(process.execPath, [controller, "initial-audit", "--config", controllerConfig], {encoding: "utf8", stdio: "inherit", timeout: 22_500_000});
            const audit = JSON.parse(await readFile(path.join(output, "initial-mathematician--blueprint--wide-audit.json"), "utf8"));
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.candidatePackageSha256).toBe(packageSha256);
            expect(audit.workflowPersonas).toEqual([audit.persona]);
            expect(audit.worker).toEqual(expect.objectContaining({pid: expect.any(Number), processIdentity: expect.any(String), nonce: expect.any(String), startedAt: expect.any(String)}));
            expect(audit.finalResult).toEqual(expect.objectContaining({status: "passed", aggregation: "verified-checkpoint-receipts-only", chunks: audit.rendered.actions.length, checkpointReceiptSha256s: audit.checkpointReceipts.map((checkpoint: {sha256: string}) => checkpoint.sha256), cleanupEvidenceId: expect.any(String)}));
            expect(audit.checkpointReceipts).toHaveLength(audit.rendered.actions.length);
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            const checkpointSlots = new Set<string>();
            for (const checkpointReceipt of audit.checkpointReceipts as Array<{receiptId: string; path: string; sha256: string; candidateId: string; candidatePackageSha256: string; workerPid: number; workerNonce: string; persona: string; observation: string; viewport: string; actionSha256: string}>) {
                const contents = await readOperationArtifact(checkpointReceipt.path);
                const checkpoint = JSON.parse(contents.toString("utf8"));
                const action = audit.rendered.actions.find((candidate: {persona: string; observation: string; viewport: string}) => candidate.persona === checkpointReceipt.persona && candidate.observation === checkpointReceipt.observation && candidate.viewport === checkpointReceipt.viewport);
                expect(checkpointSlots.has(`${checkpointReceipt.persona}/${checkpointReceipt.observation}/${checkpointReceipt.viewport}`)).toBe(false);
                checkpointSlots.add(`${checkpointReceipt.persona}/${checkpointReceipt.observation}/${checkpointReceipt.viewport}`);
                expect(createHash("sha256").update(contents).digest("hex")).toBe(checkpointReceipt.sha256);
                expect(checkpoint).toEqual(expect.objectContaining({kind: "p8-05-packed-workflow-checkpoint", receiptId: checkpointReceipt.receiptId, auditId: audit.auditId, worker: audit.worker, candidateId: candidate, candidatePackageSha256: audit.candidatePackageSha256, persona: checkpointReceipt.persona, observation: checkpointReceipt.observation, viewport: checkpointReceipt.viewport, action}));
                expect(checkpointReceipt.workerPid).toBe(audit.worker.pid);
                expect(checkpointReceipt.workerNonce).toBe(audit.worker.nonce);
                expect(createHash("sha256").update(JSON.stringify(action)).digest("hex")).toBe(checkpointReceipt.actionSha256);
            }
            expect(checkpointSlots.size).toBe(audit.rendered.actions.length);
            const evidenceContents = async (evidenceId: string): Promise<unknown> => {
                const evidence = audit.evidence.find((item: {evidenceId: string}) => item.evidenceId === evidenceId);
                expect(evidence).toBeDefined();
                return JSON.parse(await readFile(path.join(output, evidence.path), "utf8"));
            };
            const requestOwners = new Map<string, string>();
            for (const action of audit.rendered.actions as Array<{persona: string; viewport: string; observation: string; browserRequestId: string; contextRevalidation: {browserRequestId: string}; terminal: {source: string; browserRequestId?: string}}>) {
                const identities = [
                    ["action", action.browserRequestId],
                    ...(action.contextRevalidation.browserRequestId === action.browserRequestId ? [] : [["context", action.contextRevalidation.browserRequestId] as const]),
                    ...(action.terminal.source === "rendered-poll" ? [["poll", action.terminal.browserRequestId] as const] : []),
                ];
                for (const [kind, requestId] of identities) {
                    expect(requestId).toEqual(expect.any(String));
                    expect(requestId).not.toBe("");
                    if (typeof requestId !== "string" || !requestId) throw new Error("tuple action omitted a correlated browser request identity");
                    expect(requestOwners.has(requestId)).toBe(false);
                    requestOwners.set(requestId, `${action.persona}/${action.viewport}/${action.observation}/${kind}`);
                }
            }
            for (const auditedPersona of audit.workflowPersonas as string[]) {
                const recordedActions = audit.rendered.actions.filter((action: {persona: string}) => action.persona === auditedPersona);
                expect(recordedActions.every((action: {stableControlId: string; interaction: {activation: string; keyboardFocused?: boolean; pointerActivated?: boolean; keyboardActivated?: boolean}; transaction: {pointerActivations: Array<{kind: string; controlId: string; count: number; capturedControlId?: string; captureKey?: string; preDispatchFocus?: {controlId: string; native: boolean}; hitTest?: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch?: {kind: string; pressed: boolean; released: boolean; focus?: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}}>; keyboardActivations?: Array<{kind: string; controlId: string; count: number; nativeFocus?: boolean; preDispatchFocus?: {controlId: string; native: boolean}}>; postTransitionRenderedState?: {capturedControlId: string; captureKey: string; controlState: string; currentControlId: string | null; capturedControlConnected: boolean; requestId: string; resultSha256: string; renderedTerminal: boolean}}}) => {
                    const pointer = action.transaction.pointerActivations[0];
                    const keyboard = action.transaction.keyboardActivations?.[0];
                    const postTransition = action.transaction.postTransitionRenderedState;
                    let replacementStateIsBound = false;
                    if (postTransition?.controlState === "retained") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === true;
                    else if (postTransition?.controlState === "replaced") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === false;
                    else if (postTransition?.controlState === "removed") replacementStateIsBound = postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
                    return action.interaction.activation === "pointer" && action.interaction.pointerActivated === true && action.transaction.pointerActivations.length === 1 && pointer.kind === "pointer" && pointer.controlId === action.stableControlId && pointer.capturedControlId === action.stableControlId && typeof pointer.captureKey === "string" && pointer.captureKey.length > 0 && pointer.preDispatchFocus?.controlId === action.stableControlId && pointer.preDispatchFocus.native && pointer.hitTest?.capturedControlId === action.stableControlId && pointer.hitTest.matchesCapturedControl && pointer.dispatch?.kind === "native-pointer" && pointer.dispatch.pressed && pointer.dispatch.released && pointer.dispatch.focus?.controlId === action.stableControlId && pointer.dispatch.focus.native && pointer.dispatch.focus.targetMatchesCapturedControl && postTransition?.capturedControlId === action.stableControlId && postTransition.captureKey === pointer.captureKey && replacementStateIsBound && postTransition.renderedTerminal === true || action.interaction.activation === "keyboard" && action.interaction.keyboardFocused === true && action.interaction.keyboardActivated === true && action.transaction.keyboardActivations?.length === 1 && keyboard?.kind === "keyboard" && keyboard.nativeFocus === true && keyboard.preDispatchFocus?.controlId === action.stableControlId && keyboard.preDispatchFocus.native && keyboard.controlId === action.stableControlId && keyboard.count === 1;
                })).toBe(true);
                const actions = recordedActions;
                expect(actions.length).toBeGreaterThan(0);
                for (const action of actions as Array<{observation: string; viewport: string; expectedControl: string; expectedMethod: string; expectedApi: string; expectedBodyKind: string | null; expectedArtifact: string | null; screenState: string; screenNavigationControl: string; stableControlId: string; domControlId: string; identityAttribute: string; browserRequestId: string; contextRevalidation: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string; projectStatus: string; completedBeforeSelection: boolean}; interaction: {matchedLabel: string; stableControlId: string; identityAttribute: string; transactionState: string; activation: string; pointerActivated?: boolean; keyboardActivated?: boolean; lifecycle: {kind: string; value: string}}; transaction: {operation: string; stateClass: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null}; formState?: {operation: string; capturedBeforeSubmission: boolean; scope: {identityAttribute: string; value: string; tagName: string}; actionControl: {stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; validation: {valid: boolean; message: string}}; fields: Array<{stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; value: string; disabled: boolean; required: boolean; validation: {valid: boolean; message: string}}>}; confirmation: {required: boolean; state: string; control: null}; pointerActivations: Array<{phase: string; kind: string; controlId: string; count: number}>; keyboardActivations?: Array<{phase: string; kind: string; controlId: string; count: number}>; request: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string}; terminal: {resultSha256: string; source: string}}; precondition: {enabled: boolean; disabled: boolean; disabledExplanation: null; accessibleName: string}; accessibility: {namedRegions: string[]; visibleFocus: boolean; unexplainedDisabledControls: number}; visibleTerminal: {state: string; changedAfterRequest: boolean; observedAfterRequestId: string; beforeTextSha256: string; textSha256: string; resultSha256: string; lifecycle: {role: string; terminal: string; text: string; stateClass: string; controlId?: string; jobId?: string; target?: string; outputPath?: string; artifact: {name: string; accessibleName: string; target?: string; outputPath?: string} | null}}; terminal: {source: string; resultSha256: string; jobId?: string; result?: {result?: {target?: string; outputPath?: string}}}; evidenceId: string; screenshotEvidenceId: string; elapsedMs: number}>) {
                    expect(actions.filter((candidate: {observation: string; viewport: string}) => candidate.observation === action.observation && candidate.viewport === action.viewport)).toHaveLength(1);
                    let expectedTransactionState = "editable-submission";
                    if (action.interaction.lifecycle.kind === "navigation") expectedTransactionState = "navigation";
                    else if (action.expectedMethod === "GET") expectedTransactionState = "read-only-operation";
                    const formState = action.transaction.formState;
                    const requiresEditableForm = expectedTransactionState === "editable-submission";
                    const pointerActivation = action.transaction.pointerActivations[0];
                    const keyboardActivation = action.transaction.keyboardActivations?.[0];
                    const pointerSemantic = pointerActivation as typeof pointerActivation & {capturedControlId?: string; captureKey?: string; preDispatchFocus?: {controlId: string; native: boolean}; hitTest?: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch?: {kind: string; pressed: boolean; released: boolean; focus?: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}};
                    const keyboardSemantic = keyboardActivation as typeof keyboardActivation & {nativeFocus?: boolean; preDispatchFocus?: {controlId: string; native: boolean}};
                    const keyboardFocused = (action.interaction as typeof action.interaction & {keyboardFocused?: boolean}).keyboardFocused;
                    const postTransition = (action.transaction as typeof action.transaction & {postTransitionRenderedState?: {capturedControlId: string; captureKey: string; controlState: string; currentControlId: string | null; capturedControlConnected: boolean; requestId: string; resultSha256: string; renderedTerminal: boolean}}).postTransitionRenderedState;
                    let replacementStateIsBound = false;
                    if (postTransition?.controlState === "retained") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === true;
                    else if (postTransition?.controlState === "replaced") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === false;
                    else if (postTransition?.controlState === "removed") replacementStateIsBound = postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
                    const renderedActivation = action.interaction.activation === "pointer"
                        ? action.interaction.pointerActivated === true && action.transaction.pointerActivations.length === 1 && pointerActivation.phase === "operation" && pointerActivation.kind === "pointer" && pointerActivation.controlId === action.stableControlId && pointerActivation.count === 1 && pointerSemantic.capturedControlId === action.stableControlId && typeof pointerSemantic.captureKey === "string" && pointerSemantic.captureKey.length > 0 && pointerSemantic.preDispatchFocus?.controlId === action.stableControlId && pointerSemantic.preDispatchFocus.native && pointerSemantic.hitTest?.capturedControlId === action.stableControlId && pointerSemantic.hitTest.matchesCapturedControl && pointerSemantic.dispatch?.kind === "native-pointer" && pointerSemantic.dispatch.pressed && pointerSemantic.dispatch.released && pointerSemantic.dispatch.focus?.controlId === action.stableControlId && pointerSemantic.dispatch.focus.native && pointerSemantic.dispatch.focus.targetMatchesCapturedControl && postTransition?.capturedControlId === action.stableControlId && postTransition.captureKey === pointerSemantic.captureKey && replacementStateIsBound && postTransition?.requestId === action.browserRequestId && postTransition?.resultSha256 === action.terminal.resultSha256 && postTransition?.renderedTerminal === true
                        : action.interaction.activation === "keyboard" && keyboardFocused === true && action.interaction.keyboardActivated === true && action.transaction.keyboardActivations?.length === 1 && keyboardActivation?.phase === "operation" && keyboardActivation.kind === "keyboard" && keyboardSemantic.nativeFocus === true && keyboardSemantic.preDispatchFocus?.controlId === action.stableControlId && keyboardSemantic.preDispatchFocus.native && keyboardActivation.controlId === action.stableControlId && keyboardActivation.count === 1;
                    const renderedTerminalIsBound = action.visibleTerminal.lifecycle.controlId === action.stableControlId && action.visibleTerminal.lifecycle.stateClass === action.transaction.stateClass && (action.terminal.source !== "rendered-poll" || action.visibleTerminal.lifecycle.jobId === action.terminal.jobId);
                    if (formState !== undefined) {
                        expect(formState.scope).toEqual({identityAttribute: "data-pokie-lifecycle-form", value: action.transaction.operation, tagName: expect.any(String)});
                        expect(formState.actionControl).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                        for (const field of formState.fields) expect(field).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                    }
                    expect(Boolean(action.expectedControl) && (/^\/api\//).test(action.expectedApi) && action.screenState.length > 0 && action.screenNavigationControl === action.expectedControl && Boolean(action.stableControlId) && action.domControlId === action.stableControlId && action.identityAttribute === "id" && action.contextRevalidation.method === "GET" && action.contextRevalidation.path === "/api/project/context" && action.contextRevalidation.status >= 200 && action.contextRevalidation.status < 400 && (/^[a-f0-9]{64}$/i).test(action.contextRevalidation.responseSha256) && ["loaded", "outcome-source", "artifact"].includes(action.contextRevalidation.projectStatus) && action.contextRevalidation.completedBeforeSelection && Boolean(action.contextRevalidation.browserRequestId) && action.interaction.stableControlId === action.stableControlId && action.interaction.identityAttribute === "id" && action.interaction.transactionState === expectedTransactionState && Boolean(action.interaction.lifecycle.kind) && Boolean(action.interaction.lifecycle.value) && Boolean(action.browserRequestId) && action.precondition.enabled && !action.precondition.disabled && action.precondition.disabledExplanation === null && action.precondition.accessibleName === action.interaction.matchedLabel && action.transaction.operation === action.interaction.lifecycle.value && action.transaction.stateClass === expectedTransactionState && action.transaction.control.stableControlId === action.stableControlId && action.transaction.control.accessibleName === action.interaction.matchedLabel && action.transaction.control.enabled && !action.transaction.control.disabled && action.transaction.control.disabledExplanation === null && (requiresEditableForm ? formState !== undefined && formState.operation === action.transaction.operation && formState.capturedBeforeSubmission && formState.actionControl.stableControlId === action.transaction.control.stableControlId && formState.actionControl.identityAttribute === "id" && formState.actionControl.accessibleName === action.transaction.control.accessibleName && formState.fields.length > 0 && formState.fields.every((field) => field.identityAttribute === "id" && Boolean(field.stableControlId) && Boolean(field.accessibleName) && !field.disabled && field.validation.valid && typeof field.validation.message === "string") : formState === undefined) && !action.transaction.confirmation.required && action.transaction.confirmation.state === "not-required" && action.transaction.confirmation.control === null && renderedActivation && action.transaction.request.browserRequestId === action.browserRequestId && action.transaction.request.method === action.expectedMethod && action.transaction.request.path === action.expectedApi && action.transaction.request.status >= 200 && action.transaction.request.status < 400 && (/^[a-f0-9]{64}$/i).test(action.transaction.request.responseSha256) && action.transaction.terminal.resultSha256 === action.terminal.resultSha256 && ["response", "rendered-poll"].includes(action.transaction.terminal.source) && action.visibleTerminal.state === "rendered" && action.visibleTerminal.changedAfterRequest && action.visibleTerminal.observedAfterRequestId === action.browserRequestId && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.beforeTextSha256) && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.textSha256) && action.visibleTerminal.beforeTextSha256 !== action.visibleTerminal.textSha256 && action.visibleTerminal.resultSha256 === action.terminal.resultSha256 && Boolean(action.visibleTerminal.lifecycle.role) && Boolean(action.visibleTerminal.lifecycle.terminal) && Boolean(action.visibleTerminal.lifecycle.text) && renderedTerminalIsBound && (action.expectedBodyKind === null || action.expectedArtifact === null || (action.visibleTerminal.lifecycle.artifact?.name === action.expectedArtifact && Boolean(action.visibleTerminal.lifecycle.artifact.accessibleName))) && (/^[a-f0-9]{64}$/i).test(action.terminal.resultSha256) && action.accessibility.namedRegions.length > 0 && action.accessibility.visibleFocus && action.accessibility.unexplainedDisabledControls === 0 && Boolean(action.evidenceId) && Boolean(action.screenshotEvidenceId) && action.elapsedMs > 0).toBe(true);
                }
            }
            if (audit.tuple.persona === "mathematician" && audit.tuple.observation === "outcome-library-report-diff-replay") {
                type OutcomeLibraryAction = {
                    expectedControl: string;
                    expectedMethod: string;
                    expectedApi: string;
                    stableControlId: string;
                    terminal: {jobId?: string; status: string};
                    transaction: {
                        preflight?: {state: string; status: string; controlId: string; cardLabel: string; enabled: boolean; disabled: boolean};
                        pointerActivations: Array<{kind: string; controlId: string; capturedControlId?: string; preDispatchFocus?: {controlId: string; native: boolean}; hitTest?: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch?: {kind: string; pressed: boolean; released: boolean; focus?: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}}>;
                    };
                    visibleTerminal: {lifecycle: {controlId?: string; operation?: string; receipt?: string; requestId?: string; progressSnapshots?: string; durableJobId?: string; durableStatus?: string; artifact: {name: string; accessibleName: string; outputPath?: string} | null}};
                };
                const outcomeActions = audit.rendered.actions.filter((action: {observation: string}) => action.observation === audit.tuple.observation) as OutcomeLibraryAction[];
                const [action] = outcomeActions;
                const [pointer] = action.transaction.pointerActivations;
                expect(outcomeActions).toHaveLength(1);
                expect(action.expectedControl).toBe("Generate exact outcome library");
                expect(action.expectedMethod).toBe("POST");
                expect(action.expectedApi).toBe("/api/project/outcome-libraries/generate/jobs");
                expect(action.stableControlId).toBe("outcome-library-generate");
                expect(action.transaction.preflight).toEqual({state: "ready", status: "ok", controlId: "outcome-library-generate", cardLabel: "Outcome library generator", enabled: true, disabled: false});
                expect(pointer).toEqual(expect.objectContaining({kind: "pointer", controlId: "outcome-library-generate", capturedControlId: "outcome-library-generate", preDispatchFocus: {controlId: "outcome-library-generate", native: true}, hitTest: expect.objectContaining({capturedControlId: "outcome-library-generate", matchesCapturedControl: true}), dispatch: expect.objectContaining({kind: "native-pointer", pressed: true, released: true, focus: expect.objectContaining({controlId: "outcome-library-generate", native: true, targetMatchesCapturedControl: true})})}));
                expect(action.visibleTerminal.lifecycle).toEqual(expect.objectContaining({controlId: "outcome-library-generate", operation: "outcome-library", receipt: "durable-terminal", requestId: expect.stringMatching(/^outcome-library-/), progressSnapshots: expect.stringMatching(/^[2-9][0-9]*$/), durableJobId: action.terminal.jobId, durableStatus: action.terminal.status, artifact: expect.objectContaining({name: "outcome-library", accessibleName: expect.any(String), outputPath: expect.any(String)})}));
                const compoundOutputs = audit.workflowScope.compoundCliOutputs as Array<{output: string; command: string; candidateId: string; candidatePackageSha256: string; candidateExecutableSha256: string; sha256: string; files: Array<{path: string; sha256: string; sizeBytes: number; contentsBase64: string}>; evidenceId: string}>;
                expect(compoundOutputs.map(({output, command}) => ({output, command}))).toEqual([
                    {output: "outcome-library-export", command: "packed CLI Outcome Library export"},
                    {output: "simulation-report-source", command: "packed CLI simulation report source"},
                    {output: "report", command: "packed CLI report"},
                    {output: "diff", command: "packed CLI diff"},
                    {output: "replay", command: "packed CLI replay"},
                ]);
                for (const cliOutput of compoundOutputs) {
                    expect(cliOutput).toEqual(expect.objectContaining({candidateId: candidate, candidatePackageSha256: packageSha256, candidateExecutableSha256: receipt.candidateExecutableSha256, sha256: expect.stringMatching(/^[a-f0-9]{64}$/), evidenceId: expect.any(String)}));
                    expect(cliOutput.files.length).toBeGreaterThan(0);
                    expect(cliOutput.files.every((file) => file.path.length > 0 && file.sizeBytes > 0 && createHash("sha256").update(Buffer.from(file.contentsBase64, "base64")).digest("hex") === file.sha256)).toBe(true);
                    const evidence = audit.evidence.find((item: {evidenceId: string}) => item.evidenceId === cliOutput.evidenceId) as {path: string} | undefined;
                    expect(evidence).toBeDefined();
                    const persisted = JSON.parse(await readFile(path.join(output, evidence!.path), "utf8"));
                    expect(persisted).toEqual(expect.objectContaining({kind: "p8-05-packed-cli-output", output: cliOutput.output, candidateId: candidate, candidatePackageSha256: packageSha256, candidateExecutableSha256: receipt.candidateExecutableSha256, files: cliOutput.files}));
                }
            }
            const completeWorkflow = ["simulation-success-failure-cancellation", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "reload-reconnect-recovery-cancellation-project-switch"].includes(audit.tuple.observation);
            expect(audit.workflowScope).toEqual(expect.objectContaining({kind: "p8-05-single-tuple-workflow-scope", tuple: audit.tuple, recoveryRequired: completeWorkflow, scopeEvidenceId: expect.any(String)}));
            expect(audit.workflowScope.bootstrap.length).toBeGreaterThanOrEqual(3);
            if (completeWorkflow) {
                expect(audit.rendered.recovery).toEqual(expect.objectContaining({reloadReconnect: expect.objectContaining({observed: true}), projectSwitch: expect.objectContaining({observed: true}), staleResponseIsolation: expect.objectContaining({observed: true}), unsavedWorkProtection: expect.objectContaining({observed: true}), serverRestart: expect.objectContaining({observed: true})}));
                expect(audit.rendered.jobs).toEqual(expect.objectContaining({success: expect.objectContaining({observed: true}), actionableFailure: expect.objectContaining({observed: true}), cooperativeCancellation: expect.objectContaining({observed: true}), retryWithoutPartialArtifacts: expect.objectContaining({observed: true})}));
            } else {
                expect(audit.rendered.recovery).toEqual({});
                expect(audit.rendered.jobs).toEqual({});
            }
            if (completeWorkflow) {
                const pageState = await evidenceContents(audit.rendered.jobs.cooperativeCancellation.evidenceId) as {transactions: Record<string, {operation: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null}; formState?: {operation: string; capturedBeforeSubmission: boolean; actionControl: {stableControlId: string; identityAttribute: string; accessibleName: string}; fields: Array<{stableControlId: string; identityAttribute: string; accessibleName: string; value: string; disabled: boolean; validation: {valid: boolean; message: string}}>} ; confirmation: {required: boolean; state: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null} | null; activation?: {kind: string; controlId: string; count: number}}; viewport: {width: number; height: number}; pointerActivations: Array<{kind: string; controlId: string; count: number}>; keyboardActivations: Array<{phase: string; controlId: string; count: number}>; request: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string}; terminal: {status: string; resultSha256: string; source: string; pollPath: string; browserRequestId: string; causedByRequestId: string}}>; restart: {activeJobId: string; terminal: {id: string; status: string}; receipt: {terminal: {status: string; jobId: string; causedByRequestId: string; resultSha256: string}; recoveryResponse: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string; jobSha256: string}}}; unsavedWork: {editControl: {stableControlId: string; identityAttribute: string; accessibleName: string; keyboardFocused: boolean; input: {kind: string; text: string; value: string}}; navigationControl: {stableControlId: string; identityAttribute: string; accessibleName: string; activation: {kind: string; controlId: string; count: number}}; cancelControl: {stableControlId: string; identityAttribute: string; accessibleName: string; keyboardFocused: boolean; activation: {kind: string; controlId: string; count: number}}}; projectSwitchReceipt: {cancelledProjectOpen: {routeBefore: string; routeAfter: string; projectOpenRequestCount: number; stayControl: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean}; stayActivation: {kind: string; controlId: string; count: number; capturedControlId: string}}; startGameNavigation: {routeBefore: string; routeAfter: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean}; activation: {kind: string; controlId: string; count: number; capturedControlId: string}}; createdProject: {route: string; control: {stableControlId: string; accessibleName: string}; activation: {kind: string; controlId: string; count: number}}; staleResponse: {responseCount: number; delayedRequestId: string; completedAfterSwitch: boolean; sourceRoute: string; destinationRoute: string}; destinationRoute: string}};
                const measuredViewport = {wide: {width: 1440, height: 900}, compact: {width: 960, height: 800}, narrow: {width: 390, height: 844}}[audit.tuple.viewport as "wide" | "compact" | "narrow"];
                for (const transaction of Object.values(pageState.transactions)) {
                    expect(transaction.viewport).toEqual(measuredViewport);
                    expect(transaction.pointerActivations.length + transaction.keyboardActivations.length).toBe(1);
                }
                for (const [name, status, terminal] of [["replayFailure", 400, "error"], ["replayRecovery", 200, "loaded"]] as const) {
                    const transaction = pageState.transactions[name];
                    expect(transaction.operation).toBe("replay-artifact");
                    expect(transaction.control.stableControlId).toBe("replay-artifact-load");
                    expect(transaction.request).toEqual(expect.objectContaining({method: "POST", path: "/api/project/replays/inspect-artifact", status}));
                    expect(transaction.terminal).toEqual(expect.objectContaining({source: "response", status: terminal, causedByRequestId: transaction.request.browserRequestId}));
                }
                const confirmedTransactions = [pageState.transactions.activeReloadCancellation, pageState.transactions.cooperativeCancellation];
                for (const transaction of confirmedTransactions) {
                    expect(transaction.operation).toBe("simulation-cancel");
                    expect(transaction.control).toEqual(expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null}));
                    expect(transaction.confirmation).toEqual(expect.objectContaining({required: true, state: "confirmed", control: expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null})}));
                    expect(transaction.keyboardActivations).toEqual([]);
                    expect(transaction.pointerActivations).toEqual([expect.objectContaining({kind: "pointer", controlId: transaction.control.stableControlId, count: 1})]);
                    expect(transaction.confirmation.activation).toEqual(expect.objectContaining({kind: "pointer", controlId: transaction.confirmation.control?.stableControlId, count: 1}));
                }
                expect(pageState.transactions.projectValidation).toEqual(expect.objectContaining({
                    operation: "project-validation",
                    control: expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null}),
                    confirmation: {required: false, state: "not-required", control: null},
                    keyboardActivations: [],
                    pointerActivations: [expect.objectContaining({kind: "pointer", controlId: expect.any(String), count: 1})],
                    request: expect.objectContaining({method: "GET", path: "/api/project/validate", status: 200, browserRequestId: expect.any(String)}),
                    terminal: expect.objectContaining({status: "completed", source: "response", causedByRequestId: expect.any(String)}),
                }));
                expect(pageState.transactions.projectValidation.terminal.causedByRequestId).toBe(pageState.transactions.projectValidation.request.browserRequestId);
                expect(pageState.unsavedWork.editControl).toEqual(expect.objectContaining({stableControlId: expect.any(String), identityAttribute: "id", accessibleName: expect.any(String), keyboardFocused: true, input: expect.objectContaining({kind: "native-text", text: " P805 unsaved", value: expect.stringContaining(" P805 unsaved")})}));
                for (const control of [pageState.unsavedWork.navigationControl, pageState.unsavedWork.cancelControl]) {
                    expect(control).toEqual(expect.objectContaining({stableControlId: expect.any(String), identityAttribute: "id", accessibleName: expect.any(String)}));
                    expect(control.activation).toEqual(expect.objectContaining({kind: control === pageState.unsavedWork.navigationControl ? "keyboard" : "pointer", controlId: control.stableControlId, count: 1}));
                }
                const projectSwitch = pageState.projectSwitchReceipt;
                expect(projectSwitch.cancelledProjectOpen).toEqual(expect.objectContaining({routeBefore: "#/home/projects", routeAfter: "#/home/projects", projectOpenRequestCount: 0, stayControl: expect.objectContaining({stableControlId: "design-navigation-guard-stay", accessibleName: "Stay", enabled: true, disabled: false}), stayActivation: expect.objectContaining({kind: "pointer", controlId: "design-navigation-guard-stay", capturedControlId: "design-navigation-guard-stay", count: 1})}));
                expect(projectSwitch.startGameNavigation).toEqual(expect.objectContaining({routeBefore: projectSwitch.cancelledProjectOpen.routeAfter, routeAfter: "#/home/design", control: expect.objectContaining({stableControlId: "home-tab:design", accessibleName: "Start a game", enabled: true, disabled: false}), activation: expect.objectContaining({kind: "pointer", controlId: "home-tab:design", capturedControlId: "home-tab:design", count: 1})}));
                expect(projectSwitch.createdProject).toEqual(expect.objectContaining({route: projectSwitch.destinationRoute, control: expect.objectContaining({stableControlId: "blueprint-create-game", accessibleName: "Create game"}), activation: expect.objectContaining({kind: "pointer", controlId: "blueprint-create-game", count: 1})}));
                expect(projectSwitch.destinationRoute).toMatch(/^#\/project(?:\/[^/]+){1,2}$/);
                expect(projectSwitch.staleResponse).toEqual(expect.objectContaining({responseCount: expect.any(Number), delayedRequestId: expect.any(String), completedAfterSwitch: true, sourceRoute: projectSwitch.cancelledProjectOpen.routeBefore, destinationRoute: projectSwitch.destinationRoute}));
                for (const name of ["activeReloadStart", "activeReloadCancellation", "simulationSuccess", "replaySuccess", "cancellableSimulation", "cooperativeCancellation", "simulationRetry"]) {
                    const transaction = pageState.transactions[name];
                    expect(transaction.request).toEqual(expect.objectContaining({browserRequestId: expect.any(String), method: expect.any(String), path: expect.any(String), status: expect.any(Number), responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/)}));
                    expect(transaction.terminal).toEqual(expect.objectContaining({resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/), source: "rendered-poll", pollPath: expect.any(String), browserRequestId: expect.any(String), causedByRequestId: transaction.request.browserRequestId}));
                }
                // Restart reconciliation is delivered by the durable jobs
                // list after the original executor is lost, without a poll
                // response from that executor or another native activation.
                expect(pageState.transactions.restartSimulation.terminal).toBeUndefined();
                expect(pageState.restart.terminal).toEqual(expect.objectContaining({id: pageState.restart.activeJobId, status: "recovery-required"}));
                expect(pageState.restart.receipt.terminal).toEqual(expect.objectContaining({status: "recovery-required", jobId: pageState.restart.activeJobId, causedByRequestId: pageState.transactions.restartSimulation.request.browserRequestId}));
                expect(pageState.restart.receipt.recoveryResponse).toEqual(expect.objectContaining({browserRequestId: expect.any(String), method: "GET", path: "/api/project/jobs", status: 200, responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/), jobSha256: pageState.restart.receipt.terminal.resultSha256}));
                expect(createHash("sha256").update(JSON.stringify(pageState.restart.terminal)).digest("hex")).toBe(pageState.restart.receipt.recoveryResponse.jobSha256);
                // Durable recovery starts share the same form-state-first
                // contract as the persona matrix.  A route change plus an API
                // call must not be enough to manufacture a simulation or replay
                // lifecycle receipt.
                for (const name of ["activeReloadStart", "simulationFailure", "simulationSuccess", "replayFailure", "replaySuccess", "replayRecovery", "cancellableSimulation", "restartSimulation"]) {
                    const transaction = pageState.transactions[name];
                    expect(transaction.formState).toEqual(expect.objectContaining({
                        operation: transaction.operation,
                        capturedBeforeSubmission: true,
                        actionControl: expect.objectContaining({stableControlId: transaction.control.stableControlId, identityAttribute: "id", accessibleName: transaction.control.accessibleName}),
                        fields: expect.arrayContaining([expect.objectContaining({identityAttribute: "id", stableControlId: expect.any(String), accessibleName: expect.any(String), disabled: false, validation: expect.objectContaining({valid: expect.any(Boolean), message: expect.any(String)})})]),
                    }));
                }
            }
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            expect(audit.evidence.some((item: {kind: string}) => item.kind === "screenshot")).toBe(true);
            const aggregatePath = path.join(output, "initial-process-isolated-packed-proof.json");
            const aggregate = JSON.parse((await readOperationArtifact(path.basename(aggregatePath))).toString("utf8"));
            const tupleChildren = aggregate.children as PackedTupleChild[];
            const controllerProof = JSON.parse((await readOperationArtifact("initial-controller-machine-proof.json")).toString("utf8"));
            const requiredObservations: Record<string, string[]> = {
                mathematician: ["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-success-failure-cancellation", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "certification-conditional", "fairness-conditional", "build-export-output-folder", "import-export-defaults"],
                programmer: ["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery", "build-export-output-folder"],
                producer: ["product-framing", "end-to-end-navigation", "trust"],
                "ui-ux": ["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
                "graphic-designer": ["hierarchy-typography-spacing-density-controls-finish"],
            };
            const expectedTuples = personas.flatMap((persona) => requiredObservations[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => `${persona}/${observation}/${viewport}`)));
            expect(aggregate).toEqual(expect.objectContaining({schemaVersion: 1, kind: "p8-05-process-isolated-packed-proof", candidateId: candidate, candidatePackageSha256: packageSha256, status: "passed", parent: expect.objectContaining({pid: expect.any(Number), processIdentity: expect.any(String), nonce: expect.any(String)}), finalResult: expect.objectContaining({status: "passed", children: expectedTuples.length, checkpointReceipts: expectedTuples.length, aggregation: "independently-verified-immutable-tuple-child-receipts-only"})}));
            expect(aggregate.acceptedReceipts).toHaveLength(expectedTuples.length);
            expect(aggregate.acceptedReceiptValidation).toEqual({
                checkedAt: expect.any(String),
                status: "verified",
                receipts: tupleChildren.map((child: {tuple: unknown; tupleReceiptSha256: string; cleanupSha256: string; auditSha256: string}) => ({
                    tuple: child.tuple,
                    status: "verified",
                    tupleReceiptSha256: child.tupleReceiptSha256,
                    cleanupSha256: child.cleanupSha256,
                    auditSha256: child.auditSha256,
                })),
            });
            expect((await readdir(output)).filter((name) => name.includes("process-isolated-packed-proof.failed-") || name.includes("-supervisor-") && name.endsWith("-terminal.json"))).toEqual([]);
            expect(controllerProof).toEqual(expect.objectContaining({
                schemaVersion: 4,
                kind: "p8-05-controller-machine-proof",
                status: "passed",
                execution: "controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
                phase: "initial",
                candidateId: candidate,
                candidatePackageSha256: packageSha256,
                candidateExecutableSha256: receipt.candidateExecutableSha256,
                proofLedger: {
                    path: "initial-process-isolated-packed-proof.json",
                    sha256: createHash("sha256").update(await readFile(aggregatePath)).digest("hex"),
                    operationRoot: aggregate.operationRoot,
                    candidateId: candidate,
                    candidatePackageSha256: packageSha256,
                    status: "passed",
                    aggregation: "independently-verified-immutable-tuple-child-receipts-only",
                },
                tuples: expectedTuples,
                audits: expect.objectContaining({count: 5, personas, ids: expect.arrayContaining([expect.any(String)]), tupleReceiptAuditIds: expect.arrayContaining([expect.any(String)])}),
            }));
            expect(controllerProof.audits.ids).toHaveLength(personas.length);
            expect(new Set(controllerProof.audits.ids).size).toBe(personas.length);
            expect(controllerProof.audits.tupleReceiptAuditIds).toEqual(aggregate.acceptedReceipts.map((accepted: {receipt: {auditId: string}}) => accepted.receipt.auditId));
            expect(controllerProof.audits.tupleEvidence).toEqual(tupleChildren.map((child: {tuple: unknown; auditPath: string; auditSha256: string; tupleReceiptPath: string; tupleReceiptSha256: string; cleanupPath: string; cleanupSha256: string; checkpointReceiptSha256s: string[]; cleanupEvidenceId: string}, index: number) => ({
                tuple: child.tuple,
                auditId: aggregate.acceptedReceipts[index].receipt.auditId,
                auditPath: child.auditPath,
                auditSha256: child.auditSha256,
                tupleReceiptPath: child.tupleReceiptPath,
                tupleReceiptSha256: child.tupleReceiptSha256,
                cleanupPath: child.cleanupPath,
                cleanupSha256: child.cleanupSha256,
                checkpointReceiptSha256: child.checkpointReceiptSha256s[0],
                actionSha256: aggregate.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256,
                cleanupEvidenceId: child.cleanupEvidenceId,
            })));
            const retryReceipts = controllerProof.audits.retryTerminalEvidence as Array<{operation: string; controlId: string; stateClass: string; activation: {capturedControlId: string; preDispatchFocus: {controlId: string; native: boolean}; hitTest: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch: {kind: string; pressed: boolean; released: boolean; focus: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}}; request: {browserRequestId: string; method: string; path: string}; terminal: {jobId: string; status: string; causedByRequestId: string}; rendered: {resultControlId: string; resultOperation: string; resultStateClass: string; resultReceipt: string; resultJobId: string; resultTerminal: string; renderedTerminal: boolean}}>;
            expect(retryReceipts).toHaveLength(12);
            expect(retryReceipts.every((receipt) => receipt.operation === "simulation-retry" && receipt.controlId === "simulation-retry" && receipt.stateClass === "recovery-operation" && receipt.activation.capturedControlId === receipt.controlId && receipt.activation.preDispatchFocus.controlId === receipt.controlId && receipt.activation.preDispatchFocus.native && receipt.activation.hitTest.capturedControlId === receipt.controlId && receipt.activation.hitTest.matchesCapturedControl && receipt.activation.dispatch.kind === "native-pointer" && receipt.activation.dispatch.pressed && receipt.activation.dispatch.released && receipt.activation.dispatch.focus.controlId === receipt.controlId && receipt.activation.dispatch.focus.native && receipt.activation.dispatch.focus.targetMatchesCapturedControl && receipt.request.method === "POST" && receipt.request.path === "/api/project/simulations" && Boolean(receipt.request.browserRequestId) && receipt.terminal.status === "completed" && Boolean(receipt.terminal.jobId) && receipt.terminal.causedByRequestId === receipt.request.browserRequestId && receipt.rendered.resultControlId === receipt.controlId && receipt.rendered.resultOperation === receipt.operation && receipt.rendered.resultStateClass === receipt.stateClass && receipt.rendered.resultReceipt === "durable-terminal" && receipt.rendered.resultJobId === receipt.terminal.jobId && receipt.rendered.resultTerminal === receipt.terminal.status && receipt.rendered.renderedTerminal)).toBe(true);
            const restartRecoveryReceipts = controllerProof.audits.restartRecoveryTerminalEvidence as Array<{operation: string; controlId: string; stateClass: string; capturedJobId: string; transaction: {request: {browserRequestId: string; method: string; path: string}; pointerActivations: Array<{capturedControlId: string; captureKey: string; dispatch: {kind: string; pressed: boolean; released: boolean; focus: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}}>}; terminal: {jobId: string; status: string; causedByRequestId: string}; rendered: {resultControlId: string; resultOperation: string; resultStateClass: string; resultReceipt: string; resultJobId: string; resultRequestId: string; resultTerminal: string; resultRecovery: string; resultExecutor: string; renderedTerminal: boolean; postRestartReplacementState: {capturedControlId: string; captureKey: string; controlState: string; currentControlId: string; capturedControlConnected: boolean}}; ownedProcessDrain: {processTreeDrained: boolean; resourcesDrained: boolean; priorStudioShutdown: {shutdown: {kind: string; gracefulShutdownReceived: boolean; requestedSignal: string; observedSignal: string}; processStateBeforeLoss: {status: string; updatedAt: number}; durableJob: {id: string; operation: string; status: string; terminal: boolean; causedByRequestId: string}}}}>;
            expect(restartRecoveryReceipts).toHaveLength(12);
            expect(restartRecoveryReceipts.every((receipt) => receipt.operation === "simulation" && receipt.controlId === "simulation-run" && receipt.stateClass === "editable-submission" && receipt.transaction.request.method === "POST" && receipt.transaction.request.path === "/api/project/simulations" && Boolean(receipt.transaction.request.browserRequestId) && receipt.transaction.pointerActivations.length === 1 && receipt.transaction.pointerActivations[0].capturedControlId === receipt.controlId && Boolean(receipt.transaction.pointerActivations[0].captureKey) && receipt.transaction.pointerActivations[0].dispatch.kind === "native-pointer" && receipt.transaction.pointerActivations[0].dispatch.pressed && receipt.transaction.pointerActivations[0].dispatch.released && receipt.transaction.pointerActivations[0].dispatch.focus.controlId === receipt.controlId && receipt.transaction.pointerActivations[0].dispatch.focus.native && receipt.transaction.pointerActivations[0].dispatch.focus.targetMatchesCapturedControl && receipt.ownedProcessDrain.priorStudioShutdown.shutdown.kind === "abrupt-service-loss" && !receipt.ownedProcessDrain.priorStudioShutdown.shutdown.gracefulShutdownReceived && receipt.ownedProcessDrain.priorStudioShutdown.shutdown.requestedSignal === "SIGKILL" && receipt.ownedProcessDrain.priorStudioShutdown.shutdown.observedSignal === "SIGKILL" && receipt.ownedProcessDrain.priorStudioShutdown.processStateBeforeLoss.status === "running" && Number.isSafeInteger(receipt.ownedProcessDrain.priorStudioShutdown.processStateBeforeLoss.updatedAt) && receipt.ownedProcessDrain.priorStudioShutdown.durableJob.id === receipt.capturedJobId && receipt.ownedProcessDrain.priorStudioShutdown.durableJob.operation === "simulation" && ["queued", "running"].includes(receipt.ownedProcessDrain.priorStudioShutdown.durableJob.status) && !receipt.ownedProcessDrain.priorStudioShutdown.durableJob.terminal && receipt.ownedProcessDrain.priorStudioShutdown.durableJob.causedByRequestId === receipt.transaction.request.browserRequestId && receipt.terminal.status === "recovery-required" && Boolean(receipt.terminal.jobId) && receipt.capturedJobId === receipt.terminal.jobId && receipt.terminal.causedByRequestId === receipt.transaction.request.browserRequestId && receipt.rendered.resultControlId === receipt.controlId && receipt.rendered.resultOperation === receipt.operation && receipt.rendered.resultStateClass === receipt.stateClass && receipt.rendered.resultReceipt === "durable-terminal" && receipt.rendered.resultJobId === receipt.terminal.jobId && receipt.rendered.resultRequestId === receipt.terminal.jobId && receipt.rendered.resultTerminal === receipt.terminal.status && receipt.rendered.resultRecovery === "restart-reconciled" && receipt.rendered.resultExecutor === "unavailable-after-restart" && receipt.rendered.renderedTerminal && receipt.rendered.postRestartReplacementState.capturedControlId === receipt.controlId && receipt.rendered.postRestartReplacementState.captureKey === receipt.transaction.pointerActivations[0].captureKey && receipt.rendered.postRestartReplacementState.controlState === "replaced-after-restart" && receipt.rendered.postRestartReplacementState.currentControlId === receipt.controlId && !receipt.rendered.postRestartReplacementState.capturedControlConnected && receipt.ownedProcessDrain.processTreeDrained && receipt.ownedProcessDrain.resourcesDrained)).toBe(true);
            expect(aggregate.runtime).toEqual(expect.objectContaining({receiptPath: expect.any(String), receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/), installationCount: 1, permissions: "read-only-before-any-tuple-child"}));
            const runtimeReceiptBytes = await readFile(path.join(output, aggregate.runtime.receiptPath));
            const runtimeReceipt = JSON.parse(runtimeReceiptBytes.toString("utf8"));
            expect(createHash("sha256").update(runtimeReceiptBytes).digest("hex")).toBe(aggregate.runtime.receiptSha256);
            expect(runtimeReceipt).toEqual(expect.objectContaining({kind: "p8-05-immutable-packed-runtime", candidateId: candidate, candidatePackageSha256: packageSha256, candidateExecutableSha256: receipt.candidateExecutableSha256, installation: expect.objectContaining({count: 1}), permissions: "read-only-before-any-tuple-child"}));
            expect((await stat(runtimeReceipt.runtimeRoot)).mode & 0o222).toBe(0);
            expect((await stat(runtimeReceipt.packageRoot)).mode & 0o222).toBe(0);
            expect(tupleChildren).toHaveLength(expectedTuples.length);
            expect(aggregate.acceptedReceipts).toHaveLength(expectedTuples.length);
            expect(tupleChildren.map((child) => `${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`)).toEqual(expectedTuples);
            expect(new Set(tupleChildren.map((child) => child.auditSha256)).size).toBe(expectedTuples.length);
            expect(new Set(tupleChildren.map((child) => child.worker.nonce)).size).toBe(expectedTuples.length);
            expect(new Set(tupleChildren.flatMap((child) => child.checkpointReceiptSha256s)).size).toBe(tupleChildren.reduce((count, child) => count + child.checkpointReceiptSha256s.length, 0));
            expect(tupleChildren.every((child) => child.exitCode === 0 && child.signal === null && child.worker.pid !== aggregate.parent.pid && child.tupleReceiptPath && child.tupleReceiptSha256 && child.cleanupPath && child.cleanupSha256)).toBe(true);
            const tupleCliReceipts: Record<string, string> = {
                "programmer/npx-pokie": "PACKED_NPX_HELP",
                "programmer/recursive-help": "packed CLI help --help",
                "programmer/create-build-inspect": "packed CLI inspect",
                "programmer/validate-sim-report-diff-replay-serve-wasm": "packed CLI serve",
                "programmer/spaces-invalid-inputs-exit-codes-ci-recovery": "packed CLI invalid-input recovery",
                "programmer/build-export-output-folder": "packed CLI PAR build",
                "mathematician/par-xlsx-round-trip": "packed CLI PAR import",
                "mathematician/reels-paytable-modes-mechanics": "packed CLI reels",
                "mathematician/certification-conditional": "packed CLI Outcome Library export",
                "mathematician/fairness-conditional": "packed CLI package build",
            };
            const immutableArtifacts = new Set<string>();
            for (const [index, child] of tupleChildren.entries()) {
                expect(child.exitCode).toBe(0);
                expect(child.signal).toBeNull();
                expect(child.parentCleanup).toEqual(expect.objectContaining({
                    authenticated: true,
                    operationId: expect.any(String),
                    registryPath: expect.any(String),
                    processTreeDrained: true,
                    resourcesDrained: true,
                    ownedProcessIdentities: expect.arrayContaining([{pid: child.worker.pid, processIdentity: child.worker.processIdentity}]),
                }));
                expect(child.parentCleanup.ownedResources.every((resource) => resource.pid === undefined || resource.released)).toBe(true);
                const registryBytes = await readOperationArtifact(child.parentCleanup.registryPath);
                const ownershipRecords = registryBytes.toString("utf8").trim().split("\n").map((line: string) => JSON.parse(line) as {operationId: string; signature: string});
                expect(ownershipRecords.length).toBeGreaterThan(0);
                expect(ownershipRecords.every((record) => record.operationId === child.parentCleanup.operationId && (/^[a-f0-9]{64}$/).test(record.signature))).toBe(true);
                expect(Date.parse(aggregate.acceptedReceiptValidation.checkedAt)).toBeGreaterThanOrEqual(Date.parse(child.endedAt));
                const accepted = aggregate.acceptedReceipts[index] as {receipt: {auditId: string; tuple: unknown; cleanupEvidenceId: string; cleanupSha256: string; checkpointReceipt: {actionSha256: string}}; cleanup: {cleanupEvidenceId: string; cleanup: {exit: string; processTreeDrained: boolean; resourcesDrained: boolean; contextRemoved: boolean}}};
                const auditPath = `initial-${child.tuple.persona}--${child.tuple.observation.replaceAll(/[^a-z0-9]+/gi, "-")}--${child.tuple.viewport}-audit.json`;
                const [tupleReceiptBytes, cleanupBytes, auditBytes] = await Promise.all([readOperationArtifact(child.tupleReceiptPath), readOperationArtifact(child.cleanupPath), readOperationArtifact(auditPath)]);
                const tupleAudit = JSON.parse(auditBytes.toString("utf8")) as {
                    rendered: {actions: Array<{transaction: {pointerActivations: PointerDelivery[]}}>};
                    evidence: Array<{kind: string; path: string; sha256: string}>;
                };
                assertPointerDeliveries(tupleAudit.rendered.actions.flatMap((action) => action.transaction.pointerActivations));
                // Includes restored-job Cancel, its real portal confirmation,
                // Retry and later Replay Artifact requests in this child's history.
                const apiEvidence = tupleAudit.evidence.find((evidence) => evidence.kind === "api-log");
                expect(apiEvidence).toBeDefined();
                if (apiEvidence === undefined) throw new Error("packed tuple is missing its actual API transaction log");
                const apiBytes = await readOperationArtifact(apiEvidence.path);
                expect(createHash("sha256").update(apiBytes).digest("hex")).toBe(apiEvidence.sha256);
                const api = JSON.parse(apiBytes.toString("utf8")) as Array<{browserRequestId?: string; transaction?: {pointerActivations: PointerDelivery[]; confirmation?: {activation?: PointerDelivery}}}>;
                const requestIds = api.flatMap((entry) => entry.browserRequestId === undefined ? [] : [entry.browserRequestId]);
                expect(new Set(requestIds).size).toBe(requestIds.length);
                const transactionEvidence = tupleAudit.evidence.find((evidence) => evidence.kind === "live-dom-transaction");
                if (transactionEvidence === undefined) throw new Error("packed tuple is missing its live-DOM transaction");
                const pageBytes = await readOperationArtifact(transactionEvidence.path);
                expect(createHash("sha256").update(pageBytes).digest("hex")).toBe(transactionEvidence.sha256);
                const page = JSON.parse(pageBytes.toString("utf8"));
                if (page.request.path === "/api/project/context") {
                    expect(page.terminal.result.status).toBe(page.contextRevalidation.projectStatus);
                    expect(["loaded", "outcome-source", "artifact"]).toContain(page.terminal.result.status);
                    expect(page.terminal.status).toBe("success");
                    expect(page.request.browserRequestId).toBe(page.contextRevalidation.browserRequestId);
                    expect(page.request.responseSha256).toBe(page.contextRevalidation.responseSha256);
                    expect(api.filter((entry) => entry.browserRequestId === page.request.browserRequestId)).toHaveLength(1);
                }
                if (page.transaction.operation === "outcome-library") {
                    const body = page.transaction.request.body;
                    expect(createHash("sha256").update(body).digest("hex")).toBe(page.request.bodySha256);
                    const input = JSON.parse(body);
                    expect(["default", "sampled", "bounded"]).toContain(input.generation);
                    const generation = input.generation === "default" ? "exact" : input.generation;
                    const mode = input.mode.trim() || page.terminal.result.result.mode.modeName;
                    expect(page.interaction.matchedLabel).toBe(`Generate ${generation} outcome library (${mode})`);
                    expect(page.interaction.control).toBe(page.interaction.matchedLabel);
                    expect(page.terminal.result.result.generator.strategy).toBe(generation === "exact" ? "exact" : "bounded-coverage");
                }
                if (child.tuple.persona === "ui-ux" && child.tuple.observation === "reload-reconnect-recovery-cancellation-project-switch") {
                    expect(page.terminal.source).toBe("rendered-poll");
                    expect(page.terminal.result.status).toBe("completed");
                    expect(page.terminal.pollPath).toBe(`/api/project/simulations/${page.terminal.jobId}`);
                    expect(page.renderedTerminal.lifecycle.jobId).toBe(page.terminal.jobId);
                }
                assertPointerDeliveries(api.flatMap((entry) => [
                    ...(entry.transaction?.pointerActivations ?? []),
                    ...(entry.transaction?.confirmation?.activation?.kind === "pointer" ? [entry.transaction.confirmation.activation] : []),
                ]));
                const tupleReceipt = JSON.parse(tupleReceiptBytes.toString("utf8"));
                const cleanup = JSON.parse(cleanupBytes.toString("utf8"));
                expect(createHash("sha256").update(tupleReceiptBytes).digest("hex")).toBe(child.tupleReceiptSha256);
                expect(createHash("sha256").update(cleanupBytes).digest("hex")).toBe(child.cleanupSha256);
                expect(createHash("sha256").update(auditBytes).digest("hex")).toBe(child.auditSha256);
                expect(tupleReceipt).toEqual(expect.objectContaining({status: "passed", tuple: child.tuple, cleanupEvidenceId: child.cleanupEvidenceId, cleanupSha256: child.cleanupSha256, auditId: expect.any(String)}));
                expect(cleanup).toEqual(expect.objectContaining({tuple: child.tuple, cleanupEvidenceId: child.cleanupEvidenceId, cleanup: expect.objectContaining({exit: "success", processTreeDrained: true, resourcesDrained: true, contextRemoved: true})}));
                expect(accepted.receipt.cleanupEvidenceId).toBe(cleanup.cleanupEvidenceId);
                expect(accepted.receipt.cleanupSha256).toBe(child.cleanupSha256);
                expect(accepted.cleanup.cleanupEvidenceId).toBe(child.cleanupEvidenceId);
                expect(accepted.receipt.checkpointReceipt.actionSha256).toEqual(expect.any(String));
                const audit = JSON.parse(auditBytes.toString("utf8")) as {auditId: string; candidateId: string; candidatePackageSha256: string; worker: {pid: number}; rendered: {actions: unknown[]}; checkpointReceipts: Array<{path: string; sha256: string; actionSha256: string}>; cleanup: {evidenceId: string}; packageIdentity: {sharedRuntimeReceiptSha256: string; sharedRuntimeRoot: string}; workflowScope: {bootstrap: Array<{kind: string; purpose: string; publicWorkflow: string; output?: string; evidenceId: string}>}; evidence: Array<{kind: string; path: string}>};
                expect(audit.packageIdentity).toEqual(expect.objectContaining({sharedRuntimeReceiptSha256: aggregate.runtime.receiptSha256, sharedRuntimeRoot: runtimeReceipt.runtimeRoot}));
                if (["simulation-success-failure-cancellation", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "reload-reconnect-recovery-cancellation-project-switch"].includes(child.tuple.observation)) {
                    const recoveryEvidence = audit.evidence.find((entry) => entry.kind === "page-state" && entry.path.endsWith("recovery-and-jobs.json"));
                    expect(recoveryEvidence).toBeDefined();
                    const recovery = JSON.parse((await readOperationArtifact(recoveryEvidence!.path)).toString("utf8")) as {
                        roundsRejection: {classification: string; rounds: number; disabled: boolean; requestCount: number; message: string};
                        jobs: {actionableFailure: {error: string}};
                        transactions: Record<string, {request: {status: number}; formState: {fields: Array<{accessibleName: string; value: string}>}}>;
                    };
                    expect(recovery.roundsRejection).toEqual({
                        classification: "local-field-rejection", rounds: 2_000_001, disabled: true, requestCount: 0,
                        message: "Rounds must be a positive integer between 1 and 2,000,000.",
                    });
                    expect(recovery.jobs.actionableFailure.error).toContain('"workers"');
                    expect(recovery.transactions.simulationFailure.request.status).toBe(400);
                    expect(recovery.transactions.simulationSuccess.request.status).toBe(202);
                    for (const [transaction, workers] of [["simulationFailure", "33"], ["simulationSuccess", "1"]]) {
                        expect(recovery.transactions[transaction].formState.fields.find((field) => field.accessibleName.startsWith("Workers"))?.value).toBe(workers);
                    }
                }
                expect(audit.candidateId).toBe(candidate);
                expect(audit.candidatePackageSha256).toBe(packageSha256);
                expect(audit.checkpointReceipts).toHaveLength(1);
                const checkpointReceipt = audit.checkpointReceipts[0];
                expect(checkpointReceipt.sha256).toBe(child.checkpointReceiptSha256s[0]);
                const checkpointBytes = await readOperationArtifact(checkpointReceipt.path);
                const checkpoint = JSON.parse(checkpointBytes.toString("utf8"));
                expect(createHash("sha256").update(checkpointBytes).digest("hex")).toBe(checkpointReceipt.sha256);
                expect(checkpoint).toEqual(expect.objectContaining({auditId: audit.auditId, candidateId: candidate, candidatePackageSha256: packageSha256, worker: audit.worker, action: audit.rendered.actions[0]}));
                expect(createHash("sha256").update(JSON.stringify(audit.rendered.actions[0])).digest("hex")).toBe(checkpointReceipt.actionSha256);
                expect(tupleReceipt).toEqual(expect.objectContaining({auditId: audit.auditId, candidateId: candidate, candidatePackageSha256: packageSha256, action: audit.rendered.actions[0], cleanupEvidenceId: audit.cleanup.evidenceId}));
                const bootstrap = audit.workflowScope.bootstrap.map(({evidenceId: _evidenceId, ...entry}) => entry);
                const sourcePurpose = child.tuple.observation === "fairness-conditional" ? "fairness-source" : "certification-source";
                const expectedBootstrap = [
                    {kind: "packed-package-install", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    {kind: "packed-cli-create", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    {kind: "studio-project-create", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    ...(child.tuple.observation === "simulation-rtp-volatility-features" ? [
                        {kind: "studio-simulation-report-source", purpose: "rendered-report-source", publicWorkflow: child.tuple.observation, output: "simulation-report"},
                    ] : []),
                    ...(["certification-conditional", "trust"].includes(child.tuple.observation) ? [
                        {kind: "outcome-library-source-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                        {kind: "studio-import-outcome-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                    ] : []),
                    ...(child.tuple.observation === "fairness-conditional" ? [
                        {kind: "outcome-library-source-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                        {kind: "runtime-package", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "runtime-package"},
                        {kind: "studio-import-runtime-package", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "runtime-package"},
                    ] : []),
                    ...(child.tuple.persona === "mathematician" && child.tuple.observation === "outcome-library-report-diff-replay" ? [
                        {kind: "packed-cli-output", purpose: "compound-mathematician-output", publicWorkflow: child.tuple.observation, output: "outcome-library-export", command: "packed CLI Outcome Library export"},
                        {kind: "packed-cli-output", purpose: "compound-mathematician-output", publicWorkflow: child.tuple.observation, output: "simulation-report-source", command: "packed CLI simulation report source"},
                        {kind: "packed-cli-output", purpose: "compound-mathematician-output", publicWorkflow: child.tuple.observation, output: "report", command: "packed CLI report"},
                        {kind: "packed-cli-output", purpose: "compound-mathematician-output", publicWorkflow: child.tuple.observation, output: "diff", command: "packed CLI diff"},
                        {kind: "packed-cli-output", purpose: "compound-mathematician-output", publicWorkflow: child.tuple.observation, output: "replay", command: "packed CLI replay"},
                    ] : []),
                ];
                expect(bootstrap).toEqual(expectedBootstrap);
                expect(audit.workflowScope.bootstrap.every((entry) => typeof entry.evidenceId === "string" && entry.evidenceId.length > 0)).toBe(true);
                const bootstrapEvidence = audit.evidence.find((item) => item.path.endsWith("tuple-bootstrap.json"));
                expect(bootstrapEvidence).toBeDefined();
                const bootstrapReceipt = JSON.parse(await readFile(path.join(output, bootstrapEvidence!.path), "utf8"));
                if (child.tuple.observation === "simulation-rtp-volatility-features") {
                    expect(bootstrapReceipt.renderedBootstrap).toEqual(expect.objectContaining({
                        kind: "studio-simulation-report-source",
                        source: "rendered-control",
                        controlId: "simulation-run",
                        request: expect.objectContaining({browserRequestId: expect.any(String), method: "POST", path: "/api/project/simulations", status: 202}),
                        terminal: expect.objectContaining({status: "completed", resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/), browserRequestId: expect.any(String)}),
                    }));
                } else expect(bootstrapReceipt.renderedBootstrap).toBeUndefined();
                const cliReceipt = tupleCliReceipts[`${child.tuple.persona}/${child.tuple.observation}`];
                if (cliReceipt) {
                    const transcriptEvidence = audit.evidence.find((item) => item.kind === "cli-transcript");
                    expect(transcriptEvidence).toBeDefined();
                    expect(await readFile(path.join(output, transcriptEvidence!.path), "utf8")).toContain(cliReceipt);
                }
                for (const artifact of [child.auditSha256, child.tupleReceiptSha256, child.cleanupSha256, ...child.checkpointReceiptSha256s]) {
                    expect(immutableArtifacts.has(artifact)).toBe(false);
                    immutableArtifacts.add(artifact);
                }
            }
            passed = true;
        } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : String(error)}\nRetained P8-05 failure evidence: ${output}\nRetained candidate configuration: ${candidateDirectory}`, {cause: error});
        } finally {
            // The passing receipt deliberately retains a read-only packed
            // runtime for inspection; test-owned temporary evidence must
            // restore cleanup permissions after those assertions.
            if (passed) {
                await makeWritableForCleanup(output);
                await rm(output, {recursive: true, force: true});
                await rm(candidateDirectory, {recursive: true, force: true});
            }
        }
    }, 40_000_000);
});
