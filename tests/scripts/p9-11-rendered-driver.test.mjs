// Offline implementation contracts only. Never independent browser evidence.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, writeFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {deflateSync} from "node:zlib";
import {afterEach, test} from "@jest/globals";
import {COVERAGE, runItinerary, button, input, paintedOutline, drainDriverChild, reloadPage, main, renderedStakeExpression, assertRenderedStake, contactSheet, decodePng, navigateSurface, focusNativeTarget, openDisclosure, waitGenerationPreflight} from "../../scripts/p9-11-rendered-driver.mjs";
import {P911_RENDERED_COVERAGE, validateActionCoverage} from "../../scripts/p9-11-corrective-closeout.mjs";
const {JSDOM} = createRequire(import.meta.url)("jsdom");

const windows = [];
afterEach(() => {for (const window of windows.splice(0)) window.close();});
const digest = "a".repeat(64);
const driverPath = new URL("../../scripts/p9-11-rendered-driver.mjs", import.meta.url);

// Explicit DOM workflow fixtures, not browser proof. Unknown expressions execute
// against this DOM and fail: there is no universally-successful evaluate fallback.
function surface(id, fault) {
    const request = {id, candidateId:"b".repeat(40), archiveSha256:digest, profileId:`fixture-${id}`, profileRoot:"/fixture/profile"};
    const memory = new Map(), receipts = [], activations = [], history = [], images = [], viewports = [];
    const row = {id:"record-own", seed:"p911-mathematician", modeName:"base", startedAt:"2026-10-10T12:00:00.000Z"};
    const analysis = {totalWeight:"18446744073709551616", hitFrequency:2**-64, maxWinProbability:2**-64, rtp:2**-63, variance:2**-62, standardDeviation:2**-31};
    const dom = new JSDOM('', {url:'http://fixture/#/home/design',runScripts:'outside-only'});
    windows.push(dom.window);
    Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(){return this.closest('[hidden]') ? [] : [{}];}});
    Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
    let prerequisiteDone=false;
    let savedCount=0, currentProject='/fixture/design.json', destination, target, buildCount=0, previews=0, afterReload=false, progressRead=false;
    let route='home/design', section='Game basics', advanced=false, generatorOpen=false, generationAdvanced=false, generatorDone=false, drawn=false, replayLoaded=false, compared=false, guarded=false, started=false, spun=false, simulation=false, terminal=false, occupiedError=false;
    const opened = new Set(), completed = new Set(), values = new Map(), submissions = [];
    const output = target => `/fixture/${target}`;
    const prerequisiteRoot = '/fixture/profile/workspace/compatible-outcome-library';
    const sections = ['Game basics','Layout','Symbols','Reels','Paytable','Bets'];
    dom.window.document.body.addEventListener('keydown', event => {
        if (!['ArrowRight','ArrowLeft'].includes(event.key) || event.target.getAttribute('role') !== 'tab' || fault==='tab-only') return;
        const tabs = [...dom.window.document.querySelectorAll('[role=tab]')];
        const next = tabs[(tabs.indexOf(event.target) + (event.key==='ArrowRight'?1:tabs.length-1)) % tabs.length];
        section=next.textContent;
        for (const tab of tabs) tab.setAttribute('aria-selected',String(tab===next));
        for (const panel of dom.window.document.querySelectorAll('[role=tabpanel]')) panel.hidden=panel.id!==next.getAttribute('aria-controls') || fault==='wrong-panel';
        next.focus(); // Native roving-tab key handler, never a target-focus shortcut.
    });
    const field = (label,value='') => `<label>${label}<input aria-label="${label}" value="${values.get(label) ?? value}"></label>`;
    const result = (id,output='') => `<div data-pokie-lifecycle-result-job="${id}" data-pokie-lifecycle-terminal="completed" data-pokie-lifecycle-result-output="${output}">Build completed ${target} Stake prerequisite: reuse (borrowed)</div>`;
    const render = () => {
        dom.window.location.hash=route.startsWith('home/') ? '/'+route : `/project/${encodeURIComponent(currentProject)}/${route}`;
        let html='Local artifacts do not deploy a game or certify it for real-money use.';
        if(route==='home/design') html+=`<div role="tablist" aria-label="Game design sections">${sections.map((label,index)=>`<button role="tab" tabindex="${index===0?0:-1}" aria-selected="${section===label}" aria-controls="section-${index}">${label}</button>`).join('')}</div>${sections.map((label,index)=>`<div role="tabpanel" id="section-${index}" ${section===label?'':'hidden'}>${label==='Paytable'?field('A x2 payout'):''}</div>`).join('')}<button>Create game</button><button>Show advanced options (file and JSON tools)</button><fieldset ${advanced?'':'hidden'}><legend>Build</legend>${destination??''}${field('Output directory')}<button>Build Preview</button><button>Build Package</button>${occupiedError?'Choose a new destination; contains existing files.':''}${completed.has('design')?'Last built':''}</fieldset>`;
        if(route==='home/projects') html+=`${field('Game location')}<button>Check game</button><div>Found a Game export</div><button>Add to projects</button><div class="project-registry-entry">rare-stake ${currentProject} /fixture/design.json /fixture/outcomeLibrary<button>Open</button></div>`;
        if(!route.startsWith('home/')) html+='<button>Close project</button>';
        if(route==='overview') {
            html+='Valid — no issues found. Game export <button>Open Play</button>';
            if(fault!=='uncommitted-overview') html+='<div data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="rendered"></div>';
            if(fault==='retained-editor') html+='<div id="home-design-panel"><button id="blueprint-create-game">Create game</button></div>';
            if(id==='stake-uint64-total') html+=`<table data-testid="outcome-source-mode-table"><thead><tr><th>Mode</th><th>RTP</th><th>Hit frequency</th></tr></thead><tbody><tr><td>base</td><td>${fault==='rendered-zero'?'0.00%':'1.0842e-17%'}</td>${fault==='rendered-missing'?'':`<td>5.4210e-18%</td>`}</tr></tbody></table>`;
            if(currentProject===output('outcomeLibrary')) html+=`${field('Seed (optional)')}<button>Draw an outcome</button>${drawn?'Saved in Replay Recent':''}`;
        }
        if(route==='exportDeploy') {
            for(const t of ['stakeAdapter','parWorkbook','tsPackage']) html+=`<div data-pokie-lifecycle-form="artifact-build"><button aria-expanded="${opened.has(t)}">Configure ${t}</button><div ${opened.has(t)?'':'hidden'}><button id="artifact-build-${t}">Build</button>${completed.has(t)?result('job-'+t,output(t)):''}</div></div>`;
            if(fault!=='absent-generator') html+=`<div data-pokie-lifecycle-form="outcome-library"><button aria-expanded="${generatorOpen}">Configure generator</button><div ${generatorOpen?'':'hidden'}><button id="outcome-library-generation-sampled">Sampled</button>${field('Sample size')}<button>Show Advanced generation controls</button><fieldset ${generationAdvanced?'':'hidden'}>${field('Coverage seed')}</fieldset><div data-pokie-lifecycle-preflight="outcome-library" data-pokie-lifecycle-preflight-status="ok"></div><button id="outcome-library-generate" ${fault==='disabled-generator'?'disabled':''}>Generate sampled outcome library (base)</button>${generatorDone?result('generator-own')+`<button data-pokie-lifecycle-artifact-output="${output('outcomeLibrary')}">Inspect library</button>`:''}</div></div>`;
        }
        if(route==='play') html+=`<button>Show advanced details (seed)</button><div ${advanced?'':'hidden'}>${field('Seed (optional)')}</div>${started?'<span class="player-bet-current">Bet: 1</span><button>Spin</button>':'<button>New Play session</button>'}${spun?'Round complete':''}`;
        if(route==='simulation') html+=`${field('Rounds')}<button>Show advanced details (seed, workers)</button><fieldset ${advanced?'':'hidden'}>${field('Seed (optional)')}${field('Workers')}</fieldset><button>Run Simulation</button><button id="simulation-configure">Configure</button>${simulation?`<div role="region" aria-label="simulation job simulation-own"><div class="studio-job-card"></div><div data-pokie-lifecycle-result-job="simulation-own" ${terminal?'data-pokie-lifecycle-terminal="completed"':''}>${terminal?'Completed Open full report':'Running'}<button>Cancel</button></div></div>`:''}`;
        if(route==='replay') html+=`<li>${row.id} ${row.seed} ${row.modeName} ${row.startedAt}<button>Inspect record ${row.id}</button><button>Reproduce &amp; compare record ${row.id}</button></li>${replayLoaded?`Record ${row.id}<button ${fault==='replay-disabled'?'disabled':''}>Reproduce</button>`:''}${compared?'Verified -- matches the recorded result':''}`;
        if (guarded) html+='<button id="design-navigation-guard-leave">Leave</button>';
        dom.window.document.body.innerHTML=html;
    };
    render();
    const simInputs = () => ({rounds:Number(values.get('Rounds')),seed:values.get('Seed (optional)'),workers:Number(values.get('Workers'))});
    const tamper = (inputs) => fault==='submitted-seed' ? {...inputs,seed:undefined} : fault==='submitted-workers' ? {...inputs,workers:2} : fault==='submitted-rounds' ? {...inputs,rounds:10} : inputs;
    const s = {
        resultPath:'/fixture/results/result.json',
        read:async file => {
            if(memory.has(file)) return memory.get(file);
            if(file.endsWith('stake-uint64-total.public.json')) return JSON.stringify({...request,observations:[{analysis}]});
            if(file.endsWith('design.json')) return JSON.stringify({manifest:{id:'tiny'},reels:2,paytable:{A:{2:7}}});
            if(file.endsWith('package.json')) return JSON.stringify({name:'tiny'});
            if(file.endsWith('manifest.json')) return Buffer.from(fault==='manifest' && completed.has('stakeAdapter') ? 'changed manifest' : JSON.stringify({modes:[{modeName:'base',generator:{strategy:'bounded-coverage',sampledRawCount:5000,seed:fault==='generator-persisted-seed'?'wrong':`p911-${id}-library`}}]}));
            return Buffer.from('published artifact');
        },
        write:async (file,bytes) => memory.set(file,bytes), mkdir:async()=>{},
        receipt:async (key,observed,raw) => {receipts.push({key,observed,raw});return {path:`/fixture/${key}.json`,sha256:digest};},
        capture:async observation => ({bytes:png(true),viewport:{width:viewports.at(-1)?.[0],height:viewports.at(-1)?.[1]},...observation}),
        image:async (name,panels) => {images.push({name,panels});return {path:`/fixture/${name}.png`,sha256:digest};},
        cli:async argv => ({stdout:argv[0]==='--help'?'Open Studio Home:\npokie build\n':argv[0]==='inspect'?'PAR workbook':'Artifact "parWorkbook" built',stderr:'',exitCode:0}),
        navigate:async label => {history.push(label);route=({'Your projects':'home/projects','Start a game':'home/design','Build/Export':'exportDeploy','Simulation':'simulation','Overview':'overview','Replay':'replay'})[label]; advanced=false;render();},
        activate:async expression => {
            const element=dom.window.eval(expression);
            assert.ok(element && element.getClientRects().length && !element.disabled,`missing/disabled native control: ${expression}`);
            await s.focus(expression);
            activations.push(expression);
            const label=element.textContent.trim();
            if(label==='Create game') {savedCount++;currentProject=savedCount===1?'/fixture/design.json':'/fixture/second-design.json';route='overview';}
            if(label==='Open Play') route='play';
            if(label==='New Play session') {started=true;submissions.push({route:'/api/project/play/session',request:tamper({seed:values.get('Seed (optional)')})});}
            if(label==='Spin') {spun=true;submissions.push({route:'/api/project/play/sessions/session-own/spin',request:{bet:fault==='submitted-bet'?2:1}});}
            if(label.startsWith('Show advanced')) advanced=true;
            if(label==='Show Advanced generation controls') generationAdvanced=true;
            if(label==='Configure generator') generatorOpen=true;
            if(label.startsWith('Configure ')) opened.add(label.split(' ')[1]);
            if(label==='Build') {target=element.id.slice('artifact-build-'.length);completed.add(target);buildCount++;}
            if(element.id==='outcome-library-generate') {generatorDone=true;buildCount++;submissions.push({route:'/api/project/outcome-libraries/generate/jobs',request:{mode:'base',generation:'sampled',sample:{sampleSize:values.get('Sample size'),seed:fault==='generator-submitted-seed'?'wrong':values.get('Coverage seed')},preflightToken:fault==='token-drift'?'stale-token':'matching-token'}});}
            if(label==='Inspect library') {currentProject=output('outcomeLibrary');route='overview';}
            if(label==='Draw an outcome') {drawn=true;submissions.push({route:'/api/project/outcome-source/sample',request:{seed:values.get('Seed (optional)')}});}
            if(label.startsWith('Reproduce & compare')) replayLoaded=true;
            if(label==='Reproduce') {if(fault!=='comparison-missing')submissions.push({route:'/api/project/replays',request:{recordId:row.id}});compared=fault!=='comparison-terminal';}
            if(label==='Close project') route='home/projects';
            if(label==='Open') {if(fault==='dirty-guard') guarded=true;else {submissions.push({route:'/api/home/projects/open'});route='overview';currentProject=id==='mathematician'?output('outcomeLibrary'):'/fixture/design.json';}}
            if(label==='Leave') {submissions.push({route:'/api/home/projects/open'});guarded=false;route='overview';currentProject=id==='mathematician'?output('outcomeLibrary'):'/fixture/design.json';}
            if(label==='Build Package') {occupiedError=destination.endsWith('occupied');if(!occupiedError)completed.add('design');}
            if(label==='Run Simulation') {simulation=true;submissions.push({route:'/api/project/simulations',request:tamper(simInputs())});}
            render();
        },
        fill:async (expression,value) => {
            const element=dom.window.eval(expression);assert.ok(element && element.getClientRects().length,`missing input: ${expression}`);
            await s.focus(expression);
            values.set(element.getAttribute('aria-label'),value);element.value=value;
            if(expression.includes('Output directory')) destination=value;
            if(['Sample size','Coverage seed'].includes(element.getAttribute('aria-label'))) {
                submissions.push({route:'/api/project/outcome-libraries/generate/estimate',request:{mode:'base',generation:'sampled',sample:{sampleSize:values.get('Sample size'),seed:values.get('Coverage seed')}}});
            }
        },
        evaluate:async expression => dom.window.eval(expression),
        until:async (fn,message) => {for(let attempt=0;attempt<6;attempt++){const value=await fn();if(value)return value;}assert.fail(`fixture boundary did not satisfy ${message}`);},
        preflight:async (route,after,matchesRequest,renderedReady,label) => waitGenerationPreflight({
            readResponse:async () => {const entry=submissions.slice(after).filter(e=>e.route===route).at(-1);return entry ? {...entry,request:fault==='stale-preflight'?{...entry.request,sample:{...entry.request.sample,seed:'previous-seed'}}:entry.request,status:200,body:{status:fault==='failed-preflight'?'conflict':'ok',preflightToken:fault==='missing-token'?undefined:'matching-token'}} : null;},
            matchesRequest, renderedReady, until:s.until, label,
        }),
        mark:() => submissions.length,
        requests:(route,after=0) => {
            if(route==='/api/home/blueprints/build')return fault==='occupied-submit'?[{request:{}}]:[];
            if(route==='/api/project/artifacts/build')return [{request:{target:'stakeAdapter',preparedOperationId:fault==='stale-plan'?'initial':'refreshed'}}];
            const matches=submissions.slice(after).filter(entry=>entry.route===route);
            return fault==='duplicate' || (fault==='comparison-duplicate' && route==='/api/project/replays') ? matches.concat(matches):matches;
        },
        response:async route => {
            const request=submissions.findLast(entry=>entry.route===route)?.request;
            if(route==='/api/home/blueprints/build-preview')return {status:200,request:{blueprint:{manifest:{id:'tiny'}},outDir:destination},body:{status:'ok',projectRoot:destination,destinationHasContent:destination.endsWith('occupied')}};
            if(route==='/api/home/blueprints/build')return {status:201,body:{status:'ok',projectRoot:fault==='publication'?'/wrong':destination}};
            if(route==='/api/project/outcome-source/sample')return {request,body:{replayId:row.id,replay:{seed:row.seed}}};
            if(route==='/api/project/outcome-libraries/generate/jobs')return {status:202,request,body:{job:{id:'generator-own'}}};
            if(route==='/api/project/simulations')return {request,body:{id:'simulation-own'}};
            if(route==='/api/project/play/session')return {request,body:{session:{sessionId:'session-own',credits:1000,bet:1}}};
            return {request,body:{status:'ok',session:{studioRound:1,studioSeed:'p911-producer-play',credits:fault==='accounting'?1000:1001,bet:1,win:2,debug:{artifact:{screen:[['A']]}}}}};
        },
        post:async (route,body) => {if(route==='/api/project/artifacts/build'){assert.deepEqual(body,{target:'outcomeLibrary',outDir:prerequisiteRoot});prerequisiteDone=true;return {status:202,body:{job:{id:'prerequisite-own'}}};}return route.endsWith('build-preview')?{status:200,body:{status:'ok',destinationHasContent:false}}:{status:200,body:{status:fault==='race'?'ok':'error'}};},
        get:async route => {
            if(route==='/api/project/context')return {report:{modes:[{modeName:'base',analysis:fault==='rare-moment'?{...analysis,variance:0}:analysis}]}};
            if(route==='/api/project/rounds')return [{sessionId:'session-own',studioRound:1,studioSeed:fault==='recorded-seed'?'wrong':'p911-producer-play',bet:1,win:2,credits:1001}];
            if(route==='/api/project/validate')return {valid:fault!=='invalid-design'};
            if(route==='/api/home/jobs')return {jobs:[{operation:'design-build',status:'completed',request:{destinationPath:destination}}]};
            if(route==='/api/project/jobs')return {jobs:currentProject.includes('second')?(fault==='isolation'?[{id:'simulation-own'}]:[]):[{id:'simulation-own',operation:'simulation'}]};
            if(route==='/api/project/replays')return fault==='replay-provenance'?[{...row,startedAt:undefined}]:[{...row}];
            if(route.startsWith('/api/project/outcome-libraries/generate/jobs/'))return {id:'generator-own',status:fault==='generator-terminal'?'failed':'completed',result:{status:'ok',resolvedBundleDir:fault==='generator-output'?'/wrong':output('outcomeLibrary')}};
            if(route.endsWith('/prerequisite-own'))return {id:'prerequisite-own',status:fault==='prerequisite-terminal'?'failed':'completed',result:{status:'ok',outputPath:fault==='prerequisite-output'?'/wrong':prerequisiteRoot}};
            if(route.startsWith('/api/project/artifacts/build/'))return {id:fault==='sibling-terminal'?'prerequisite-own':'job-stakeAdapter',status:'completed',result:{status:'ok',outputPath:output('stakeAdapter'),stakePrerequisiteProvenance:{route:fault==='direct-publish'?'publish':'reuse',disposition:fault==='direct-publish'?'none':'borrowed',selectedPrerequisiteLocation:fault==='borrowed'?'/wrong':prerequisiteRoot},plan:{source:{kind:fault==='project-switch'?'outcomeLibrary':'blueprint',canonicalLocation:fault==='project-switch'?output('outcomeLibrary'):currentProject}}}};
            if(route.startsWith('/api/project/jobs/simulation-own')) {
                if(!progressRead && id==='ui-ux'){progressRead=true;return {id:'simulation-own',status:'running',progress:{current:1}};}
                terminal=true;render();return {id:'simulation-own',status:'completed',request:fault==='persisted-seed'?{...simInputs(),seed:'wrong'}:simInputs()};
            }
            if(route.startsWith('/api/project/jobs/'))return {id:route.split('/').at(-1),status:fault==='terminal'?'failed':'completed'};
            if(route.startsWith('/api/project/reports/'))return {report:fault==='report-seed'?{...simInputs(),seed:'wrong'}:simInputs()};
            throw new Error(`unexpected public read: ${route}`);
        },
        latestPreview:async () => ++previews===1?{preparedOperationId:'initial',stakePreflight:{route:'generate'}}:prerequisiteDone?{preparedOperationId:'refreshed',stakePreflight:{route:'reuse',selectedPrerequisiteLocation:prerequisiteRoot},plan:{source:{kind:fault==='project-switch'?'outcomeLibrary':'blueprint',canonicalLocation:currentProject}}}:{preparedOperationId:'generated',stakePreflight:{route:'generate'}},
        reload:async () => {afterReload=true;},offline:async offline => {assert.ok(afterReload);dom.window.document.body.append(offline?'reconnecting automatically':'');if(!offline)render();},
        viewport:async (w,h) => viewports.push([w,h]),
        focus:expression => focusNativeTarget(expression, s),
        key:async key => {
            const document=dom.window.document;
            const event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
            document.activeElement.dispatchEvent(event);
            // JSDOM has no browser default Tab action. Model only sequential
            // native tab stops; never focus the helper's requested target.
            if(key==='Tab' && !event.defaultPrevented) {
                const stops=[...document.querySelectorAll('button,input,textarea,a[href],[tabindex]')].filter(e=>e.tabIndex>=0 && !e.disabled && e.getClientRects().length);
                const next=stops[(stops.indexOf(document.activeElement)+1)%stops.length];
                next?.focus();
            }
            document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keyup',{key,bubbles:true}));
        },
        focusGeometry:async () => ({focused:fault!=='focus-theft',insideViewport:fault!=='clipped'}),
        keepObject:async () => 'remote-common-card',sameObject:async () => fault!=='replaced-card',
        settle:async()=>{},painted:async()=>fault!=='unpainted',
    };
    return {request,s,receipts,activations,history,images,viewports,submissions,dom};
}

