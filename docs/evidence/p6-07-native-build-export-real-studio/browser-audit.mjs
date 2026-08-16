import {execFileSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import WebSocket from "ws";

const out = new URL(".", import.meta.url);
const transcript = [];
const note = (s) => { const line = `[${new Date().toISOString()}] ${s}`; transcript.push(line); console.log(line); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const target = (await (await fetch("http://127.0.0.1:9228/json/new?about:blank", {method:"PUT"})).json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let id = 0;
const pending = new Map();
socket.on("message", (raw) => { const message = JSON.parse(raw); if (pending.has(message.id)) { const {resolve, reject} = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); } });
const send = (method, params={}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, {resolve, reject}); socket.send(JSON.stringify({id:requestId, method, params})); });
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true})).result.value;
const body = () => evaluate("document.body.innerText");
const waitFor = async (needle, ms=20000) => { const end = Date.now()+ms; while (!(await body()).includes(needle)) { if (Date.now() > end) throw new Error(`Timed out waiting for ${needle}`); await sleep(150); } };
const button = async (label) => evaluate(`(() => { const e=[...document.querySelectorAll('button,a,[role=button]')].find(x=>x.textContent?.trim()===${JSON.stringify(label)}&&!x.disabled&&x.getClientRects().length); if(!e)return {available:[...document.querySelectorAll('button,a,[role=button]')].filter(x=>x.getClientRects().length).map(x=>x.textContent?.trim())}; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
const click = async (label) => { const p=await button(label); if (!p?.x) throw new Error(`Missing ${label}: ${JSON.stringify(p?.available)}`); await send("Input.dispatchMouseEvent", {type:"mousePressed",x:p.x,y:p.y,button:"left",clickCount:1}); await send("Input.dispatchMouseEvent", {type:"mouseReleased",x:p.x,y:p.y,button:"left",clickCount:1}); note(`CLICK ${label} at rendered coordinates (${Math.round(p.x)},${Math.round(p.y)})`); await sleep(350); };
const snapshot = async (name) => { const png = await send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}); await writeFile(new URL(`${name}.png`,out),Buffer.from(png.data,"base64")); await writeFile(new URL(`${name}.txt`,out),`${await body()}\n`); note(`CAPTURE ${name}.png/.txt`); };
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Page.navigate", {url:"http://127.0.0.1:4618"});
  await waitFor("Build/Export"); note("OBSERVE blueprint project exposes the rendered Build/Export tab."); await click("Build/Export"); await waitFor("TypeScript Game Package");
  await snapshot("blueprint-build-export-before-picker");
  for (let page = 0; page < 6; page += 1) { await send("Input.dispatchKeyEvent", {type:"keyDown", key:"PageDown", code:"PageDown", windowsVirtualKeyCode:34}); await send("Input.dispatchKeyEvent", {type:"keyUp", key:"PageDown", code:"PageDown", windowsVirtualKeyCode:34}); await sleep(100); }
  await click("Browse…"); note("OBSERVE Studio invoked the local native folder picker."); await sleep(700);
  const output = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-6-final-polishing/task_P6-07-20260817000339/docs/evidence/p6-07-native-build-export-real-studio/native-directory-output";
  execFileSync("xdotool", ["search","--name","Select a folder","windowactivate","--sync","key","ctrl+l","type","--delay","1",output,"key","Return"], {env:{...process.env, DISPLAY:":98"}});
  note(`NATIVE PICKER selected existing folder ${output} via visible keyboard interaction.`); await waitFor("Selected destination:"); await waitFor(output); await waitFor("Build preflight"); await snapshot("directory-preflight-after-native-picker");
  await click("Build"); await waitFor("Built to", 60000); note("OBSERVE Build completed through Studio and rendered its output path."); await snapshot("directory-build-complete");
  await click("Open output folder"); note("CLICK Open output folder after the successful directory build."); await snapshot("directory-open-output-clicked");
  await writeFile(new URL("browser-transcript.txt",out), `${transcript.join("\n")}\n`);
} catch (error) { note(`FAILED ${error.stack ?? error}`); await writeFile(new URL("browser-transcript.txt",out), `${transcript.join("\n")}\n`); process.exitCode=1; }
socket.close();
