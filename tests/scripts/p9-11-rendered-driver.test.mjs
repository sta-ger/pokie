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
import {COVERAGE, runItinerary, button, input, paintedOutline, drainDriverChild, reloadPage, main, renderedStakeExpression, assertRenderedStake, contactSheet, decodePng, navigateSurface} from "../../scripts/p9-11-rendered-driver.mjs";
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
    let savedCount=0, currentProject='/fixture/design.json', destination, target, buildCount=0, previews=0, afterReload=false, progressRead=false;
    let route='home/design', section='Game basics', advanced=false, generatorOpen=false, generationAdvanced=false, generatorDone=false, drawn=false, compared=false, started=false, spun=false, simulation=false, terminal=false, occupiedError=false;
    const opened = new Set(), completed = new Set(), values = new Map(), submissions = [];
    const output = target => `/fixture/${target}`;
    const field = (label,value='') => `<label>${label}<input aria-label="${label}" value="${values.get(label) ?? value}"></label>`;
    const result = (id,output='') => `<div data-pokie-lifecycle-result-job="${id}" data-pokie-lifecycle-terminal="completed" data-pokie-lifecycle-result-output="${output}">Build completed ${target} Stake prerequisite: reuse (borrowed)</div>`;
    const render = () => {
        dom.window.location.hash=route.startsWith('home/') ? '/'+route : `/project/${encodeURIComponent(currentProject)}/${route}`;
        let html='Local artifacts do not deploy a game or certify it for real-money use.';
        if(route==='home/design') html+=`<button role="tab" aria-selected="${section==='Game basics'}">Game basics</button><button role="tab" aria-selected="${section==='Paytable'}">Paytable</button>${field('A x2 payout')}<button>Create game</button><button>Show advanced options (file and JSON tools)</button><fieldset ${advanced?'':'hidden'}><legend>Build</legend>${destination??''}${field('Output directory')}<button>Build Preview</button><button>Build Package</button>${occupiedError?'Choose a new destination; contains existing files.':''}${completed.has('design')?'Last built':''}</fieldset>`;
        if(route==='home/projects') html+=`${field('Game location')}<button>Check game</button><div>Found a Game export</div><button>Add to projects</button><div class="project-registry-entry">rare-stake ${currentProject} /fixture/design.json /fixture/outcomeLibrary<button>Open</button></div>`;
        if(!route.startsWith('home/')) html+='<button>Close project</button>';
        if(route==='overview') {
            html+='Valid — no issues found. Game export <button>Open Play</button>';
            if(id==='stake-uint64-total') html+=`<table data-testid="outcome-source-mode-table"><thead><tr><th>Mode</th><th>RTP</th><th>Hit frequency</th></tr></thead><tbody><tr><td>base</td><td>${fault==='rendered-zero'?'0.00%':'1.0842e-17%'}</td>${fault==='rendered-missing'?'':`<td>5.4210e-18%</td>`}</tr></tbody></table>`;
            if(currentProject===output('outcomeLibrary')) html+=`${field('Seed (optional)')}<button>Draw an outcome</button>${drawn?'Saved in Replay Recent':''}`;
        }
        if(route==='exportDeploy') {
            for(const t of ['stakeAdapter','parWorkbook','tsPackage']) html+=`<div data-pokie-lifecycle-form="artifact-build"><button aria-expanded="${opened.has(t)}">Configure ${t}</button><div ${opened.has(t)?'':'hidden'}><button id="artifact-build-${t}">Build</button>${completed.has(t)?result('job-'+t,output(t)):''}</div></div>`;
            if(fault!=='absent-generator') html+=`<div data-pokie-lifecycle-form="outcome-library"><button aria-expanded="${generatorOpen}">Configure generator</button><div ${generatorOpen?'':'hidden'}><button id="outcome-library-generation-sampled">Sampled</button>${field('Sample size')}<button>Show Advanced generation controls</button><fieldset ${generationAdvanced?'':'hidden'}>${field('Coverage seed')}</fieldset><button id="outcome-library-generate" ${fault==='disabled-generator'?'disabled':''}>Generate sampled outcome library (base)</button>${generatorDone?result('generator-own')+`<button data-pokie-lifecycle-artifact-output="${output('outcomeLibrary')}">Inspect library</button>`:''}</div></div>`;
        }
        if(route==='play') html+=`<button>Show advanced details (seed)</button><div ${advanced?'':'hidden'}>${field('Seed (optional)')}</div>${started?'<span class="player-bet-current">Bet: 1</span><button>Spin</button>':'<button>New Play session</button>'}${spun?'Round complete':''}`;
        if(route==='simulation') html+=`${field('Rounds')}<button>Show advanced details (seed, workers)</button><fieldset ${advanced?'':'hidden'}>${field('Seed (optional)')}${field('Workers')}</fieldset><button>Run Simulation</button><button id="simulation-configure">Configure</button>${simulation?`<div role="region" aria-label="simulation job simulation-own"><div class="studio-job-card"></div><div data-pokie-lifecycle-result-job="simulation-own" ${terminal?'data-pokie-lifecycle-terminal="completed"':''}>${terminal?'Completed Open full report':'Running'}<button>Cancel</button></div></div>`:''}`;
        if(route==='replay') html+=`<li>${row.id} ${row.seed} ${row.modeName} ${row.startedAt}<button>Inspect record ${row.id}</button><button>Reproduce &amp; compare record ${row.id}</button></li>${compared?'Verified -- matches the recorded result':''}`;
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
            if(file.endsWith('manifest.json')) return Buffer.from(fault==='manifest' && buildCount>1 ? 'changed manifest' : JSON.stringify({modes:[{modeName:'base',generator:{strategy:'bounded-coverage',sampledRawCount:5000,seed:fault==='generator-persisted-seed'?'wrong':`p911-${id}-library`}}]}));
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
            if(element.id==='outcome-library-generate') {generatorDone=true;buildCount++;submissions.push({route:'/api/project/outcome-libraries/generate/jobs',request:{mode:'base',generation:'sampled',sample:{sampleSize:values.get('Sample size'),seed:fault==='generator-submitted-seed'?'wrong':values.get('Coverage seed')}}});}
            if(label==='Inspect library') {currentProject=output('outcomeLibrary');route='overview';}
            if(label==='Draw an outcome') {drawn=true;submissions.push({route:'/api/project/outcome-source/sample',request:{seed:values.get('Seed (optional)')}});}
            if(label.startsWith('Reproduce & compare')) compared=true;
            if(label==='Close project') route='home/projects';
            if(label==='Open') {route='overview';currentProject=id==='mathematician'?output('outcomeLibrary'):'/fixture/design.json';}
            if(label==='Build Package') {occupiedError=destination.endsWith('occupied');if(!occupiedError)completed.add('design');}
            if(label==='Run Simulation') {simulation=true;submissions.push({route:'/api/project/simulations',request:tamper(simInputs())});}
            render();
        },
        fill:async (expression,value) => {
            const element=dom.window.eval(expression);assert.ok(element && element.getClientRects().length,`missing input: ${expression}`);
            values.set(element.getAttribute('aria-label'),value);element.value=value;
            if(expression.includes('Output directory')) destination=value;
        },
        evaluate:async expression => dom.window.eval(expression),
        until:async (fn,message) => {const value=await fn();assert.ok(value,`fixture boundary did not satisfy ${message}`);return value;},
        mark:() => submissions.length,
        requests:(route,after=0) => {
            if(route==='/api/home/blueprints/build')return fault==='occupied-submit'?[{request:{}}]:[];
            if(route==='/api/project/artifacts/build')return [{request:{target:'stakeAdapter',preparedOperationId:fault==='stale-plan'?'initial':'refreshed'}}];
            const matches=submissions.slice(after).filter(entry=>entry.route===route);
            return fault==='duplicate'?matches.concat(matches):matches;
        },
        response:async route => {
            const request=submissions.findLast(entry=>entry.route===route)?.request;
            if(route==='/api/home/blueprints/build-preview')return {status:200,request:{blueprint:{manifest:{id:'tiny'}},outDir:destination},body:{status:'ok',projectRoot:destination,destinationHasContent:destination.endsWith('occupied')}};
            if(route==='/api/home/blueprints/build')return {status:201,body:{status:'ok',projectRoot:fault==='publication'?'/wrong':destination}};
            if(route==='/api/project/outcome-source/sample')return {request,body:{replayId:row.id,replay:{seed:row.seed}}};
            if(route==='/api/project/outcome-libraries/generate/jobs')return {request,body:{job:{id:'generator-own'}}};
            if(route==='/api/project/simulations')return {request,body:{id:'simulation-own'}};
            if(route==='/api/project/play/session')return {request,body:{session:{sessionId:'session-own',credits:1000,bet:1}}};
            return {request,body:{status:'ok',session:{studioRound:1,studioSeed:'p911-producer-play',credits:fault==='accounting'?1000:1001,bet:1,win:2,debug:{artifact:{screen:[['A']]}}}}};
        },
        post:async route => route.endsWith('build-preview')?{status:200,body:{status:'ok',destinationHasContent:false}}:{status:200,body:{status:fault==='race'?'ok':'error'}},
        get:async route => {
            if(route==='/api/project/context')return {report:{modes:[{modeName:'base',analysis:fault==='rare-moment'?{...analysis,variance:0}:analysis}]}};
            if(route==='/api/project/rounds')return [{sessionId:'session-own',studioRound:1,studioSeed:fault==='recorded-seed'?'wrong':'p911-producer-play',bet:1,win:2,credits:1001}];
            if(route==='/api/project/validate')return {valid:fault!=='invalid-design'};
            if(route==='/api/home/jobs')return {jobs:[{operation:'design-build',status:'completed',request:{destinationPath:destination}}]};
            if(route==='/api/project/jobs')return {jobs:currentProject.includes('second')?(fault==='isolation'?[{id:'simulation-own'}]:[]):[{id:'simulation-own',operation:'simulation'}]};
            if(route==='/api/project/replays')return fault==='replay-provenance'?[{...row,startedAt:undefined}]:[{...row}];
            if(route.startsWith('/api/project/outcome-libraries/generate/jobs/'))return {id:'generator-own',status:fault==='generator-terminal'?'failed':'completed',result:{status:'ok',resolvedBundleDir:fault==='generator-output'?'/wrong':output('outcomeLibrary')}};
            if(route.startsWith('/api/project/artifacts/build/'))return {result:{status:'ok',outputPath:output('stakeAdapter'),stakePrerequisiteProvenance:{route:'publish',disposition:'none'},plan:{source:{kind:'outcomeLibrary',canonicalLocation:fault==='borrowed'?'/wrong':output('outcomeLibrary')}}}};
            if(route.startsWith('/api/project/jobs/simulation-own')) {
                if(!progressRead && id==='ui-ux'){progressRead=true;return {id:'simulation-own',status:'running',progress:{current:1}};}
                terminal=true;render();return {id:'simulation-own',status:'completed',request:fault==='persisted-seed'?{...simInputs(),seed:'wrong'}:simInputs()};
            }
            if(route.startsWith('/api/project/jobs/'))return {id:route.split('/').at(-1),status:fault==='terminal'?'failed':'completed'};
            if(route.startsWith('/api/project/reports/'))return {report:fault==='report-seed'?{...simInputs(),seed:'wrong'}:simInputs()};
            throw new Error(`unexpected public read: ${route}`);
        },
        latestPreview:async () => ++previews===1?{preparedOperationId:'initial',stakePreflight:{route:'generate'}}:currentProject===output('outcomeLibrary')?{preparedOperationId:'refreshed',stakePreflight:{route:'publish'},plan:{source:{kind:'outcomeLibrary',canonicalLocation:output('outcomeLibrary')}}}:{preparedOperationId:'generated',stakePreflight:{route:'generate'}},
        reload:async () => {afterReload=true;},offline:async offline => {assert.ok(afterReload);dom.window.document.body.append(offline?'reconnecting automatically':'');if(!offline)render();},
        viewport:async (w,h) => viewports.push([w,h]),
        focus:async expression => {const element=dom.window.eval(expression);assert.ok(element && element.getClientRects().length && !element.disabled,`unreachable focus: ${expression}`);element.setAttribute('tabindex','0');element.focus();},
        key:async key => {section=key==='ArrowLeft'?'Game basics':'Paytable';render();const element=dom.window.document.querySelector('[role=tab][aria-selected=true]');element.setAttribute('tabindex','0');element.focus();},
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
        if (id==='programmer') assert.equal(f.activations.filter(e=>e.includes('artifact-build-stakeAdapter')&&e.includes('=== "Build"')).length,1);
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
    programmer:['terminal','stale-plan','borrowed','manifest','absent-generator','disabled-generator','generator-terminal','generator-output','generator-persisted-seed','generator-submitted-seed'],
    mathematician:['replay-provenance','absent-generator','generator-output'],
    producer:['accounting','invalid-design','submitted-seed','submitted-bet','recorded-seed'],
    'ui-ux':['duplicate','isolation','clipped','submitted-seed','submitted-workers','submitted-rounds','persisted-seed','report-seed'],
    'graphic-designer':['duplicate','replaced-card','focus-theft','unpainted','clipped','submitted-seed','submitted-workers','persisted-seed','report-seed'],
})) for (const fault of faults) {
    test(`${id}: ${fault} cannot become complete action coverage`, async () => {
        const f=surface(id,fault);
        await assert.rejects(runItinerary(f.request,f.s));
        assert.ok(f.receipts.length<COVERAGE[id].length);
    });
}

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


test('phone navigation reveals the actual collapsed navigation before activating the requested route', async () => {
    const dom=new JSDOM('<button id="studio-navigation-toggle" aria-expanded="false" aria-label="Toggle navigation">Menu</button><nav id="studio-navigation-panel" hidden><button>Build/Export</button></nav>',{url:'http://fixture/#/project/fixture/overview',runScripts:'outside-only'});
    windows.push(dom.window);
    Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value:function(){return this.closest('[hidden]')?[]:[{}];}});
    const activated=[];
    await navigateSurface('Build/Export',{
        evaluate:async expression=>dom.window.eval(expression),
        activate:async expression=>{const element=dom.window.eval(expression);assert.ok(element?.getClientRects().length);activated.push(element.textContent);if(element.textContent==='Menu'){dom.window.document.querySelector('nav').hidden=false;element.setAttribute('aria-expanded','true');}else dom.window.location.hash='/project/fixture/exportDeploy';},
        until:async fn=>assert.ok(await fn()),
    });
    assert.deepEqual(activated,['Menu','Build/Export']);
});