test('portable --describe declares exactly the consumer coverage, without launch dependencies', () => {
    const value=JSON.parse(execFileSync(process.execPath,[driverPath.pathname,'--describe'],{encoding:'utf8',timeout:5000}));
    assert.equal(value.kind,'verifier-driver-capabilities');
    assert.deepEqual(value.coverage,P911_RENDERED_COVERAGE);
    assert.deepEqual(COVERAGE,P911_RENDERED_COVERAGE);
});

for (const id of Object.keys(P911_RENDERED_COVERAGE)) {
    test(`${id}: implemented branch completes the entire exact action contract`, async () => {
        const f=surface(id);
        const result=await runItinerary(f.request,f.s);
        validateActionCoverage(id,result);
        assert.deepEqual(result.actions.map(a=>a.id).sort(),[...P911_RENDERED_COVERAGE[id]].sort());
        assert.ok(result.actions.every(a=>a.classification==='action'&&a.outcome==='passed'));
        assert.deepEqual(result.findings,[]);
        assert.equal(f.receipts.length,P911_RENDERED_COVERAGE[id].length);
        if (id==='programmer') {
            assert.equal(f.activations.filter(e=>e.includes('artifact-build-stakeAdapter')&&e.includes('=== "Build"')).length,1);
            assert.ok(!f.activations.some(e=>e.includes('Inspect library')));
            assert.equal(result.handoff.sourcePath,'/fixture/design.json');
            assert.equal(result.handoff.route,'reuse');
        }
        if (id==='mathematician') {
            const selection=f.activations.findIndex(e=>e.includes('Reproduce & compare record'));
            const comparison=f.activations.findIndex(e=>e.includes('=== "Reproduce"'));
            assert.ok(selection>=0 && comparison>selection);
            assert.equal(f.submissions.filter(e=>e.route==='/api/project/replays').length,1);
            assert.equal(f.receipts.find(e=>e.key==='mathematician.selected-exact-comparison').raw.comparisonSubmissions,1);
        }
        if (id==='mathematician' || id==='programmer') {
            const generated=f.submissions.filter(e=>e.route==='/api/project/outcome-libraries/generate/jobs');
            assert.equal(generated.length,1);assert.equal(generated[0].request.preflightToken,'matching-token');
        }
        if (id==='occupied-destination') assert.equal(f.activations.filter(e=>e.includes('=== "Build Package"')).length,2);
        if (id==='graphic-designer') {
            assert.deepEqual(f.images.map(image=>image.name),['graphic-home-design','graphic-project-build','graphic-running-job','graphic-settled-common-card']);
            assert.deepEqual(f.images[0].panels.filter(panel=>panel.surface==='Expanded Home Design build').map(panel=>panel.viewport.width),[1100,900,390]);
            assert.deepEqual(f.images.at(-1).panels.map(panel=>panel.viewport.width),[1100,390]);
        }
        f.dom.window.close();
    });
}

