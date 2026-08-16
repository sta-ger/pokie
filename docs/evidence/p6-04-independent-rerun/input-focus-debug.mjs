import WebSocket from "ws";
const target = (await (await fetch("http://127.0.0.1:9226/json/list")).json()).find((item) => item.type === "page" && item.url.includes("127.0.0.1:46148"));
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => {socket.once("open", resolve); socket.once("error", reject);});
let id = 0; const waiting = new Map(); socket.on("message", (raw) => { const response = JSON.parse(raw); if (response.id && waiting.has(response.id)) { const request = waiting.get(response.id); waiting.delete(response.id); request.resolve(response.result); } });
const send = (method, params={}) => new Promise((resolve, reject) => {const requestId=++id; waiting.set(requestId,{resolve,reject}); socket.send(JSON.stringify({id:requestId,method,params}));});
await send("Page.enable"); await send("Runtime.enable"); await send("Page.bringToFront");
const evaluate = async (expression) => (await send("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true})).result.value;
await send("Page.navigate", {url:"http://127.0.0.1:46148/#/home/design"}); await new Promise((resolve)=>setTimeout(resolve,1000));
const result = await evaluate(`(() => { const element=[...document.querySelectorAll('input')].find((candidate)=>[...(candidate.labels??[])].some((label)=>label.textContent?.trim()==='Game name')); const r=element.getBoundingClientRect(); return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},value:element.value,active:document.activeElement?.tagName}; })()`);
await send("Input.dispatchMouseEvent", {type:"mousePressed",x:result.rect.x+result.rect.width/2,y:result.rect.y+result.rect.height/2,button:"left",buttons:1,clickCount:1});
await send("Input.dispatchMouseEvent", {type:"mouseReleased",x:result.rect.x+result.rect.width/2,y:result.rect.y+result.rect.height/2,button:"left",buttons:0,clickCount:1});
await new Promise((resolve)=>setTimeout(resolve,200));
await send("Input.dispatchKeyEvent", {type:"keyDown", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
await send("Input.dispatchKeyEvent", {type:"keyUp", key:"a", code:"KeyA", windowsVirtualKeyCode:65, modifiers:2});
for (const character of "P6") { await send("Input.dispatchKeyEvent", {type:"char", text:character, unmodifiedText:character, key:character}); }
await new Promise((resolve)=>setTimeout(resolve,200));
console.log(JSON.stringify({before:result,after:await evaluate(`({active:document.activeElement?.tagName,label:[...(document.activeElement?.labels??[])].map((label)=>label.textContent?.trim()),value:document.activeElement?.value})`)},null,2));
socket.close();
