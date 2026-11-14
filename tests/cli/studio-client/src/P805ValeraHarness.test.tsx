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
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInNewContext, runInThisContext} from "node:vm";
import {renderRoutedApp} from "./testUtils/renderRoutedApp";
import {renderWithProviders} from "./testUtils/renderWithProviders";
import {ProjectsPanel} from "../../../../cli/studio-client/src/components/home/ProjectsPanel";
import {StudioProjectRegistrationService} from "../../../../cli/studio/StudioProjectRegistrationService";
import {FileStudioProjectRegistry} from "../../../../cli/studio/FileStudioProjectRegistry";
import {ProjectTargetResolver} from "../../../../src/project/ProjectTargetResolver";
import fs from "node:fs";
import {loadLogEvidence, readCapturedApiLog} from "../../../testUtils/p805PackedEvidence";

describe("P8-05 rendered Valera persona evidence", () => {
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");

    it("checks and durably adds an imported package without preparing its executable graph", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "p805-import-metadata-"));
        const registryPath = path.join(directory, "projects.json");
        const marker = path.join(directory, "entry-executed");
        const manifest = {name: "import-metadata", pokie: {entry: "game.cjs"}};
        await writeFile(path.join(directory, "package.json"), JSON.stringify(manifest));
        await writeFile(path.join(directory, "game.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('Check game must not execute a package');`);
        const service = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryPath));
        // The retained 31.843s preview loaded an unnecessary invocation-owned
        // snapshot (including dependencies) before discarding its late result.
        // Observe that resource boundary even if an entry cannot load in Jest.
        const snapshots = jest.spyOn(fs.promises, "mkdtemp");
        const requests: string[] = [];
        const fetchImpl: FetchLike = async (url, init) => {
            requests.push(url);
            let result: unknown;
            if (url.startsWith("/api/home/projects/registry?")) result = await service.list();
            else if (url === "/api/home/projects/registry/preview") result = await service.previewImport(JSON.parse(init!.body as string).location);
            else if (url === "/api/home/projects/registry/register") {
                const input = JSON.parse(init!.body as string);
                result = await service.registerExternal(input.location, input.name);
            } else if (url.startsWith("/api/home/fs/browse?")) result = {status: "ok", resolvedPath: directory, entries: []};
            else throw new Error(`Unexpected import request: ${url}`);
            return {ok: true, status: url.endsWith("/register") ? 201 : 200, json: () => Promise.resolve(result)};
        };
        const app = renderWithProviders(<ProjectsPanel />, {fetchImpl});
        try {
            const check = screen.getByRole("button", {name: "Check game"});
            expect(check).toBeDisabled();
            fireEvent.change(screen.getByLabelText("Game location"), {target: {value: directory}});
            await userEvent.setup().click(check);
            const add = await screen.findByRole("button", {name: "Add to projects"});
            expect(add).toBeEnabled();
            expect(await service.list()).toEqual([]);
            expect(fs.existsSync(registryPath)).toBe(false);
            await userEvent.setup().click(add);
            expect(await screen.findByRole("button", {name: "Open"})).toHaveAttribute("data-pokie-project-location", directory);
            const restored = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryPath));
            expect(await restored.list()).toEqual([expect.objectContaining({location: directory, type: "tsPackage", name: path.basename(directory), origin: "external", status: "ok"})]);
            expect(requests.filter(url => url.endsWith("/preview"))).toHaveLength(1);
            expect(requests.filter(url => url.endsWith("/register"))).toHaveLength(1);
            expect(fs.existsSync(marker)).toBe(false);
            expect(snapshots).not.toHaveBeenCalled();
            expect(JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"))).toEqual(manifest);
        } finally {
            app.unmount();
            snapshots.mockRestore();
            await rm(directory, {recursive: true, force: true});
        }
    });

    it("keeps registration sibling callers read-only at recognition and rejects malformed imports", async () => {
        const directory = await mkdtemp(path.join(tmpdir(), "p805-registration-metadata-"));
        await writeFile(path.join(directory, "package.json"), JSON.stringify({pokie: {entry: "game.cjs"}}));
        await writeFile(path.join(directory, "game.cjs"), "throw new Error('registration must not load a game');");
        const resolver = new ProjectTargetResolver();
        const resolve = jest.spyOn(resolver, "resolve");
        const snapshots = jest.spyOn(fs.promises, "mkdtemp");
        const service = new StudioProjectRegistrationService(undefined, resolver);
        try {
            expect(await service.previewImport(directory)).toMatchObject({status: "recognized", location: directory, type: "tsPackage"});
            expect(await service.registerManaged(directory, "Managed", "/source.xlsx")).toMatchObject({status: "ok", entry: {origin: "managed", importedFromParSheetPath: "/source.xlsx"}});
            expect(await service.recordOpened(directory)).toMatchObject({status: "ok", entry: {origin: "managed", name: "Managed"}});
            expect(await service.describeLocation(directory)).toMatchObject({type: "tsPackage", origin: "managed"});
            expect(await service.relocate(directory, directory)).toMatchObject({status: "ok", entry: {origin: "managed", importedFromParSheetPath: "/source.xlsx"}});
            await service.remove(directory);
            await service.migrateRecentProjects([{projectRoot: directory, name: "Migrated", openedAt: new Date().toISOString(), missing: false, availability: "available"}]);
            expect(await service.list()).toEqual([expect.objectContaining({location: directory, name: "Migrated", origin: "external"})]);
            // Recognition remains fresh, strict and non-mutating on failure.
            await writeFile(path.join(directory, "package.json"), JSON.stringify({pokie: {}}));
            await expect(service.previewImport(directory)).rejects.toThrow(/pokie.entry/);
            await expect(service.registerExternal(directory)).rejects.toThrow(/pokie.entry/);
            expect(await service.describeLocation(directory)).toBeUndefined();
            expect(await service.list()).toEqual([expect.objectContaining({name: "Migrated"})]);
            expect(resolve.mock.calls.length).toBeGreaterThanOrEqual(9);
            for (const call of resolve.mock.calls) expect(call).toEqual([directory, {readConfigurationProvenance: false}]);
            expect(snapshots).not.toHaveBeenCalled();
        } finally {
            resolve.mockRestore();
            snapshots.mockRestore();
            await rm(directory, {recursive: true, force: true});
        }
    });

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
                const marker=once(child.stdout,'data');
                const output=await waitForP805PackedServer(child,'http://127.0.0.1:'+port,{
                    now:()=>elapsed,
                    pause:async()=>{elapsed+=15000;if(++polls===3){child.stdin.write('ready\\n');await marker;}await pause(0);}
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
                // Start the virtual deadline only after the real child has
                // emitted diagnostics. Fixed sleeps race cold Node startup.
                const diagnostic=once(child.stderr,'data');
                try {
                    let elapsed=0;
                    await assert.rejects(waitForP805PackedServer(child,'http://127.0.0.1:1',{
                        now:()=>elapsed,pause:async()=>{await diagnostic;await pause(0);elapsed+=timeout?30000:1;}
                    }),timeout?/Timed out waiting for packed CLI serve[\\s\\S]*still preparing package/:/stopped before readiness: 7[\\s\\S]*invalid package input/);
                } finally {if(child.exitCode===null)child.kill();await exited;}
            }
            console.log('PACKED_SERVE_BOUNDARY_OK');
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000});
        expect(result).toContain("PACKED_SERVE_BOUNDARY_OK");
    });

    it("binds native import confirmations to exact responses before observing registered projects", () => {
        // Exercise the shared browser boundary, without starting installed
        // persona collection. Real Chromium input/fetch/CDP is used throughout.
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", String.raw`
            import assert from 'node:assert/strict';
            import {spawn} from 'node:child_process';
            import {mkdtemp,readFile,rm} from 'node:fs/promises';
            import {tmpdir} from 'node:os';
            import path from 'node:path';
            import {createServer} from 'node:http';
            import {connectP805Devtools,registerP805ImportedProject,hasP805NativeActivation,drainP805TrackedOwner,createP805OwnedProcessRecord} from './scripts/p8-05-valera-browser-audit.mjs';
            const profile=await mkdtemp(path.join(tmpdir(),'p805-import-boundary-'));
            const browser=spawn(process.env.P805_CHROMIUM_BINARY??'chromium-browser',['--headless=new','--no-sandbox','--no-first-run','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
            const owner=createP805OwnedProcessRecord('focused import browser',browser,{});
            let terminal,cdp,scenario,source;
            const exited=new Promise(resolve=>{browser.once('error',error=>{terminal=error;resolve();});browser.once('exit',(code,signal)=>{terminal={code,signal};resolve();});});
            const requests=[],timers=new Set();
            const later=(callback,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},ms);timers.add(timer);};
            const server=createServer(async(request,response)=>{
                if(!request.url.startsWith('/api/')){
                    response.setHeader('Content-Type','text/html');
                    response.end('<!doctype html><button type="button" id="project-import-check">Check game</button><main id="preview"></main><p id="error"></p><script>'+
                        'window.clicks=[];const source='+JSON.stringify(source)+';'+
                        'document.getElementById("project-import-check").onclick=async event=>{window.clicks.push({id:event.currentTarget.id,trusted:event.isTrusted});event.currentTarget.disabled=true;'+
                        'const result=await (await fetch("/api/home/projects/registry/preview",{method:"POST",body:JSON.stringify({location:source})})).json();'+
                        'document.getElementById("preview").innerHTML="Found a "+result.type+" <button type=button id=project-import-add>Add to projects</button>";'+
                        'document.getElementById("project-import-add").disabled='+(scenario==='disabled-add')+';document.getElementById("project-import-add").onclick=async event=>{window.clicks.push({id:event.currentTarget.id,trusted:event.isTrusted});event.currentTarget.disabled=true;'+
                        'const result=await (await fetch("/api/home/projects/registry/register",{method:"POST",body:JSON.stringify({location:resultLocation(),name:"Imported"})})).json();'+
                        'if(result.status!=="ok"){document.getElementById("error").textContent=result.error;return;}'+
                        (scenario==='missing-row'?'return;':
                            'const open=document.createElement("button");open.type="button";open.id="project-open:"+result.entry.location;open.dataset.pokieProjectLocation=result.entry.location;open.textContent="Open";document.body.append(open);')+
                        '};window.resultLocation=()=>result.location;};</script>');
                    return;
                }
                let body='';for await(const chunk of request)body+=chunk;
                const input=JSON.parse(body),register=request.url.endsWith('/register');
                const transaction={path:request.url,input,started:Date.now()};requests.push(transaction);
                if(register&&scenario==='blocked')return;
                const status=register?(scenario==='rejected'?409:201):200;
                const location=register&&scenario==='wrong-location'?'/another-project':source;
                const payload=register?(scenario==='rejected'?{status:'error',error:'Registry is read-only'}:{status:'ok',entry:{location}}):{status:'recognized',location,type:scenario};
                const headers=()=>{response.writeHead(status,{'Content-Type':'application/json'});response.flushHeaders();};
                const finish=()=>{transaction.completed=Date.now();response.end(JSON.stringify(payload));};
                if(register&&scenario==='delayed-headers')later(()=>{headers();finish();},180);
                else {headers();if(register&&scenario==='delayed-bytes')later(finish,180);else finish();}
            });
            await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
            const poll=async read=>{const until=Date.now()+30000;for(;;){const value=await read();if(value)return value;assert.equal(terminal,undefined);assert.ok(Date.now()<until,'Chromium boundary timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
            try {
                const port=await poll(async()=>{try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(String.fromCharCode(10))[0];}catch(error){if(error.code!=='ENOENT')throw error;return false;}});
                cdp=await connectP805Devtools('http://127.0.0.1:'+port);
                const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined);return result.result.value;};
                for(scenario of ['blueprint','tsPackage','outcomeLibrary','delayed-headers','delayed-bytes','rejected','wrong-location','blocked','missing-row','disabled-add']){
                    source='/imported '+scenario;requests.length=0;
                    const url='http://127.0.0.1:'+server.address().port+'/'+scenario;
                    await cdp.send('Page.navigate',{url});
                    await poll(()=>evaluate('location.href==='+JSON.stringify(url)+'&&document.readyState==="complete"&&!!document.getElementById("project-import-check")'));
                    const started=Date.now();
                    const operation=registerP805ImportedProject(cdp,evaluate,source,async id=>{
                        await poll(()=>cdp.events.some(event=>event.method==='Network.loadingFinished'&&event.params.requestId===id));
                        return cdp.send('Network.getResponseBody',{requestId:id});
                    },'primary Blueprint workflow import',{responseTimeout:500,renderTimeout:100});
                    if(['rejected','wrong-location','blocked','missing-row','disabled-add'].includes(scenario)){
                        const pattern={rejected:/registration HTTP 409:.*Registry is read-only/, 'wrong-location':/unrelated project location/,blocked:/registration response.*"completion":"pending"/, 'missing-row':/registration rendered control.*"status":201.*"completion":"Network.loadingFinished"/, 'disabled-add':/preview rendered control/}[scenario];
                        await assert.rejects(operation,pattern);
                    } else {
                        const imported=await operation;
                        assert.equal(imported.projectLocation,source);
                        assert.deepEqual(imported.stages.map(stage=>stage.status),[200,201]);
                        for(const stage of imported.stages){assert.equal(hasP805NativeActivation(stage.activation,stage.activation.controlId),true);assert.equal(stage.activation.dispatch.clickCount,1);}
                        const receipt=imported.stages[1].activation;
                        assert.equal(hasP805NativeActivation({...receipt,dispatch:{...receipt.dispatch,clickCount:0}},receipt.controlId),false,'keyup without native click is not import evidence');
                        if(scenario.startsWith('delayed')){assert.ok(Date.now()-started>100,'response preparation does not consume the rendered deadline');assert.ok(requests[1].completed-requests[1].started>=100,'registration itself exceeds the rendered budget');}
                    }
                    assert.deepEqual(requests.map(item=>item.path),scenario==='disabled-add'?['/api/home/projects/registry/preview']:['/api/home/projects/registry/preview','/api/home/projects/registry/register']);
                    assert.deepEqual(requests.map(item=>item.input.location),scenario==='disabled-add'?[source]:[source,source]);
                    const clicks=[{id:'project-import-check',trusted:true},...(scenario==='disabled-add'?[]:[{id:'project-import-add',trusted:true}])];
                    assert.deepEqual(await evaluate('window.clicks'),clicks);
                    assert.equal(await evaluate('window.__p805KeyboardReceipts.size'),0);
                }
                console.log(JSON.stringify({nativeImportCases:10,siblingTypes:3,delayedPreparation:2,rejections:5,noRepeatedRequests:true}));
            } finally {
                const finalOwner=createP805OwnedProcessRecord('focused import browser',browser,{});
                for(const [pid,identity] of finalOwner.ownedProcesses)owner.ownedProcesses.set(pid,identity);
                cdp?.close();
                const drained=await drainP805TrackedOwner(owner,1000);
                assert.equal(drained.processTreeDrained,true);
                assert.equal(drained.resourcesDrained,true);
                await exited;
                for(const timer of timers)clearTimeout(timer);
                server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
                await rm(profile,{recursive:true,force:true});
            }
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 60_000}));
        expect(result).toEqual({nativeImportCases: 10, siblingTypes: 3, delayedPreparation: 2, rejections: 5, noRepeatedRequests: true});
    }, 90_000);

    it.each(["exact", "sampled", "rejected", "blocked", "sampled-budget"] as const)("observes Outcome Library preparation through the production card (%s)", async scenario => {
        const {requireP805OutcomeLibraryCard, preserveP805FailedWorkflow} = await runInThisContext(`import(${JSON.stringify(pathToFileURL(runner).href)})`, {importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
        const pending: Array<{body: Record<string, unknown>; resolve: (value: Awaited<ReturnType<FetchLike>>) => void}> = [];
        const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
        const plan = {status: "planned", source: {kind: "blueprint", capabilities: []}, target: {kind: "outcomeLibrary", capabilities: []}, steps: [], preflight: {destinationKind: "directory", estimatedWork: "generate", losses: [], oneWay: false}};
        const fetchImpl: FetchLike = (url, init) => {
            const request = url.split("?")[0];
            if (request === "/api/project/outcome-libraries/generate/estimate") return new Promise(resolve => {
                pending.push({body: JSON.parse(String(init?.body)), resolve});
            });
            if (request === "/api/project/context") return Promise.resolve(response({status: "loaded", projectRoot: "/games/a", type: "blueprint", game: {id: "a", name: "A", version: "1"}, capabilities: ["blueprint.build"]}));
            if (request === "/api/project/inspect") return Promise.resolve(response({valid: true, packageRoot: "/games/a", generated: false}));
            if (["/api/project/jobs", "/api/project/outcome-libraries/generate/jobs"].includes(request)) return Promise.resolve(response({jobs: []}));
            if (request === "/api/project/deployment/build-modes") return Promise.resolve(response({status: "ok", modeIds: ["base"]}));
            if (request === "/api/project/artifacts/targets") return Promise.resolve(response([{target: "outcomeLibrary", supported: true, state: "supported", unsupportedNotes: [], plan}]));
            if (["/api/project/reports", "/api/project/replays", "/api/project/deployment/targets"].includes(request)) return Promise.resolve(response([]));
            return Promise.reject(new Error(`Unexpected request during preflight: ${url}`));
        };
        const app = renderRoutedApp({fetchImpl, initialEntries: ["/project/exportDeploy"]});
        // JSDOM has no layout. Only geometry is supplied; the production card,
        // defaults reconciliation, disabled state and request bodies stay real.
        const geometry = jest.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
            return (this.closest("[hidden]") ? [] : [this.getBoundingClientRect()]) as unknown as DOMRectList;
        });
        // Exact request/response/timing fields from the retained compact
        // browser.json (c6226d04953f1d2a), through the third request start.
        // A blocked successor must retain the two completed preparations.
        const retainedPreflights = [
            {"method": "Network.requestWillBeSent", "params": {"requestId": "3038334.597", "timestamp": 490930.707146, "request": {"url": "http://127.0.0.1:34045/api/project/outcome-libraries/generate/estimate", "method": "POST", "postData": "{\"mode\":\"base\",\"generation\":\"default\"}"}}},
            {"method": "Network.responseReceived", "params": {"requestId": "3038334.597", "timestamp": 490945.145961, "response": {"url": "http://127.0.0.1:34045/api/project/outcome-libraries/generate/estimate", "status": 200}}},
            {"method": "Network.loadingFinished", "params": {"requestId": "3038334.597", "timestamp": 490945.145858}},
            {"method": "Network.requestWillBeSent", "params": {"requestId": "3038334.632", "timestamp": 490945.170787, "request": {"url": "http://127.0.0.1:34045/api/project/outcome-libraries/generate/estimate", "method": "POST", "postData": "{\"mode\":\"base\",\"generation\":\"default\",\"maxOutcomeSpaceSize\":\"20000000\"}"}}},
            {"method": "Network.responseReceived", "params": {"requestId": "3038334.632", "timestamp": 490958.826595, "response": {"url": "http://127.0.0.1:34045/api/project/outcome-libraries/generate/estimate", "status": 200}}},
            {"method": "Network.loadingFinished", "params": {"requestId": "3038334.632", "timestamp": 490958.826273}},
            {"method": "Network.requestWillBeSent", "params": {"requestId": "3038334.659", "timestamp": 490959.140661, "request": {"url": "http://127.0.0.1:34045/api/project/outcome-libraries/generate/estimate", "method": "POST", "postData": "{\"mode\":\"base\",\"generation\":\"sampled\",\"maxOutcomeSpaceSize\":\"20000000\",\"sample\":{\"sampleSize\":\"10000\",\"seed\":\"pokie-bounded-coverage-v1\"}}"}}},
        ];
        // The latest B61p9g failure stopped on its first request. Its receipt
        // contains no completed response or timestamp; do not invent either.
        const blockedPreflight = [{method: "Network.requestWillBeSent", params: {
            requestId: "4139235.606", request: {url: "http://127.0.0.1/api/project/outcome-libraries/generate/estimate", method: "POST", postData: '{"mode":"base","generation":"default"}'},
        }}];
        let preparationEvents: unknown[] = [];
        if (scenario === "sampled-budget") preparationEvents = retainedPreflights;
        if (scenario === "blocked") preparationEvents = blockedPreflight;
        let clock = 0;
        let resolved = 0;
        const selections: string[] = [];
        let deferredSampledControl: string | undefined;
        try {
            fireEvent.click(await screen.findByRole("button", {name: "Configure Outcome library generator"}));
            await waitFor(() => expect(pending).toHaveLength(1));
            const generate = document.getElementById("outcome-library-generate")!;
            expect(generate).toBeDisabled();
            const evaluate = (expression: string) => Promise.resolve(runInNewContext(expression, {document, HTMLElement, HTMLButtonElement, getComputedStyle: window.getComputedStyle}));
            const options = {
                evaluate, events: preparationEvents, now: () => clock,
                focusRenderedControl: (selector: string, predicate: string) => {
                    const matches = runInNewContext(`(${predicate})`) as (item: HTMLElement, name: string) => boolean;
                    const button = [...document.querySelectorAll<HTMLElement>(selector)].find(item => matches(item, item.textContent?.trim() ?? ""));
                    expect(button).toBeDefined();
                    button!.focus();
                    return Promise.resolve({stableControlId: button!.id, keyboardFocused: document.activeElement === button});
                },
                activateFocusedControl: async (_kind: string, control: {stableControlId: string}) => {
                    expect(generate).toBeDisabled();
                    expect(control.stableControlId).toBe("outcome-library-generation-sampled");
                    selections.push(control.stableControlId);
                    if (scenario === "sampled") {
                        deferredSampledControl = control.stableControlId;
                        return;
                    }
                    await act(async () => {
                        fireEvent.click(document.getElementById(control.stableControlId)!);
                        await Promise.resolve();
                    });
                },
                pause: async () => {
                    // CDP input may return before React commits the selection.
                    if (deferredSampledControl !== undefined) {
                        const controlId = deferredSampledControl;
                        deferredSampledControl = undefined;
                        await act(async () => {
                            fireEvent.click(document.getElementById(controlId)!);
                            await Promise.resolve();
                        });
                        return;
                    }
                    // Completed compact receipt: default 14.439s, bound default
                    // 13.656s, sampled 12.405s. Modest contention makes the first
                    // pair exceed 30s; do not reset a budget on either response.
                    clock += scenario === "sampled-budget" || scenario === "blocked" ? 40_000 : 20_000;
                    expect(generate).toBeDisabled();
                    if (scenario === "blocked" || clock >= 120_000) return;
                    const request = pending[resolved++];
                    expect(request).toBeDefined();
                    const sampled = request.body.generation === "sampled";
                    await act(async () => {
                        request.resolve(response(scenario === "rejected" ? {status: "unsupported", error: "Package preparation rejected"} : {
                            status: "ok", game: {id: "a", name: "A", version: "1"}, reelsNumber: 3, reelsSymbolsNumber: 3, reelSizes: [30, 30, 30],
                            totalOutcomeSpaceSize: 27000, maxOutcomeSpaceSize: 20_000_000, strategy: sampled ? "sampled" : "exact", requiresBounded: scenario !== "exact" && !sampled,
                            expectedRawWork: sampled ? 10000 : 27000, warnings: [], plan, preflightToken: `bound-${resolved}`,
                            defaults: {compatibilityVersion: "v1", maxExactOutcomeSpaceSize: 20_000_000, boundedSample: {sampleSize: 10_000, seed: "pokie-bounded-coverage-v1"}},
                        }));
                        await Promise.resolve();
                    });
                },
            };
            if (["rejected", "blocked", "sampled-budget"].includes(scenario)) {
                let failure: Error | undefined;
                try {
                    await requireP805OutcomeLibraryCard(options, "outcome-library-report-diff-replay");
                } catch (error) {
                    failure = error as Error;
                }
                expect(failure?.message).toMatch(scenario === "rejected" ? /unsupported-preflight.*last Outcome Library preparation:.*Package preparation rejected/ : /Timed out.*last Outcome Library preparation:.*loading/);
                const diagnostic = JSON.parse(failure!.message.split("last Outcome Library preparation: ")[1]);
                const expectedRequests = scenario === "blocked" ? [{requestId: "4139235.606", options: '{"mode":"base","generation":"default"}', completion: "pending", elapsedMs: null}] : [];
                expect(diagnostic.requests).toEqual(scenario === "sampled-budget" ? [
                    {requestId: "3038334.597", options: JSON.stringify({mode: "base", generation: "default"}), status: 200, completion: "Network.loadingFinished", elapsedMs: 14439},
                    {requestId: "3038334.632", options: JSON.stringify({mode: "base", generation: "default", maxOutcomeSpaceSize: "20000000"}), status: 200, completion: "Network.loadingFinished", elapsedMs: 13655},
                    {requestId: "3038334.659", options: JSON.stringify({mode: "base", generation: "sampled", maxOutcomeSpaceSize: "20000000", sample: {sampleSize: "10000", seed: "pokie-bounded-coverage-v1"}}), completion: "pending", elapsedMs: null},
                ] : expectedRequests);
                expect(selections).toHaveLength(scenario === "sampled-budget" ? 1 : 0);
                expect(clock).toBe(scenario === "rejected" ? 20_000 : 120_000);
                if (scenario === "blocked") {
                    const directory = await mkdtemp(path.join(tmpdir(), "p805-failed-workflow-"));
                    const entries = new Map<string, {item: CapturedLogEvidence; contents: Buffer}>();
                    const save = async (kind: string, name: string, content: string | Buffer, observationIds: string[]) => {
                        const contents = Buffer.from(content);
                        const evidenceId = `failure-${entries.size}`;
                        // Use actual immutable filesystem writes, not an in-memory
                        // substitute for a receipt that survives context removal.
                        await writeFile(path.join(directory, name), contents, {flag: "wx"});
                        entries.set(evidenceId, {item: {evidenceId, kind, path: name, sha256: createHash("sha256").update(contents).digest("hex"), sizeBytes: contents.length, observationIds}, contents});
                        return evidenceId;
                    };
                    try {
                        const {readP805Log, P805_MAX_EVIDENCE_BYTES} = await loadLogEvidence();
                        const transcript = ["P805_CLI command=packed CLI replay phase=complete", "ж".repeat(P805_MAX_EVIDENCE_BYTES)];
                        const api = [{browserRequestId: "completed-sibling", status: 200}];
                        const references = await preserveP805FailedWorkflow({error: failure, transcript, events: blockedPreflight, api, errors: [], timings: {replayMs: 27478}, observations: ["outcome-library-report-diff-replay"], save});
                        for (const entry of entries.values()) {
                            const saved = await readFile(path.join(directory, entry.item.path));
                            expect(saved.equals(entry.contents)).toBe(true);
                            expect(entry.contents.length).toBeGreaterThan(0);
                            expect(entry.contents.length).toBeLessThanOrEqual(P805_MAX_EVIDENCE_BYTES);
                            expect(entry.item.observationIds).toEqual(["outcome-library-report-diff-replay"]);
                        }
                        expect(readP805Log("browser-log", entries)).toEqual(blockedPreflight);
                        expect(readP805Log("api-log", entries)).toEqual(api);
                        expect(Buffer.concat(references.transcript.map((id: string) => entries.get(id)!.contents)).toString()).toBe(transcript.join("\n"));
                        expect(JSON.parse(entries.get(references.timings)!.contents.toString())).toEqual({replayMs: 27478});
                        expect(JSON.parse(entries.get(references.failure)!.contents.toString())).toEqual({kind: "p8-05-workflow-failure", status: "failed", message: failure!.stack, references: expect.objectContaining({browser: references.browser, api: references.api})});
                        expect(generate).toBeDisabled();
                        expect(pending).toHaveLength(1);
                    } finally {
                        await rm(directory, {recursive: true, force: true});
                    }
                }
            } else {
                await expect(requireP805OutcomeLibraryCard(options, "outcome-library-report-diff-replay")).resolves.toMatchObject({state: "ready", enabled: true, disabled: false, controlId: "outcome-library-generate"});
                expect(generate).toBeEnabled();
                expect(selections).toHaveLength(scenario === "sampled" ? 1 : 0);
                expect(clock).toBe(scenario === "sampled" ? 60_000 : 40_000);
            }
            // Exact request bytes observed in the retained compact browser log:
            // 3038334.597 discovers defaults, 3038334.632 binds the exact cap.
            expect(pending[0].body).toEqual({mode: "base", generation: "default"});
            if (resolved >= 2) expect(pending[1].body).toEqual({mode: "base", generation: "default", maxOutcomeSpaceSize: "20000000"});
            if (selections.length) expect(pending[2].body).toEqual({mode: "base", generation: "sampled", maxOutcomeSpaceSize: "20000000", sample: {sampleSize: "10000", seed: "pokie-bounded-coverage-v1"}});
            const expectedRequests = scenario === "blocked" || scenario === "rejected" ? 1 : 2;
            expect(pending).toHaveLength(selections.length ? 3 : expectedRequests);
        } finally {
            app.unmount();
            app.router.dispose();
            geometry.mockRestore();
            for (const request of pending.slice(resolved)) request.resolve(response({status: "unsupported", error: "Test disposed"}));
        }
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
                for(const file of ['src/changed.ts','src/gamepackage/resolvePokieGameEntryModule.ts','cli/studio/StudioProjectRegistrationService.ts','tsconfig.prod.json','tests/unnamed.test.ts']){
                    await mkdir(path.dirname(path.join(repository,file)),{recursive:true});await writeFile(path.join(repository,file),'protected');
                    const changed=commit();
                    assert.throws(()=>authenticateP805ProductTree(fixture.handoff.candidateId,changed,repository),/new blind retests are required/);
                    for(const read of [readP911CandidateFromEnvironment,readP911SmokeCandidateFromEnvironment])await assert.rejects(()=>read(environment,{repository}),/product[/]build inputs changed/);
                    execFileSync('git',['reset','--hard',descendant],{cwd:repository});
                }
                console.log(JSON.stringify({completeCorrectionAdmitted:true,archivePreserved:true,pinsProtected:true,protectedPaths:5}));
            } finally {await rm(directory,{recursive:true,force:true});}
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 30_000}));
        expect(result).toEqual({completeCorrectionAdmitted: true, archivePreserved: true, pinsProtected: true, protectedPaths: 5});
    });

    it("copies complete runtime acquisitions without repeating per-file ancestry checks and drains sibling consumers", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["-e", String.raw`
            const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
            const ts=require('typescript'),threads=require('node:worker_threads');
            const base=path.join(process.cwd(),'node_modules/.cache/pokie-tmp');fs.mkdirSync(base,{recursive:true});
            const root=fs.mkdtempSync(path.join(base,'p805-runtime-copy-'));
            const temporary=path.join(root,'temporary'),emitted=path.join(root,'emitted');
            const priorTmp=process.env.TMPDIR;
            const workers=[],metrics=[];
            // Observe the production worker's actual filesystem calls and exit. No
            // copy, import, validation or cleanup operation is replaced by a fixture.
            const NativeWorker=threads.Worker;
            threads.Worker=class extends NativeWorker {
                constructor(code,options){
                    super(String.raw` + "`" + String.raw`
                        (()=>{
                            const fs=require('node:fs'),port=require('node:worker_threads').parentPort;
                            let source,counts={};
                            port.on('message',request=>{source=request.source;counts={active:0,peak:0};});
                            for(const name of ['cpSync','copyFileSync','readdirSync','statSync','chmodSync','realpathSync']){
                                const original=fs[name];fs[name]=(...args)=>{counts[name]=(counts[name]||0)+1;return original(...args);};
                            }
                            for(const name of ['copyFile','utimes','cp']){
                                const original=fs.promises[name];
                                fs.promises[name]=async (...args)=>{
                                    counts[name]=(counts[name]||0)+1;
                                    counts.active++;counts.peak=Math.max(counts.peak,counts.active);
                                    try{
                                        const value=await original(...args);
                                        counts[name+'Completed']=(counts[name+'Completed']||0)+1;
                                        return value;
                                    }finally{counts.active--;}
                                };
                            }
                            const post=port.postMessage.bind(port);port.postMessage=value=>post({...value,copyMetrics:{source,...counts}});
                        })();
                    ` + "`" + String.raw`+code,options);
                    const record={exited:false};workers.push(record);
                    this.on('message',message=>{if(message.copyMetrics)metrics.push(message.copyMetrics);});
                    this.once('exit',()=>{record.exited=true;});
                }
            };
            const write=(file,contents)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);};
            const json=(file,value)=>write(file,JSON.stringify(value));
            const files=new Set();
            const emit=relative=>{
                if(files.has(relative))return;files.add(relative);
                const output=ts.transpileModule(fs.readFileSync(path.join('src',relative),'utf8'),{
                    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
                }).outputText;
                write(path.join(emitted,relative.replace(/\.ts$/,'.js')),output);
                for(const match of output.matchAll(/require\("(\.[^"]+\.js)"\)/g))emit(path.join(path.dirname(relative),match[1]).replace(/\.js$/,'.ts'));
            };
            (async()=>{
                fs.mkdirSync(temporary);process.env.TMPDIR=temporary;
                emit('gamepackage/loadPokieGame.ts');emit('gamepackage/PokieGamePackageValidator.ts');
                const runtime=require(path.join(emitted,'gamepackage/loadPokieGame.js'));
                const {PokieGamePackageValidator}=require(path.join(emitted,'gamepackage/PokieGamePackageValidator.js'));
                const host=path.join(root,'node_modules/@fromstan/pokie'),leaf=path.join(host,'node_modules/leaf');
                json(path.join(host,'package.json'),{name:'@fromstan/pokie',main:'index.cjs',dependencies:{leaf:'1'}});
                write(path.join(host,'index.cjs'),"module.exports = require('leaf');");
                json(path.join(leaf,'package.json'),{name:'leaf',main:'index.cjs',peerDependencies:{'@fromstan/pokie':'*'}});
                const leafEntry=path.join(leaf,'index.cjs');write(leafEntry,"module.exports = 'before';");
                // The retained failure was still copying the SDK's 10,759 files
                // after 180s. Keep a similarly sized graph, including non-code assets.
                for(let i=0;i<10759;i++)write(path.join(host,'assets',String(i%32),i+'.txt'),'asset '+i);
                const stamp=new Date('2020-01-02T03:04:05Z'),asset=path.join(host,'assets/0/0.txt');
                fs.utimesSync(asset,stamp,stamp);fs.chmodSync(asset,0o444);fs.chmodSync(path.dirname(asset),0o555);
                fs.symlinkSync(asset,path.join(host,'asset-link'));
                write(path.join(host,'.git/ignored'),'must not copy');
                write(path.join(host,'.pokie-runtime-cache/ignored'),'must not copy');
                const game=path.join(root,'game');
                json(path.join(game,'package.json'),{pokie:{entry:'game.cjs'},dependencies:{'@fromstan/pokie':'*'}});
                write(path.join(game,'game.cjs'),String.raw` + "`" + String.raw`
                    const value=require('@fromstan/pokie');
                    module.exports={getManifest:()=>({id:'copy-probe',name:value,version:'1.0.0'}),
                        createSession:()=>({root:__dirname,lazy:()=>require('@fromstan/pokie')})};
                ` + "`" + String.raw`);
                const first=await runtime.loadPokieGameRuntime(game),session=first.game.createSession();
                assert.equal(first.game.getManifest().name,'before');
                const snapshotHost=fs.realpathSync(path.join(session.root,'node_modules/@fromstan/pokie'));
                assert.ok(snapshotHost.startsWith(session.root+path.sep));
                for(let i=0;i<10759;i++)assert.equal(fs.readFileSync(path.join(snapshotHost,'assets',String(i%32),i+'.txt'),'utf8'),'asset '+i);
                const copiedAsset=path.join(snapshotHost,'assets/0/0.txt');
                assert.equal(fs.statSync(copiedAsset).mtimeMs,stamp.getTime());
                assert.equal(fs.statSync(copiedAsset).mode&0o777,0o444);
                assert.equal(fs.statSync(path.dirname(copiedAsset)).mode&0o700,0o700);
                assert.equal(fs.statSync(path.dirname(asset)).mode&0o777,0o555);
                assert.equal(fs.readlinkSync(path.join(snapshotHost,'asset-link')),asset);
                for(const name of ['.git','.pokie-runtime-cache'])assert.equal(fs.existsSync(path.join(snapshotHost,name)),false);
                assert.ok(workers.every(worker=>worker.exited),'copiers drain before a game is returned');
                const assertCompleteCopy=copied=>{
                    // These are native promise completions, not merely scheduled calls.
                    // Each host acquisition includes all assets plus its manifest and entry.
                    assert.equal(copied.copyFile,10759+2);
                    assert.equal(copied.copyFileCompleted,copied.copyFile,'the complete dependency package was actually copied');
                    assert.equal(copied.utimesCompleted,copied.copyFileCompleted,'all copied timestamps settle before the response');
                    assert.equal(copied.cp,1,'only symlinks need general-purpose copy ancestry/overwrite checks');
                    assert.equal(copied.cpCompleted,1);
                    assert.equal(copied.copyFileSync||0,0,'regular files must use the asynchronous copier');
                    assert.equal(copied.cpSync||0,0,'no synchronous per-file general-purpose copying');
                    assert.equal(copied.realpathSync,2,'ancestry is resolved once for source and destination');
                    assert.ok(copied.statSync<copied.copyFile+50,'one metadata read per file without repeated ancestry checks');
                    assert.ok(copied.readdirSync<50,'one traversal, no chmod traversal over the copied graph');
                    assert.ok(copied.peak>1 && copied.peak<=32,'actual file I/O is concurrent and bounded');
                    assert.equal(copied.active,0,'all native file operations settle before the response');
                };
                assertCompleteCopy(metrics.find(copied=>copied.source===host));
                // Package validation is the sibling preparation consumer behind
                // Blueprint materialization and Outcome Library preflight.
                write(leafEntry,"module.exports = 'after';");
                const report=await new PokieGamePackageValidator().validate(game);
                assert.equal(report.valid,true);assert.equal(report.game.name,'after');
                assert.equal(session.lazy(),'before','an earlier live session retains its isolated dependency graph');
                assert.equal(fs.readdirSync(temporary).length,1,'validator releases its snapshot');
                write(leafEntry,"throw new Error('preparation rejected');");
                const rejected=await new PokieGamePackageValidator().validate(game);
                assert.equal(rejected.valid,false);assert.match(rejected.errors[0].message,/preparation rejected/);
                assert.equal(fs.readdirSync(temporary).length,1,'rejected imports drain too');
                write(leafEntry,"module.exports = 'retry';");
                const reopened=await runtime.loadPokieGame(game);
                assert.equal(reopened.getManifest().name,'retry');
                await runtime.releasePokieGame(reopened);await first.release();await first.release();
                assert.deepEqual(fs.readdirSync(temporary),[]);
                // A package-local TMPDIR outside the excluded node_modules
                // branch must still fail instead of recursively copying itself.
                const nestedTemporary=path.join(game,'nested-temporary');fs.mkdirSync(nestedTemporary);
                process.env.TMPDIR=nestedTemporary;
                await assert.rejects(runtime.loadPokieGameRuntime(game),/Cannot copy.*into.*source/);
                assert.deepEqual(fs.readdirSync(nestedTemporary),[]);
                const aliasedTemporary=path.join(root,'aliased-temporary');fs.symlinkSync(nestedTemporary,aliasedTemporary);
                process.env.TMPDIR=aliasedTemporary;
                await assert.rejects(runtime.loadPokieGameRuntime(game),/Cannot copy.*into.*source/);
                assert.deepEqual(fs.readdirSync(nestedTemporary),[]);
                const hostCopies=metrics.filter(copied=>copied.source===host);
                assert.equal(hostCopies.length,4,'session, validation, rejected import and retry each copy the full graph');
                hostCopies.forEach(assertCompleteCopy);
                assert.ok(metrics.every(copied=>copied.active===0),'successful and rejected copy responses drain all started I/O');
                assert.equal(workers.length,6);
                assert.ok(workers.every(worker=>worker.exited));
                console.log(JSON.stringify({completeFiles:10759,privateGraph:true,timestamps:true,readOnlySource:true,siblingValidation:true,rejectionAndRetry:true,drained:true}));
            })().finally(()=>{
                threads.Worker=NativeWorker;
                if(priorTmp===undefined)Reflect.deleteProperty(process.env,'TMPDIR');else process.env.TMPDIR=priorTmp;
                fs.chmodSync(path.join(root,'node_modules/@fromstan/pokie/assets/0'),0o755);
                fs.rmSync(root,{recursive:true,force:true});
            }).catch(error=>{console.error(error);process.exitCode=1;});
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 90_000}));
        expect(result).toEqual({completeFiles: 10759, privateGraph: true, timestamps: true, readOnlySource: true, siblingValidation: true, rejectionAndRetry: true, drained: true});
    }, 100_000);

    it("preserves oversized browser and API logs losslessly within immutable evidence bounds", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {createHash} from 'node:crypto';
            import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
            import {tmpdir} from 'node:os';
            import path from 'node:path';
            import {P805_MAX_EVIDENCE_BYTES,preserveP805Log,readP805Log} from './scripts/p8-05-packed-output-evidence.mjs';
            const directory=await mkdtemp(path.join(tmpdir(),'p805-bounded-logs-'));
            const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
            // Exact completion event retained in AsM99I/e6cb59bb9b9449fd/browser.json.
            // The failing tuple's oversized browser bytes were never published.
            const retained={"method":"Network.loadingFinished","params":{"requestId":"2314961.71","timestamp":466121.167379,"encodedDataLength":630}};
            const observationIds=['simulation-success-failure-cancellation'];
            let writes=0,rejected=0;
            try {
                for(const kind of ['browser-log','api-log']) {
                    const entries=new Map();
                    const save=async (kind,name,content,observationIds)=>{
                        const bytes=Buffer.from(content),evidenceId='log-'+(++writes);
                        assert.ok(bytes.length>0 && bytes.length<=P805_MAX_EVIDENCE_BYTES);
                        const target=path.join(directory,evidenceId+'-'+name);
                        await writeFile(target,bytes,{flag:'wx'});
                        const contents=await readFile(target);
                        assert.equal(digest(contents),digest(bytes));
                        entries.set(evidenceId,{item:{kind,path:target,observationIds,sha256:digest(bytes),sizeBytes:bytes.length},contents});
                        return evidenceId;
                    };
                    const name=kind==='browser-log'?'browser.json':'api.json';
                    const legacy=[retained];
                    await preserveP805Log(kind,name,legacy,observationIds,save);
                    assert.deepEqual(readP805Log(kind,entries),legacy);
                    assert.deepEqual([...entries.values()][0].contents,Buffer.from(JSON.stringify(legacy)));
                    entries.clear();
                    // Repeated polling crosses 5 MiB; UTF-8 also crosses chunk boundaries.
                    const values=[...Array.from({length:5000},()=>({...retained,diagnostic:'ж'.repeat(600)})),
                        {method:'Runtime.exceptionThrown',params:{exceptionDetails:{text:'retained exception'}}},
                        {method:'Network.loadingFailed',params:{requestId:retained.params.requestId,errorText:'net::ERR_ABORTED'}}];
                    const original=Buffer.from(JSON.stringify(values));
                    assert.ok(original.length>P805_MAX_EVIDENCE_BYTES);
                    const id=await preserveP805Log(kind,name,values,observationIds,save);
                    assert.deepEqual(Buffer.from(JSON.stringify(readP805Log(kind,entries))),original);
                    const anchor=entries.get(id),manifest=JSON.parse(anchor.contents);
                    assert.ok(manifest.chunks.length>5);
                    assert.equal(readP805Log(kind,entries).filter(event=>event.method==='Runtime.exceptionThrown').length,1);
                    assert.equal(readP805Log(kind,entries).filter(event=>event.method==='Network.loadingFailed').length,1);
                    const reject=(alter)=>{
                        const changed=new Map([...entries].map(([id,entry])=>[id,{item:{...entry.item},contents:Buffer.from(entry.contents)}]));
                        const changedManifest=structuredClone(manifest);
                        alter(changed,changedManifest);
                        changed.get(id).contents=Buffer.from(JSON.stringify(changedManifest));
                        assert.throws(()=>readP805Log(kind,changed));
                        rejected++;
                    };
                    const first=manifest.chunks[0].evidenceId;
                    reject(map=>map.delete(first));
                    reject(map=>{map.get(first).contents[0]^=1;});
                    reject(map=>{map.get(first).item.kind='other-log-chunk';});
                    reject(map=>{map.get(first).item.observationIds=['another-workflow'];});
                    reject((_,m)=>{m.chunks.reverse();});
                    reject((_,m)=>{m.chunks[1]={...m.chunks[0]};});
                    reject((_,m)=>{m.chunks[0].sizeBytes=P805_MAX_EVIDENCE_BYTES+1;});
                    reject((_,m)=>{m.sizeBytes++;});
                    reject((_,m)=>{m.sha256='0'.repeat(64);});
                    reject(map=>map.set('orphan',{item:{kind:kind+'-chunk',observationIds},contents:Buffer.from('lost')}));
                    reject(map=>map.set('duplicate',{...anchor}));
                    entries.set(id,{...anchor,contents:Buffer.from('[]')});
                    assert.throws(()=>readP805Log(kind,entries),/unreferenced/);
                    rejected++;
                }
                console.log(JSON.stringify({largeLogs:2,legacyArraysPreserved:2,allEventsPreserved:true,rejected}));
            } finally {await rm(directory,{recursive:true,force:true});}
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 15_000}));
        expect(result).toEqual({largeLogs: 2, legacyArraysPreserved: 2, allEventsPreserved: true, rejected: 24});
    });

    it("reads chunked API transactions at the packed acceptance boundary without losing assertions", async () => {
        const {preserveP805Log, P805_MAX_EVIDENCE_BYTES} = await loadLogEvidence();
        const values = [{browserRequestId: "captured-request", transaction: {pointerActivations: []}, body: "ж".repeat(P805_MAX_EVIDENCE_BYTES)}];
        const evidence: CapturedLogEvidence[] = [];
        const bytesByPath = new Map<string, Buffer>();
        await preserveP805Log("api-log", "api.json", values, ["simulation-success-failure-cancellation"], (kind: string, file: string, content: string | Buffer, observationIds: string[]) => {
            const bytes = Buffer.from(content);
            const evidenceId = `log-${evidence.length}`;
            evidence.push({evidenceId, kind, path: file, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length, observationIds});
            bytesByPath.set(file, bytes);
            return Promise.resolve(evidenceId);
        });
        const readArtifact = (file: string) => Promise.resolve(bytesByPath.get(file)!);
        expect(await readCapturedApiLog(evidence, readArtifact)).toEqual(values);
        const chunk = evidence.find((item) => item.kind === "api-log-chunk")!;
        bytesByPath.get(chunk.path)![0] ^= 1;
        await expect(readCapturedApiLog(evidence, readArtifact)).rejects.toThrow();
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

    it("waits for simulation and replay preparation beyond the control deadline with bounded exact-job terminals", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {readP805RenderedTerminal,readP805RenderedOperationTerminal} from './scripts/p8-05-valera-browser-audit.mjs';
            // Exact slow-job fields retained in Bcuiaz/initial-audit-failure.json.
            // This boundary regression does not recollect installed acceptance.
            const id='e5ffa6f0b4e94ce4930a4ba81bbefc6c';
            const preparing={id,status:'running',progress:{stage:'preparing',unit:'accepted plays',current:0,total:1},roundsCompleted:0,requestedRounds:1};
            const originalNow=Date.now,originalTimeout=globalThis.setTimeout;
            let elapsed,cdp,deliver,bodies,reads;
            const reset=(pathname,terminal='completed',wrongJob=false,httpStatus=200)=>{
                elapsed=0;bodies=new Map();reads=[];cdp={events:[],send:async(_method,{requestId})=>{reads.push(requestId);return {body:JSON.stringify(bodies.get(requestId))};}};
                deliver=()=>{
                    const requestId=String(elapsed),settled=elapsed>=75000&&terminal!==null;
                    bodies.set(requestId,settled?{id:wrongJob?'other-job':id,status:terminal,error:terminal==='failed'?'snapshot validation failed':undefined}:preparing);
                    cdp.events.push({method:'Network.responseReceived',params:{requestId,response:{url:'http://localhost'+pathname,status:settled?httpStatus:200}}});
                };
                deliver();
            };
            Date.now=()=>elapsed;
            globalThis.setTimeout=(callback,ms,...args)=>{
                if(ms===125){elapsed+=15000;deliver();return originalTimeout(callback,0,...args);}
                return originalTimeout(callback,ms,...args);
            };
            try {
                for(const kind of ['simulations','replays']){
                    const pathname='/api/project/'+kind+'/'+id;
                    const observe=()=>readP805RenderedTerminal(cdp,0,pathname,['completed'],'successful '+kind+' rendered terminal result');
                    reset(pathname);
                    const terminal=await observe();
                    assert.equal(elapsed,75000);
                    assert.equal(terminal.payload.id,id);
                    assert.equal(terminal.payload.status,'completed');
                    assert.deepEqual(reads,['0','15000','30000','45000','60000','75000']);
                    for(const status of ['failed','cancelled']){
                        reset(pathname,status);
                        await assert.rejects(observe(),new RegExp('unexpected terminal:.*'+status));
                        assert.equal(elapsed,75000);
                    }
                    reset(pathname,'completed',false,500);
                    await assert.rejects(observe(),/unexpected terminal/);
                    for(const wrongJob of [false,true]){
                        reset(pathname,wrongJob?'completed':null,wrongJob);
                        await assert.rejects(observe(),/Timed out.*observed job:.*running.*preparing.*requestedRounds/);
                        assert.equal(elapsed,135000,'one finite 120s job budget, never renewed by progress');
                    }
                    reset(pathname);
                    await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['completed'],'explicit deadline',15000),/Timed out/);
                    assert.equal(elapsed,30000);
                    const contract={body:kind==='simulations'?'simulation':'replay',poll:'/api/project/'+kind+'/{id}'};
                    const api=[];
                    const observeOperation=()=>readP805RenderedOperationTerminal({cdp,cursor:0,contract,entry:{browserRequestId:'submission'},jobId:id,readBrowserResponseBody:requestId=>cdp.send('Network.getResponseBody',{requestId}),observation:'delayed '+kind,api});
                    reset(pathname);
                    const operation=await observeOperation();
                    assert.equal(elapsed,75000);
                    assert.equal(operation.result.status,'completed');
                    assert.equal(api[0].payload.id,id);
                    for(const status of ['failed','cancelled']){
                        reset(pathname,status);
                        await assert.rejects(observeOperation(),new RegExp('terminal-failure.*'+status));
                    }
                    reset(pathname,'completed',true);
                    await assert.rejects(observeOperation(),/uncorrelated-poll/);
                    reset(pathname,'completed',false,500);
                    await assert.rejects(observeOperation(),/server-error/);
                    reset(pathname,null);
                    await assert.rejects(observeOperation(),/slow-job.*preparing/);
                    assert.equal(elapsed,135000);
                }
                const ordinary='/api/project/other-jobs/'+id;
                reset(ordinary);
                await assert.rejects(readP805RenderedTerminal(cdp,0,ordinary,['completed'],'ordinary control'),/Timed out/);
                assert.equal(elapsed,45000,'unrelated controls retain the 30s deadline');
            } finally {Date.now=originalNow;globalThis.setTimeout=originalTimeout;}
            console.log(JSON.stringify({delayedJobs:2,operationCallers:2,exactJobs:true,terminalAndHttpFailuresRejected:true,finiteBudgets:true,explicitAndOrdinaryDeadlinesPreserved:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({delayedJobs: 2, operationCallers: 2, exactJobs: true, terminalAndHttpFailuresRejected: true, finiteBudgets: true, explicitAndOrdinaryDeadlinesPreserved: true});
    });

    it("waits for Outcome Library analysis beyond 120s and preserves exact first-terminal failures", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {createHash} from 'node:crypto';
            import {readP805RenderedOperationTerminal} from './scripts/p8-05-valera-browser-audit.mjs';
            // Progress fields copied from the retained UyGLW5 slow-job record.
            // These boundary fixtures are not new browser acceptance evidence.
            const jobId='c8b5123c-26b2-4704-8579-a0899f201898';
            const progress={stage:'Analyzing outcomes',unit:'outcome records',current:'5632',total:'10000',message:'Analyzing Outcome mode base (pass 2 of 2)'};
            const active={id:jobId,status:'running',lifecycleStage:'analyzing',durableProgress:progress};
            const entry={browserRequestId:'2112492.320'};
            const contract={body:'outcome-library',poll:'/api/project/outcome-libraries/jobs/{id}'};
            const pathname=contract.poll.replace('{id}',jobId);
            const originalNow=Date.now, originalTimeout=globalThis.setTimeout;
            let elapsed=0, cdp, reads, snapshots, bodies, deliver, api;
            const event=(requestId,url=pathname,status=200)=>({method:'Network.responseReceived',params:{requestId,response:{url:'http://localhost'+url,status}}});
            const append=(requestId,payload,status=200)=>{bodies.set(requestId,payload);cdp.events.push(event(requestId,pathname,status));};
            const reset=(next)=>{
                elapsed=0;reads=[];api=[];snapshots=[{source:'start-response',browserRequestId:entry.browserRequestId,jobId,durableStatus:'queued'}];
                bodies=new Map();cdp={events:[event('stale')]};deliver=next;
                append('2112492.942',active);
            };
            const observe=(selectedContract=contract)=>readP805RenderedOperationTerminal({cdp,cursor:1,contract:selectedContract,entry,jobId,progressSnapshots:snapshots,observation:'outcome-library-report-diff-replay',api,readBrowserResponseBody:async requestId=>{
                reads.push(requestId);
                const payload=bodies.get(requestId);
                if(payload instanceof Error)throw payload;
                return {body:JSON.stringify(payload)};
            }});
            Date.now=()=>elapsed;
            globalThis.setTimeout=(callback,ms,...args)=>{
                if(ms===125){elapsed+=30000;deliver?.();return originalTimeout(callback,0,...args);}
                return originalTimeout(callback,ms,...args);
            };
            try {
                reset(()=>{if(elapsed===150000)append('completed',{id:jobId,status:'completed',result:{status:'ok',outputPath:'/generated-outcomes'}});});
                const completed=await observe();
                assert.equal(elapsed,150000,'analysis may finish after the former 120s observer budget');
                assert.equal(completed.event.params.requestId,'completed');
                assert.equal(api[0].browserRequestId,'completed');
                assert.equal(completed.result.result.outputPath,'/generated-outcomes');
                assert.deepEqual(reads,['2112492.942','completed'],'ignore pre-activation polls and read each captured body once');
                assert.deepEqual(snapshots[1].durableProgress,progress);
                assert.equal(snapshots[1].responseSha256,createHash('sha256').update(JSON.stringify(active)).digest('hex'));
                assert.equal(snapshots.at(-1).durableStatus,'completed');
                for(const payload of [{id:jobId,status:'failed',error:'analysis failed'},{id:jobId,status:'cancelled'},{id:jobId,status:'completed',result:{status:'invalid'}}]){
                    reset(()=>{if(elapsed===150000){append('first-terminal',payload);append('later-success',{id:jobId,status:'completed'});}});
                    await assert.rejects(observe(),error=>{
                        assert.equal(error.kind,'terminal-failure');
                        assert.equal(error.details.requestId,entry.browserRequestId);
                        assert.equal(error.details.jobId,jobId);
                        assert.deepEqual(error.details.firstTerminal.result,payload);
                        assert.equal(error.details.firstTerminal.browserRequestId,'first-terminal');
                        assert.equal(reads.includes('later-success'),false);
                        assert.deepEqual(api.map(receipt=>receipt.payload),[payload],'retain the first terminal API record even on failure');
                        return true;
                    });
                }
                reset(()=>{if(elapsed===150000)append('wrong-job',{id:'foreign-job',status:'completed'});});
                await assert.rejects(observe(),error=>error.kind==='uncorrelated-poll'&&error.details.jobId===jobId);
                reset(()=>{if(elapsed===150000)append('server-error',{},500);});
                await assert.rejects(observe(),error=>error.kind==='server-error'&&error.details.lastObserved.httpStatus===500);
                reset(()=>append('progress-'+elapsed,{...active,durableProgress:{...progress,current:String(5632+elapsed/30000)}}));
                await assert.rejects(observe(),error=>{
                    assert.equal(error.kind,'slow-job');
                    assert.equal(error.details.jobId,jobId);
                    assert.equal(error.details.lastObserved.lifecycleStage,'analyzing');
                    assert.equal(error.details.progressSnapshots,snapshots);
                    assert.ok(snapshots.length>2,'retain every advancing poll without extending the deadline');
                    return true;
                });
                assert.equal(elapsed,330000,'one fixed five-minute operation budget');
                reset();cdp.events.length=1;
                await assert.rejects(observe(),error=>error.kind==='missing-poll');
                assert.equal(elapsed,330000);
                reset();bodies.set('2112492.942',new Error('expired response body'));
                await assert.rejects(observe(),error=>error.kind==='poll-read-failure'&&error.details.lastObserved.readError.includes('expired response body'));
                reset();
                await assert.rejects(observe({...contract,body:'simulation'}),error=>error.kind==='slow-job');
                assert.equal(elapsed,60000,'ordinary durable controls retain their 30s budget');
            } finally {Date.now=originalNow;globalThis.setTimeout=originalTimeout;}
            console.log(JSON.stringify({delayedTerminal:true,firstTerminalFailures:3,wrongJobRejected:true,httpFailureRejected:true,progressRetained:true,boundedDespiteProgress:true,missingAndUnreadableRejected:true,ordinaryBudgetPreserved:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({delayedTerminal: true, firstTerminalFailures: 3, wrongJobRejected: true, httpFailureRejected: true, progressRetained: true, boundedDespiteProgress: true, missingAndUnreadableRejected: true, ordinaryBudgetPreserved: true});
    });

    it("waits for reload cancellation cleanup beyond the control deadline with a bounded exact-job terminal", () => {
        const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import {readP805RenderedTerminal} from './scripts/p8-05-valera-browser-audit.mjs';
            const id='a2b85598802f4c89bef83e27cee30734', pathname='/api/project/simulations/'+id;
            const preparing={id,status:'cancelling',progress:{stage:'preparing',unit:'accepted plays',current:0,total:1800000},roundsCompleted:0,requestedRounds:1800000};
            const originalNow=Date.now, originalTimeout=globalThis.setTimeout;
            let elapsed=0, cdp, terminal, reads;
            const event=()=>({method:'Network.responseReceived',params:{requestId:String(elapsed),response:{url:'http://localhost'+pathname,status:200}}});
            const reset=(status, wrongJob=false)=>{
                elapsed=0; terminal=status; reads=[];
                cdp={events:[event()],send:async (_method,{requestId})=>{
                    reads.push(requestId);
                    const settled=Number(requestId)>=60000;
                    return {body:JSON.stringify(settled&&terminal ? {id:wrongJob?'other-job':id,status:terminal} : preparing)};
                }};
            };
            Date.now=()=>elapsed;
            globalThis.setTimeout=(callback,ms,...args)=>{
                if(ms===125){elapsed+=15000;cdp.events.push(event());return originalTimeout(callback,0,...args);}
                return originalTimeout(callback,ms,...args);
            };
            try {
                reset('cancelled');
                const cancelled=await readP805RenderedTerminal(cdp,0,pathname,['cancelled'],'active-job reload rendered terminal result');
                assert.equal(elapsed,60000);
                assert.equal(cancelled.payload.id,id);
                assert.equal(cancelled.payload.status,'cancelled');
                assert.deepEqual(reads,['0','15000','30000','45000','60000']);
                reset('completed');
                await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['cancelled'],'unexpected completion'),/unexpected terminal:.*completed/);
                reset('failed');
                await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['cancelled'],'failed cleanup'),/unexpected terminal:.*failed/);
                for(const wrongJob of [false,true]){
                    reset(wrongJob?'cancelled':undefined,wrongJob);
                    await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['cancelled'],'stuck cleanup'),/Timed out.*observed job:.*cancelling.*preparing.*1800000/);
                    assert.equal(elapsed,135000,'cleanup has one finite 120s budget');
                }
                reset(undefined);
                await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['completed'],'simulation terminal'),/Timed out/);
                assert.equal(elapsed,135000,'simulation preparation has one finite 120s deadline');
                reset(undefined);
                await assert.rejects(readP805RenderedTerminal(cdp,0,pathname,['cancelled'],'explicit deadline',15000),/Timed out/);
                assert.equal(elapsed,30000,'explicit caller budgets remain authoritative');
            } finally {Date.now=originalNow;globalThis.setTimeout=originalTimeout;}
            console.log(JSON.stringify({delayedCancellation:true,exactJob:true,unexpectedTerminalsRejected:2,boundedTimeouts:2,simulationDeadlineBounded:true,explicitDeadlinePreserved:true}));
        `], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 10_000}));
        expect(result).toEqual({delayedCancellation: true, exactJob: true, unexpectedTerminalsRejected: 2, boundedTimeouts: 2, simulationDeadlineBounded: true, explicitDeadlinePreserved: true});
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

});