for (const [id, faults] of Object.entries({
    'stake-uint64-total':['rare-moment','rendered-zero','rendered-missing'],
    'occupied-destination':['occupied-submit','publication','race'],
    programmer:['direct-publish','project-switch','sibling-terminal','prerequisite-terminal','prerequisite-output','terminal','stale-plan','borrowed','manifest','absent-generator','disabled-generator','generator-terminal','generator-output','generator-persisted-seed','generator-submitted-seed','stale-preflight','failed-preflight','missing-token','token-drift'],
    mathematician:['replay-provenance','absent-generator','generator-output','replay-disabled','comparison-terminal','comparison-duplicate','comparison-missing'],
    producer:['tab-only','wrong-panel','accounting','invalid-design','submitted-seed','submitted-bet','recorded-seed'],
    'ui-ux':['duplicate','isolation','clipped','submitted-seed','submitted-workers','submitted-rounds','persisted-seed','report-seed'],
    'graphic-designer':['duplicate','replaced-card','focus-theft','unpainted','clipped','submitted-seed','submitted-workers','persisted-seed','report-seed'],
})) for (const fault of faults) {
    test(`${id}: ${fault} cannot become complete action coverage`, async () => {
        const f=surface(id,fault);
        await assert.rejects(runItinerary(f.request,f.s));
        assert.ok(f.receipts.length<COVERAGE[id].length);
    });
}

