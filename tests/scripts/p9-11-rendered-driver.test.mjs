// Offline implementation contracts only. Never independent browser evidence.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {deflateSync} from "node:zlib";
import {test} from "@jest/globals";
import {COVERAGE, runItinerary, button, input, paintedOutline, drainDriverChild, reloadPage} from "../../scripts/p9-11-rendered-driver.mjs";
import {P911_RENDERED_COVERAGE, validateActionCoverage} from "../../scripts/p9-11-corrective-closeout.mjs";
const {JSDOM} = createRequire(import.meta.url)("jsdom");
const digest = "a".repeat(64);
const driverPath = new URL("../../scripts/p9-11-rendered-driver.mjs", import.meta.url);

function surface(id, fault) {
    const request = {id, candidateId:"b".repeat(40), archiveSha256:digest, profileId:`fixture-${id}`, profileRoot:"/fixture/profile"};
    const memory = new Map(), receipts = [], activations = [], history = [], images = [];
    const row = {id:"record-own", seed:"p911-mathematician", modeName:"base", startedAt:"2026-10-10T12:00:00.000Z"};
    const analysis = {totalWeight:"18446744073709551616", hitFrequency:2**-64, maxWinProbability:2**-64, rtp:2**-63, variance:2**-62, standardDeviation:2**-31};
    let savedCount = 0, currentProject = "/fixture/design.json", destination, target, buildCount = 0, previews = 0, afterReload = false, progressRead = false;
    const output = target => `/fixture/${target}`;
    const s = {
        resultPath:"/fixture/results/result.json",
        read:async file => {
            if (memory.has(file)) {
                const value = memory.get(file);
                if (fault === 'sentinel' && file.endsWith('sentinel.bin')) return Buffer.from([1,2,3]);
                if (fault === 'race-sentinel' && file.includes('preview-race')) return Buffer.from([3,2,1]);
                return value;
            }
            if (file.endsWith('stake-uint64-total.public.json')) return JSON.stringify({...request, observations:[{analysis}]});
            if (file.endsWith('design.json')) return JSON.stringify({manifest:{id:"tiny"}, reels:2, paytable:{A:{2:7}}});
            if (file.endsWith('package.json')) return JSON.stringify({name:"tiny"});
            if (file.endsWith('manifest.json')) return Buffer.from(fault === 'manifest' && buildCount > 1 ? 'changed manifest' : 'manifest');
            return Buffer.from('published artifact');
        },
        write:async (file, bytes) => {memory.set(file,bytes);}, mkdir:async () => {},
        receipt:async (key, observed, raw) => {receipts.push({key, observed, raw}); return {path:`/fixture/${key}.json`, sha256:digest};},
        image:async name => {images.push(name); return {path:`/fixture/${name}.png`, sha256:digest};},
        cli:async argv => ({stdout:argv[0] === '--help' ? 'Open Studio Home:\npokie build\n' : argv[0] === 'inspect' ? 'PAR workbook' : 'Artifact "parWorkbook" built', stderr:'', exitCode:0}),
        navigate:async label => {history.push(label);},
        activate:async expression => {
            activations.push(expression);
            if (expression.includes('Create game')) {savedCount++; currentProject=savedCount===1?'/fixture/design.json':'/fixture/second-design.json';}
            const match = expression.match(/artifact-build-(\w+)/);
            if (match && expression.includes('=== "Build"')) {target=match[1]; buildCount++;}
            if (expression.includes('Open as Project')) currentProject=output('outcomeLibrary');
            if (expression.includes('project-registry-entry')) currentProject='/fixture/design.json';
        },
        fill:async (expression, value) => {if (expression.includes('Output directory')) destination=value;},
        evaluate:async expression => {
            if (expression === "decodeURIComponent(location.hash.split('/')[2])") return currentProject;
            if (expression.includes("getAttribute('aria-label')") && expression.includes('payout$')) return 'A x2 payout';
            if (expression.includes('getAttribute(\'aria-expanded\')')) return false;
            if (expression.includes('return {id:e.getAttribute')) return {id:`job-${target}`, output:output(target), text:`Build completed ${target} Stake prerequisite: reuse (borrowed)`};
            if (expression.endsWith("?.innerText ?? ''")) return 'Observed own terminal; Local artifacts do not deploy a game or certify it for real-money use.';
            if (expression.includes(' && "simulation-own"')) return 'simulation-own';
            return true;
        },
        until:async (fn, message) => {const value=await fn(); assert.ok(value, `fixture boundary did not satisfy ${message}`); return value;},
        mark:() => activations.length,
        requests:(route, after) => {
            if (route === '/api/home/blueprints/build') return fault === 'occupied-submit' ? [{request:{}}] : [];
            if (route === '/api/project/simulations') return Array.from({length:fault === 'duplicate' ? 2 : 1}, () => ({request:{rounds:500000}}));
            return [{request:{target:'stakeAdapter', preparedOperationId:fault === 'stale-plan' ? 'initial' : 'refreshed'}}];
        },
        response:async route => {
            if (route === '/api/home/blueprints/build-preview') return {status:200, request:{blueprint:{manifest:{id:'tiny'}}, outDir:destination}, body:{status:'ok', projectRoot:destination, destinationHasContent:destination.endsWith('occupied')}};
            if (route === '/api/home/blueprints/build') return {status:201, body:{status:'ok', projectRoot:fault === 'publication' ? '/wrong' : destination}};
            if (route === '/api/project/outcome-source/sample') return {body:{replayId:row.id, replay:{seed:row.seed}}};
            if (route === '/api/project/simulations') return {body:{id:'simulation-own'}};
            if (route === '/api/project/play/session') return {body:{session:{sessionId:'session-own',credits:1000}}};
            return {body:{status:'ok',session:{studioRound:1,credits:fault === 'accounting' ? 1000 : 1001,bet:1,win:2,debug:{artifact:{screen:[['A']]}}}}};
        },
        post:async (route, body) => route.endsWith('build-preview') ? {status:200,body:{status:'ok',destinationHasContent:false}} : {status:200,body:{status:fault === 'race' ? 'ok' : 'error'}},
        get:async route => {
            if (route === '/api/project/context') return {report:{modes:[{analysis:fault === 'rare-moment' ? {...analysis,variance:0} : analysis}]}};
            if (route === '/api/project/validate') return {valid:fault !== 'invalid-design'};
            if (route === '/api/home/jobs') return {jobs:[{operation:'design-build',status:'completed',request:{destinationPath:destination}}]};
            if (route === '/api/project/jobs') return {jobs:currentProject.includes('second') ? (fault === 'isolation' ? [{id:'simulation-own'}] : []) : [{id:'simulation-own',operation:'simulation'}]};
            if (route === '/api/project/replays') return fault === 'replay-provenance' ? [{...row,startedAt:undefined}] : [{...row}];
            if (route.startsWith('/api/project/artifacts/build/')) return {result:{stakePrerequisiteProvenance:{route:'reuse', disposition:fault === 'borrowed' ? 'created' : 'borrowed', selectedPrerequisiteLocation:output('outcomeLibrary')}}};
            if (route.startsWith('/api/project/jobs/simulation-own')) {if (!progressRead && id==='ui-ux') {progressRead=true; return {id:'simulation-own',status:'running',progress:{current:1}};} return {id:'simulation-own',status:'completed'};}
            if (route.startsWith('/api/project/jobs/')) return {id:route.split('/').at(-1),status:fault === 'terminal' ? 'failed' : 'completed'};
            if (route.startsWith('/api/project/reports/')) return {report:{rounds:500000}};
            throw new Error(`unexpected public read: ${route}`);
        },
        latestPreview:async () => {previews++; return previews===1 ? {preparedOperationId:'initial',stakePreflight:{route:'generate'}} : {preparedOperationId:'refreshed',stakePreflight:{route:'reuse'}};},
        reload:async () => {afterReload=true;}, offline:async offline => {assert.ok(afterReload);},
        viewport:async () => {}, focus:async () => {}, key:async () => {},
        focusGeometry:async () => ({focused:fault !== 'focus-theft', insideViewport:fault !== 'clipped'}),
        keepObject:async () => 'remote-common-card', sameObject:async () => fault !== 'replaced-card',
        settle:async () => {}, painted:async () => fault !== 'unpainted',
    };
    return {request, s, receipts, activations, history, images};
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
        if (id==='graphic-designer') assert.deepEqual(f.images,['graphic-home','graphic-project','graphic-build','graphic-running-job','graphic-settled-common-card']);
    });
}

for (const [id, faults] of Object.entries({
    'stake-uint64-total':['rare-moment'],
    'occupied-destination':['occupied-submit','publication','race'],
    programmer:['terminal','stale-plan','borrowed','manifest'],
    mathematician:['replay-provenance'],
    producer:['accounting','invalid-design'],
    'ui-ux':['duplicate','isolation','clipped'],
    'graphic-designer':['replaced-card','focus-theft','unpainted','clipped'],
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