test('actual native focus helper cannot Tab to inactive Paytable, then arrows reach its editable panel', async () => {
    const f=surface('producer');
    const paytable="document.querySelector('[aria-controls=section-4]')";
    await assert.rejects(f.s.focus(paytable), /native Tab target unreachable/);
    assert.equal(f.dom.window.eval(paytable).getAttribute('tabindex'),'-1');
    await f.s.focus("document.querySelector('[role=tab][aria-selected=true]')");
    for(let index=0;index<4;index++) await f.s.key('ArrowRight');
    assert.equal(f.dom.window.document.activeElement,f.dom.window.eval(paytable));
    assert.equal(f.dom.window.eval(paytable).getAttribute('aria-selected'),'true');
    assert.equal(f.dom.window.document.getElementById('section-4').hidden,false);
    await f.s.focus(input('A x2 payout'));
    assert.equal(f.dom.window.document.activeElement.getAttribute('aria-label'),'A x2 payout');
    assert.equal(f.dom.window.eval(paytable).getAttribute('tabindex'),'-1');
});

test('occupied and race sentinels are read again, never accepted from a saved hash', async () => {
    for (const race of [false,true]) {
        const f=surface('occupied-destination'), read=f.s.read;
        let reads=0;
        f.s.read=async file => {
            const value=await read(file);
            if (file.endsWith('sentinel.bin') && file.includes('preview-race')===race && ++reads===2) return Buffer.from('changed');
            return value;
        };
        await assert.rejects(runItinerary(f.request,f.s), /sentinel/);
    }
});

test('selecting a replay only loads its contract; one separate native action compares it', async () => {
    const f=surface('mathematician'), activate=f.s.activate;
    f.s.activate=async expression=>{
        await activate(expression);
        if(expression.includes('Reproduce & compare record')) {
            assert.ok(f.dom.window.document.body.textContent.includes('Record record-own'));
            assert.ok(!f.dom.window.document.body.textContent.includes('Verified -- matches'));
            assert.equal(f.submissions.filter(e=>e.route==='/api/project/replays').length,0);
        }
    };
    await runItinerary(f.request,f.s);
    assert.equal(f.submissions.filter(e=>e.route==='/api/project/replays').length,1);
});

test('matching preflight waits past stale responses and rendered loading before returning its token', async () => {
    const inputs={mode:'base',generation:'sampled',sample:{sampleSize:'5000',seed:'selected'}};
    const good={request:inputs,status:200,body:{status:'ok',preflightToken:'matching-token'}};
    const observations=[null,{...good,request:{...inputs,sample:{...inputs.sample,seed:'old'}}},good,good];
    let probes=0;
    const accepted=await waitGenerationPreflight({
        readResponse:async()=>observations[probes++],matchesRequest:request=>JSON.stringify(request)===JSON.stringify(inputs),
        renderedReady:async()=>probes===4,label:'matching sampled inputs',
        until:async (fn,label,timeout)=>{assert.equal(timeout,8000);for(let i=0;i<4;i++){const value=await fn();if(value)return value;}assert.fail(label);},
    });
    assert.equal(probes,4);assert.equal(accepted.body.preflightToken,'matching-token');
});

test('stale or failed preflight prevents any generation submission even with an enabled button', async () => {
    for(const id of ['programmer','mathematician']) for(const fault of ['stale-preflight','failed-preflight','missing-token']) {
        const f=surface(id,fault);
        await assert.rejects(runItinerary(f.request,f.s),/preflight/);
        assert.equal(f.submissions.filter(e=>e.route==='/api/project/outcome-libraries/generate/jobs').length,0);
    }
});

test('refresh-safe disclosures wait for absent and replaced controls and never toggle an open card', async () => {
    for(const initiallyOpen of [false,true]) {
        let reads=0,activations=0,expanded=initiallyOpen;
        await openDisclosure({
            readExpanded:async()=>++reads===1 || reads===3 ? null : String(expanded),
            activate:async()=>{activations++;expanded=true;},label:'refreshed card',
            until:async (fn,label,timeout)=>{assert.equal(timeout,8000);for(let i=0;i<6;i++){const value=await fn();if(value)return value;}assert.fail(label);},
        });
        assert.equal(activations,initiallyOpen?0:1);assert.ok(reads>=4);
    }
    await assert.rejects(openDisclosure({readExpanded:async()=>null,activate:async()=>assert.fail('absent disclosure activated'),until:surface('producer').s.until,label:'missing'}),/disclosure available/);
});

test('visible dirty-Design confirmation completes the activated Open without a duplicate opening', async () => {
    for(const id of ['stake-uint64-total','mathematician']) {
        const f=surface(id,'dirty-guard'), activate=f.s.activate;
        f.s.activate=async expression=>{
            if(expression.includes('design-navigation-guard-leave')) assert.equal(f.submissions.filter(e=>e.route==='/api/home/projects/open').length,0);
            await activate(expression);
        };
        await runItinerary(f.request,f.s);
        assert.equal(f.activations.filter(e=>e.includes('design-navigation-guard-leave')).length,1);
        assert.equal(f.submissions.filter(e=>e.route==='/api/home/projects/open').length,1);
        assert.equal(f.dom.window.document.getElementById('design-navigation-guard-leave'),null);
    }
});

test('coverage cannot route unknown IDs or convert an unreachable action to a finding', async () => {
    const unknown=surface('unknown'); await assert.rejects(runItinerary(unknown.request,unknown.s),/unknown itinerary/);
    for (const id of Object.keys(COVERAGE)) {
        const f=surface(id);
        f.s.activate=async () => {throw new Error('native target disabled/unreached');};
        await assert.rejects(runItinerary(f.request,f.s),/native target disabled/);
        assert.ok(f.receipts.length<COVERAGE[id].length);
    }
});

test('selectors use scoped rendered labels, including optional destination suffixes', () => {
    const dom=new JSDOM('<fieldset id="other"><button>Build</button><label for="wrong">Output directory</label><input id="wrong"></fieldset><fieldset id="own"><button aria-expanded="false">Configure</button><button id="build">Build</button><label for="path">Output directory (optional)</label><input id="path"></fieldset>',{runScripts:'outside-only'});
    Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:()=>[{}]});
    assert.equal(dom.window.eval(button('Build',"document.getElementById('own')")).id,'build');
    assert.equal(dom.window.eval(input('Output directory',"document.getElementById('own')")).id,'path');
    dom.window.close();
});

function png(painted) {
    const width=40,height=40,channels=3,raw=Buffer.alloc((width*channels+1)*height,255);
    for(let y=0;y<height;y++)raw[y*(width*channels+1)]=0;
    if(painted) for(const [x,y] of [[20,6],[16,6],[6,20],[34,20]]) {
        const at=y*(width*channels+1)+1+x*3;raw.set([10,30,90],at);
    }
    const chunk=(name,data)=>{const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(name,4);data.copy(result,8);return result;};
    const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

test('paint proof requires actual retained PNG pixels at transition-local outline bounds', () => {
    const geometry={rect:{x:10,y:10,width:20,height:20},outlineWidth:2,outlineOffset:3,outlineColor:'rgb(10, 30, 90)'};
    assert.equal(paintedOutline(png(true),geometry),true);
    assert.equal(paintedOutline(png(false),geometry),false);
    assert.equal(paintedOutline(png(true),{...geometry,outlineColor:'rgba(10, 30, 90, 0)'}),false);
    assert.throws(()=>paintedOutline(Buffer.from('not an image'),geometry),/PNG/);
});

test('driver cleanup drains group survivors after root exit and waits for inherited stdio', async () => {
    const entry={child:{pid:123,exitCode:0},closed:false,completion:Promise.resolve()};
    let time=0,live=true,signals=[];
    await drainDriverChild(entry,{now:()=>time,alive:()=>live,signal:(pid,signal)=>{assert.equal(pid,123);signals.push(signal);},wait:async ms=>{time+=ms; if(time>=50)live=false; if(time>=100)entry.closed=true;},graceMs:75,forceMs:150});
    assert.equal(entry.closed,true); assert.equal(time,100);
    assert.deepEqual(signals,['SIGTERM']);
});

test('driver cleanup escalates and fails boundedly when a group or inherited pipe survives', async () => {
    for(const stuckGroup of [false,true]) {
        const entry={child:{pid:123,exitCode:0},closed:false,completion:Promise.resolve()};
        let time=0,signals=[];
        await assert.rejects(drainDriverChild(entry,{now:()=>time,alive:()=>stuckGroup,signal:(pid,signal)=>signals.push(signal),wait:async ms=>{time+=ms;},graceMs:50,forceMs:75}),/drainage deadline/);
        assert.equal(time,125);
        assert.deepEqual(signals,stuckGroup?['SIGTERM','SIGKILL']:['SIGTERM']);
    }
});

test('reload proof awaits a different main-frame loader, ignoring old and child-frame loads', async () => {
    const event=(frameId,loaderId)=>({method:'Page.lifecycleEvent',params:{name:'load',frameId,loaderId}});
    const events=[event('main','old')];
    let reloaded=false;
    const cdp={events,send:async method=>{if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main',loaderId:'old'}}};assert.equal(method,'Page.reload');reloaded=true;}};
    await reloadPage(cdp,async fn=>{
        assert.equal(reloaded,true);assert.equal(fn(),false);
        events.push(event('main','old'),event('child','new'));assert.equal(fn(),false);
        events.push(event('main','new'));assert.equal(fn(),true);
    });
});


test('executable startup preserves helper launcher environment and isolated Studio/browser storage, with bounded failure and drainage', async () => {
    const root=await mkdtemp(path.join(os.tmpdir(),'p911-driver-startup-'));
    try {
        for(const persona of ['programmer','mathematician']) {
            const profileRoot=path.join(root,persona), resultPath=path.join(root,persona+'.result.json');
            await mkdir(path.join(profileRoot,'workspace'),{recursive:true});
            const bin=path.join(profileRoot,'installed-bin.mjs'), browser=path.join(profileRoot,'test-browser.mjs');
            // Real executable launches, not a spawn/evaluate success stub. The
            // browser fixture deliberately stops before CDP collection. All
            // test-only records are removed; none represents acceptance.
            const snapshot="JSON.stringify({home:process.env.HOME,display:process.env.DISPLAY,xdg:process.env.XDG_DATA_HOME,documents:process.env.TEST_DOCUMENTS,argv:process.argv.slice(2),cwd:process.cwd()})";
            await writeFile(bin,`#!${process.execPath}\nprocess.stdout.write('POKIE Studio listening on http://127.0.0.1:1\\n');process.stdout.write(${snapshot}+'\\n');`,{mode:0o755});
            await writeFile(browser,`#!${process.execPath}\nprocess.stdout.write(${snapshot}+'\\n');`,{mode:0o755});
            const request={schemaVersion:1,id:persona,candidateId:'b'.repeat(40),archiveSha256:digest,profileId:persona,profileRoot,packageRoot:root,bin,coverage:COVERAGE[persona],timeoutMs:1000,
                driverSha256:createHash('sha256').update(await readFile(driverPath)).digest('hex')};
            const requestPath=path.join(root,persona+'.request.json');await writeFile(requestPath,JSON.stringify(request));
            let displayClosed=false;
            await assert.rejects(main(['--request',requestPath,'--result',resultPath],{
                createStudioApplicationProfile:async run => {assert.equal(run,path.join(profileRoot,'rendered-driver'));return {env:{HOME:'/wrong-profile-home',TEST_DOCUMENTS:path.join(profileRoot,'Documents')}};},
                createVerifierBrowserContext:async run => {assert.equal(run,path.join(profileRoot,'rendered-driver/display'));return {browser,env:{HOME:'/controller-launch-home',DISPLAY:':fixture'},close:async()=>{displayClosed=true;}};},
            }),/deadline: fresh browser CDP port/);
            assert.equal(displayClosed,true);
            await assert.rejects(readFile(resultPath),{code:'ENOENT'});
            const diagnostic=JSON.parse(await readFile(path.join(root,persona+'.rendered.transcript.json'),'utf8'));
            assert.match(diagnostic.error,/CDP port/);
            assert.equal(diagnostic.children.length,2);
            const studioLaunch=diagnostic.children.find(child=>child.command===bin), browserLaunch=diagnostic.children.find(child=>child.command===browser);
            const studioEnv=JSON.parse(studioLaunch.stdout.split('\n')[1]), browserEnv=JSON.parse(browserLaunch.stdout.trim());
            assert.equal(studioEnv.home,path.join(profileRoot,'home'));
            assert.equal(studioEnv.xdg,path.join(profileRoot,'data'));
            assert.equal(studioEnv.documents,path.join(profileRoot,'Documents'));
            assert.equal(browserEnv.home,'/controller-launch-home');
            assert.equal(browserEnv.display,':fixture');
            assert.notEqual(browserEnv.xdg,studioEnv.xdg);
            assert.equal(browserEnv.argv.filter(arg=>arg.startsWith('--user-data-dir=')).join(''),`--user-data-dir=${path.join(profileRoot,'browser')}`);
            assert.equal(studioEnv.cwd,path.join(profileRoot,'workspace'));
            assert.ok(diagnostic.children.every(child=>child.closed && child.exitCode===0));
        }
    } finally {await rm(root,{recursive:true,force:true});}
},10000);

test('actual request entry rejects stale driver identity before loading launch helpers', async () => {
    const root=await mkdtemp(path.join(os.tmpdir(),'p911-driver-rejected-'));
    try {
        const request={schemaVersion:1,id:'programmer',candidateId:'b'.repeat(40),archiveSha256:digest,profileId:'fixture',profileRoot:root,packageRoot:root,bin:path.join(root,'bin'),coverage:COVERAGE.programmer,driverSha256:digest};
        const requestPath=path.join(root,'request.json');await writeFile(requestPath,JSON.stringify(request));
        await assert.rejects(main(['--request',requestPath,'--result',path.join(root,'result.json')],{
            createStudioApplicationProfile:async()=>assert.fail('stale input launched application'),
            createVerifierBrowserContext:async()=>assert.fail('stale input launched browser'),
        }),/incomplete\/stale authenticated/);
    } finally {await rm(root,{recursive:true,force:true});}
});

test('rendered Overview observations reject missing, zero, wrong and nonnumeric probabilities independently of correct API metrics', () => {
    const f=surface('stake-uint64-total');
    const analysis={rtp:2**-63,hitFrequency:2**-64};
    const good={headers:['Mode','RTP','Hit frequency'],rows:[['base','1.0842e-17%','5.4210e-18%']]};
    assertRenderedStake(good,analysis,'base');
    for(const invalid of [null,{...good,rows:[]},{...good,headers:['Mode','wrong','Hit frequency']},
        {...good,rows:[['base','0.00%','5.4210e-18%']]},{...good,rows:[['base','1.0842e-17%']]},
        {...good,rows:[['base','95.00%','5.4210e-18%']]},{...good,rows:[['base','NaN%','5.4210e-18%']]}]) {
        assert.throws(()=>assertRenderedStake(invalid,analysis,'base'),/rendered Overview/);
    }
    f.dom.window.document.body.innerHTML='<table data-testid="outcome-source-mode-table"><thead><tr><th>Mode</th><th>RTP</th><th>Hit frequency</th></tr></thead><tbody><tr><td>base</td><td>0.00%</td><td>0.00%</td></tr></tbody></table>';
    assert.throws(()=>assertRenderedStake(f.dom.window.eval(renderedStakeExpression),analysis,'base'),/rendered Overview/);
});

test('contact sheets retain exact pixels and panel-local geometry without additional images', () => {
    const geometry={rect:{x:10,y:10,width:20,height:20},outlineWidth:2,outlineOffset:3,outlineColor:'rgb(10, 30, 90)'};
    const sheet=contactSheet([{bytes:png(false),surface:'Home',viewport:{width:40,height:40}},{bytes:png(true),surface:'settled job',focus:geometry,viewport:{width:40,height:40}}]);
    assert.deepEqual(sheet.panels.map(panel=>panel.offsetX),[0,56]);
    assert.equal(sheet.panels[1].focus,geometry);
    const decoded=decodePng(sheet.bytes);assert.equal(decoded.width,96);assert.equal(decoded.height,40);
    assert.equal(paintedOutline(sheet.bytes,geometry),false);
    assert.equal(paintedOutline(sheet.bytes,{...geometry,rect:{...geometry.rect,x:geometry.rect.x+sheet.panels[1].offsetX}}),true);
    assert.throws(()=>contactSheet([]),/panel count/);
    assert.throws(()=>contactSheet(Array.from({length:7},()=>({bytes:png(true)}))),/panel count/);
});


function navigationFixture({home=false, mobile=false, delayed=false}={}) {
    const dom=new JSDOM(`<button id="studio-navigation-toggle" aria-expanded="${mobile?'false':'true'}" ${mobile?'':'hidden'}>Menu</button><nav id="studio-navigation-panel" ${mobile?'inert hidden':''}></nav>`,{url:'http://fixture/#/'+(home?'home/projects':'project/fixture/overview'),runScripts:'outside-only'});
    windows.push(dom.window);
    const document=dom.window.document, controlId=home?'home-tab:design':'project-tab:exportDeploy';
    Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(){return this.closest('[hidden]')?[]:[{}];}});
    Object.defineProperty(dom.window.HTMLElement.prototype,'getBoundingClientRect',{value:()=>({left:20,top:80,width:120,height:30})});
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    document.elementFromPoint=()=>document.getElementById(controlId);
    let attempts=0, rendered=false;
    const addTarget=()=>document.querySelector('nav').insertAdjacentHTML('beforeend',`<button id="${controlId}" aria-current="false">${home?'Start a game':'Build/Export'} <span>Available</span></button>`);
    if(!delayed)addTarget();
    const activated=[],clicked=[],keys=[];
    document.addEventListener('click',event=>{
        activated.push(event.target.id);
        if(event.target.id==='studio-navigation-toggle') {
            const nav=document.querySelector('nav');nav.hidden=false;nav.removeAttribute('inert');event.target.setAttribute('aria-expanded','true');
        } else {
            dom.window.location.hash=home?'/home/design':'/project/fixture/exportDeploy';
            event.target.setAttribute('aria-current','page');
        }
    });
    const boundary={
        evaluate:async expression=>dom.window.eval(expression),
        until:async (fn,message)=>{
            for(let i=0;i<8;i++) {
                const value=await fn();if(value)return value;
                if(++attempts===2 && delayed)addTarget();
                // Route and selected NavLink alone do not mean the page settled.
                if(!home && !rendered && dom.window.location.hash.endsWith('/exportDeploy')) {
                    document.body.insertAdjacentHTML('beforeend',`<div data-pokie-lifecycle-result-control="${controlId}" data-pokie-lifecycle-terminal="loading"></div>`);
                    rendered=true;
                } else if(rendered) document.querySelector('[data-pokie-lifecycle-terminal]').setAttribute('data-pokie-lifecycle-terminal','rendered');
            }
            assert.fail(`navigation deadline: ${message}`);
        },
        key:async key=>{
            keys.push(key);
            if(key==='Enter')document.activeElement.click();
            if(key==='Tab') {
                const stops=[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.closest('[inert]'));
                stops[(stops.indexOf(document.activeElement)+1)%stops.length]?.focus();
            }
        },
        activate:async expression=>{await focusNativeTarget(expression,boundary);await boundary.key('Enter');},
        click:async (x,y)=>{clicked.push({x,y});document.elementFromPoint(x,y).click();},
    };
    return {dom,boundary,activated,clicked,keys,controlId};
}

test('settled desktop and Home navigation wait for delayed real controls without a hidden drawer fallback', async () => {
    for(const home of [false,true]) {
        const f=navigationFixture({home,delayed:true});
        await navigateSurface(home?'Start a game':'Build/Export',f.boundary);
        assert.deepEqual(f.activated,[f.controlId]);
        assert.deepEqual(f.clicked,[]);
        assert.ok(f.keys.includes('Tab') && f.keys.includes('Enter'));
        assert.equal(f.dom.window.document.activeElement.id,f.controlId);
    }
});

test('phone navigation opens one native drawer and hit-tests one visible target before awaiting its rendered terminal', async () => {
    const f=navigationFixture({mobile:true,delayed:true});
    await navigateSurface('Build/Export',f.boundary);
    assert.deepEqual(f.activated,['studio-navigation-toggle',f.controlId]);
    assert.deepEqual(f.clicked,[{x:80,y:95}]);
    assert.ok(f.keys.includes('Tab') && f.keys.includes('Enter'));
    assert.equal(f.dom.window.document.querySelector('[data-pokie-lifecycle-terminal]').getAttribute('data-pokie-lifecycle-terminal'),'rendered');
});

test('an already open phone drawer uses one hit-tested action without toggling it closed', async () => {
    const f=navigationFixture({mobile:true});
    const document=f.dom.window.document;
    document.getElementById('studio-navigation-toggle').setAttribute('aria-expanded','true');
    document.querySelector('nav').hidden=false;document.querySelector('nav').removeAttribute('inert');
    await navigateSurface('Build/Export',f.boundary);
    assert.deepEqual(f.activated,[f.controlId]);assert.equal(f.clicked.length,1);
    assert.deepEqual(f.keys,[]);
});

test('phone Home sections use their actual control after revealing the responsive drawer', async () => {
    const f=navigationFixture({home:true,mobile:true,delayed:true});
    await navigateSurface('Start a game',f.boundary);
    assert.deepEqual(f.activated,['studio-navigation-toggle',f.controlId]);
    assert.equal(f.clicked.length,1);
    assert.ok(f.dom.window.location.hash.endsWith('/home/design'));
    assert.equal(f.dom.window.document.getElementById(f.controlId).getAttribute('aria-current'),'page');
});

test('missing desktop controls and occluded mobile targets cannot be accepted as reachable', async () => {
    const desktop=navigationFixture();desktop.dom.window.document.getElementById(desktop.controlId).remove();
    await assert.rejects(navigateSurface('Build/Export',desktop.boundary),/navigation deadline/);
    assert.deepEqual(desktop.activated,[]);
    const mobile=navigationFixture({mobile:true});mobile.dom.window.document.elementFromPoint=()=>mobile.dom.window.document.body;
    await assert.rejects(navigateSurface('Build/Export',mobile.boundary),/navigation deadline/);
    assert.deepEqual(mobile.activated,['studio-navigation-toggle']);assert.deepEqual(mobile.clicked,[]);
});

test('saved Overview requires its own rendered terminal and no retained Home editor', async () => {
    for (const fault of ['uncommitted-overview','retained-editor']) {
        const f=surface('producer',fault);
        await assert.rejects(runItinerary(f.request,f.s), /Create game terminal Overview validation|saved Overview retains Home editor controls/);
        assert.deepEqual(f.receipts,[]);
    }
});

test('a changed hash and selected NavLink cannot authorize measuring a project navigation', async () => {
    const f=navigationFixture();
    f.boundary.until=async (fn,message)=>{
        if(!message.startsWith('Project navigation'))return fn();
        assert.equal(await fn(),false);
        const document=f.dom.window.document;
        document.body.insertAdjacentHTML('beforeend',`<div data-pokie-lifecycle-result-control="${f.controlId}" data-pokie-lifecycle-terminal="loading"></div>`);
        assert.equal(await fn(),false);
        document.querySelector('[data-pokie-lifecycle-terminal]').setAttribute('data-pokie-lifecycle-terminal','rendered');
        assert.equal(await fn(),true);
    };
    await navigateSurface('Build/Export',f.boundary);
});
