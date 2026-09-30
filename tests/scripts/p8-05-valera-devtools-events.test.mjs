import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {WebSocketServer} from "ws";
import {clickP805CapturedControl, connectP805Devtools, observeP805CreatorValidation, observeP805PointerTerminal, pressP805Enter, validateP805BlueprintMutationResponse, validateP805RetryTerminalReceipt} from "../../scripts/p8-05-valera-browser-audit.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const poll = async (predicate) => {
    const deadline = Date.now() + 10_000;
    for (;;) {
        const result = await predicate();
        if (result) return result;
        assert.ok(Date.now() < deadline, "focused DevTools boundary timed out");
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
};

test("the live DevTools collector retains exact request completion without retaining data notifications", async () => {
    const server = createServer((_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({webSocketDebuggerUrl:`ws://127.0.0.1:${server.address().port}`}));
    });
    const sockets = new WebSocketServer({server});
    const lifecycle = [
        {method:"Network.requestWillBeSent", params:{requestId:"validation-1", request:{method:"POST", url:"http://localhost/api/home/blueprints/validate"}}},
        {method:"Network.responseReceived", params:{requestId:"validation-1", response:{status:200, url:"http://localhost/api/home/blueprints/validate"}}},
        {method:"Network.loadingFinished", params:{requestId:"unrelated", encodedDataLength:10}},
        {method:"Network.loadingFinished", params:{requestId:"validation-1", encodedDataLength:29}},
        {method:"Network.loadingFailed", params:{requestId:"failed-validation", errorText:"net::ERR_ABORTED"}},
        {method:"Runtime.exceptionThrown", params:{exceptionDetails:{text:"diagnostic"}}},
        {method:"Log.entryAdded", params:{entry:{text:"diagnostic"}}},
    ];
    sockets.on("connection", (socket) => socket.on("message", (raw) => {
        const command = JSON.parse(raw.toString());
        if (command.method === "Page.navigate") {
            for (let index = 0; index < 100; index += 1) socket.send(JSON.stringify({method:"Network.dataReceived", params:{requestId:"validation-1", dataLength:1}}));
            for (const event of lifecycle) socket.send(JSON.stringify(event));
        }
        socket.send(JSON.stringify({id:command.id, result:{}}));
    }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let cdp;
    try {
        cdp = await connectP805Devtools(`http://127.0.0.1:${server.address().port}`);
        await cdp.send("Page.navigate", {url:"http://localhost/#/home/design"});
        assert.deepEqual(cdp.events, lifecycle);
    } finally {
        await cdp?.close();
        await new Promise((resolve) => sockets.close(resolve));
        await new Promise((resolve) => server.close(resolve));
    }
});

const validationRequest = (requestId) => ({method:"Network.requestWillBeSent", params:{requestId, request:{method:"POST", url:"http://localhost/api/home/blueprints/validate"}}});
const validationResponse = (requestId, status = 200) => ({method:"Network.responseReceived", params:{requestId, response:{status, url:"http://localhost/api/home/blueprints/validate"}}});
const completion = (requestId) => ({method:"Network.loadingFinished", params:{requestId}});

test("unrelated completion and an older late response cannot authorize the latest validation", async () => {
    const cdp = {events:[validationRequest("older"), validationResponse("older"), completion("older"), validationRequest("latest"), validationResponse("latest"), validationResponse("older"), completion("unrelated")]};
    const unexpectedRead = () => assert.fail("pending validation must not read a body or focus a control");
    assert.equal(await observeP805CreatorValidation(cdp, unexpectedRead, unexpectedRead), false);
});

test("failed and invalid validation cannot authorize Create game", async () => {
    const unexpectedFocus = () => assert.fail("rejected validation must not focus Create game");
    const cdp = {events:[validationRequest("failed"), {method:"Network.loadingFailed", params:{requestId:"failed", errorText:"net::ERR_ABORTED"}}]};
    await assert.rejects(observeP805CreatorValidation(cdp, unexpectedFocus, unexpectedFocus), /failed to complete/);
    for (const [status, payload] of [[500, {status:"ok"}], [200, {status:"invalid", errors:["invalid starter"]}]]) {
        cdp.events = [validationRequest("invalid"), validationResponse("invalid", status), completion("invalid")];
        await assert.rejects(observeP805CreatorValidation(cdp, unexpectedFocus, async (requestId) => {
            assert.equal(requestId, "invalid");
            return {body:JSON.stringify(payload)};
        }), /did not accept the starter game/);
    }
});

test("body decoding preserves exact bytes and rejects a validation superseded during observation", async () => {
    const cdp = {events:[validationRequest("selected"), validationResponse("selected"), completion("selected")]};
    const bytes = '{ "status": "ok", "warnings": [] }';
    const control = {stableControlId:"blueprint-create-game", validationState:"ok"};
    const readBody = async (requestId) => {
        assert.equal(requestId, "selected");
        return {body:Buffer.from(bytes).toString("base64"), base64Encoded:true};
    };
    const ready = await observeP805CreatorValidation(cdp, async () => control, readBody);
    assert.equal(ready.validation.bodySha256, hash(bytes));
    assert.equal(ready.validation.responseSha256, hash(JSON.stringify(JSON.parse(bytes))));
    assert.notEqual(ready.validation.bodySha256, ready.validation.responseSha256);
    assert.equal(await observeP805CreatorValidation(cdp, async () => {
        cdp.events.push(validationRequest("superseding"));
        return control;
    }, readBody), false);
});

test("completed browser validation binds rendered readiness before one native Create game activation", async () => {
    // This small protocol fixture exercises Chromium's real body completion,
    // DOM state, and trusted native activation. It does not build or run the
    // controller-owned packed Studio persona proof.
    const body = JSON.stringify({status:"ok", warnings:[]});
    const requests = [];
    let pendingBody;
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/home/blueprints/validate") {
            response.setHeader("Content-Type", "application/json");
            response.write(body.slice(0, 12));
            pendingBody = response;
        } else if (request.url === "/api/home/blueprints/save-managed") {
            response.writeHead(201, {"Content-Type":"application/json"});
            response.end(JSON.stringify({status:"ok", path:"starter.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><button id="blueprint-create-game" data-pokie-validation-state="idle">Create game</button><div role="status"></div><script>
                const button = document.getElementById('blueprint-create-game');
                const status = document.querySelector('[role=status]');
                window.activations = [];
                button.addEventListener('click', async (event) => {
                    window.activations.push({trusted:event.isTrusted, controlId:event.currentTarget.id});
                    button.disabled = true;
                    const response = await fetch('/api/home/blueprints/save-managed', {method:'POST', body:'{}'});
                    if (response.status === 201) location.hash = '/project/starter/overview';
                });
                window.beginValidation = async () => {
                    button.disabled = true;
                    button.dataset.pokieValidationState = 'loading';
                    const response = await fetch('/api/home/blueprints/validate', {method:'POST', body:'{"game":"starter"}'});
                    window.validationPayload = await response.json();
                };
                window.renderValidation = () => {
                    button.dataset.pokieValidationState = window.validationPayload.status;
                    status.textContent = 'Valid — no issues found.';
                    button.disabled = false;
                };
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-validation-"));
    const browser = spawn(process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio:"ignore"});
    const exited = new Promise((resolve, reject) => { browser.once("exit", resolve); browser.once("error", reject); });
    let cdp;
    try {
        const port = await poll(async () => { try { return (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return false; } });
        cdp = await connectP805Devtools(`http://127.0.0.1:${port}`);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        const bodyReads = [];
        const readBody = async (requestId) => {
            bodyReads.push(requestId);
            return cdp.send("Network.getResponseBody", {requestId});
        };
        const observe = () => observeP805CreatorValidation(cdp, evaluate, readBody);
        await cdp.send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/#/home/design`});
        await poll(() => evaluate("document.readyState === 'complete' && typeof window.beginValidation === 'function'"));
        assert.equal(await observe(), false, "the enabled idle debounce window is not validated readiness");
        await evaluate("void window.beginValidation()");
        const request = await poll(() => cdp.events.find((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/home/blueprints/validate")));
        const requestId = request.params.requestId;
        const response = await poll(() => cdp.events.find((event) => event.method === "Network.responseReceived" && event.params.requestId === requestId));
        assert.equal(response.params.response.status, 200);
        assert.equal(await observe(), false, "headers cannot stand in for completed response bytes");
        assert.deepEqual(bodyReads, []);
        pendingBody.end(body.slice(12));
        const completed = await poll(() => cdp.events.find((event) => event.method === "Network.loadingFinished" && event.params.requestId === requestId));
        assert.equal(completed.params.requestId, requestId);
        await poll(() => evaluate("window.validationPayload?.status === 'ok'"));
        assert.equal(await observe(), false, "a completed body cannot stand in for its rendered state");
        await evaluate("window.renderValidation()");
        await evaluate("document.getElementById('blueprint-create-game').disabled = true");
        assert.equal(await observe(), false, "a disabled rendered action cannot be activated");
        await evaluate("document.getElementById('blueprint-create-game').disabled = false");
        const ready = await observe();
        assert.deepEqual(ready, {
            control:{stableControlId:"blueprint-create-game", validationState:"ok"},
            validation:{browserRequestId:requestId, payload:JSON.parse(body), status:200, completed:true, bodySha256:hash(body), responseSha256:hash(body), renderedValidation:{controlId:"blueprint-create-game", status:"ok"}},
        });
        assert.ok(bodyReads.length > 0 && bodyReads.every((id) => id === requestId));
        assert.equal(request.params.request.method, "POST");
        assert.equal(request.params.request.postData, '{"game":"starter"}');
        const activationCursor = cdp.events.length;
        await pressP805Enter(cdp);
        await poll(() => evaluate("location.hash === '#/project/starter/overview'"));
        const saved = await poll(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.responseReceived" && event.params.response.url.endsWith("/api/home/blueprints/save-managed")));
        assert.equal(saved.params.response.status, 201);
        assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:ready.control.stableControlId}]);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/validate").length, 1);
        assert.equal(requests.filter(({method, path}) => method === "POST" && path === "/api/home/blueprints/save-managed").length, 1);
        assert.equal(cdp.events.slice(activationCursor).filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/home/blueprints/save-managed")).length, 1);
    } finally {
        pendingBody?.end();
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
});


test("Blueprint mutation receipts follow each public endpoint's HTTP and domain terminal contract", () => {
    for (const [pathname, status] of [["/api/home/blueprints/validate", 200], ["/api/home/blueprints/save", 201]]) {
        const payload = {status:"ok"};
        assert.equal(validateP805BlueprintMutationResponse(pathname, status, payload), payload);
        for (const rejectedStatus of [200, 201, 409, 500].filter((value) => value !== status)) {
            assert.throws(() => validateP805BlueprintMutationResponse(pathname, rejectedStatus, payload), /did not reach a successful terminal/);
        }
        for (const rejected of ["conflict", "error", "invalid"]) {
            assert.throws(() => validateP805BlueprintMutationResponse(pathname, status, {status:rejected}), /did not reach a successful terminal/);
        }
    }
    assert.throws(() => validateP805BlueprintMutationResponse("/unrelated", 201, {status:"ok"}), /did not reach a successful terminal/);
});

test("native Retry follows its captured node through animation and terminal replacement, rejecting invalid dispatch and result evidence", async () => {
    const requests = [];
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/project/simulations") {
            response.writeHead(202, {"Content-Type":"application/json"});
            response.end(JSON.stringify({id:"retry-job", status:"queued"}));
        } else if (request.url === "/api/project/simulations/retry-job") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({id:"retry-job", status:"completed", reportPath:"report.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><div style="display:inline-block"><button id="simulation-retry">Repeat simulation</button></div><div id="simulation-results" tabindex="-1"></div><script>
                const button = document.getElementById('simulation-retry');
                const result = document.getElementById('simulation-results');
                const mode = new URL(location.href).searchParams.get('mode');
                window.activations = [];
                button.addEventListener('mouseover', () => {
                    if (mode === 'changed-hit') {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                        document.body.append(overlay);
                    } else if (mode === 'changed-node') {
                        button.replaceWith(button.cloneNode(true));
                    } else if (mode === 'disabled') button.disabled = true;
                    else if (mode.startsWith('moving')) {
                        // A portal/terminal transition can move the same live
                        // control between its initial capture and native press.
                        const animated = mode === 'moving-parent' ? button.parentElement : button;
                        animated.style.transform = 'translateX(260px)';
                        const animation = animated.animate([{transform:'translateX(180px)'}, {transform:'translateX(260px)'}], {duration:180});
                        if (mode === 'moving-obstructed') animation.finished.then(() => {
                            const overlay = document.createElement('div');
                            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                            document.body.append(overlay);
                        });
                    }
                });
                button.addEventListener('click', async (event) => {
                    window.activations.push({trusted:event.isTrusted, controlId:event.currentTarget.id});
                    if (mode === 'replaced' || mode === 'moving-replaced') button.replaceWith(button.cloneNode(true));
                    if (mode === 'removed') button.remove();
                    result.focus();
                    const response = await fetch('/api/project/simulations', {method:'POST', body:'{}'});
                    const started = await response.json();
                    window.terminal = await (await fetch('/api/project/simulations/' + started.id)).json();
                });
                window.renderTerminal = (jobId = window.terminal.id) => {
                    result.textContent = 'Simulation completed. Open report.json';
                    for (const [name, value] of Object.entries({
                        'data-pokie-lifecycle-result':'simulation',
                        'data-pokie-lifecycle-result-control':'simulation-retry',
                        'data-pokie-lifecycle-result-operation':'simulation-retry',
                        'data-pokie-lifecycle-result-state':'recovery-operation',
                        'data-pokie-lifecycle-terminal':window.terminal.status,
                        'data-pokie-lifecycle-result-receipt':'durable-terminal',
                        'data-pokie-lifecycle-result-durable-status':window.terminal.status,
                        'data-pokie-lifecycle-result-job':jobId,
                        'data-pokie-lifecycle-result-durable-job':jobId,
                    })) result.setAttribute(name, value);
                };
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-retry-"));
    const browser = spawn(process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio:"ignore"});
    const exited = new Promise((resolve, reject) => { browser.once("exit", resolve); browser.once("error", reject); });
    let cdp;
    try {
        const port = await poll(async () => { try { return (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return false; } });
        cdp = await connectP805Devtools(`http://127.0.0.1:${port}`);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        for (const mode of ["retained", "replaced", "removed", "moving", "moving-parent", "moving-replaced", "confirmation-pointer", "moving-obstructed", "changed-hit", "changed-node", "disabled", "dispatch-failed"]) {
            const url = `http://127.0.0.1:${server.address().port}/?mode=${mode}`;
            await cdp.send("Page.navigate", {url});
            await poll(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && typeof window.renderTerminal === 'function'`));
            // Move off the control before capture, so its hover handler executes
            // only at the production helper's capture-to-dispatch boundary.
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:400, y:300, pointerType:"mouse"});
            const cursor = cdp.events.length;
            const dispatcher = mode === "dispatch-failed" ? {
                send: (method, params) => method === "Input.dispatchMouseEvent" && params.type === "mousePressed"
                    ? Promise.reject(new Error("native pointer dispatch rejected")) : cdp.send(method, params),
            } : cdp;
            // Confirmations use the helper's simpler native pointer options;
            // preserve that sibling caller as well as the Retry configuration.
            const fullPointerState = mode !== "confirmation-pointer";
            const click = () => clickP805CapturedControl(dispatcher, evaluate, "simulation-retry", fullPointerState, fullPointerState, fullPointerState, true);
            if (["moving-obstructed", "changed-hit", "changed-node", "disabled", "dispatch-failed"].includes(mode)) {
                await assert.rejects(click(), mode === "dispatch-failed" ? /native pointer dispatch rejected/ : /changed its captured identity, native focus, or hit target/);
                assert.deepEqual(await evaluate("window.activations"), []);
                assert.equal(cdp.events.slice(cursor).filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.method === "POST").length, 0);
                assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"), [0, 0]);
                continue;
            }
            const pointer = {kind:"pointer", count:1, controlId:"simulation-retry", ...await click()};
            assert.equal(pointer.preDispatchFocus.native, true);
            assert.equal(pointer.hitTest.matchesCapturedControl, true);
            assert.equal(pointer.dispatch.focus.native, true);
            assert.equal(pointer.dispatch.focus.targetMatchesCapturedControl, true);
            assert.equal(pointer.dispatch.pressed, true);
            assert.equal(pointer.dispatch.released, true);
            assert.equal(pointer.dispatch.focus.hitTest.matchesCapturedControl, true);
            assert.equal(pointer.dispatch.buttons, fullPointerState ? 1 : 0);
            assert.equal(pointer.dispatch.pointerType, fullPointerState ? "mouse" : null);
            if (mode.startsWith("moving")) assert.ok(pointer.x > 180, "dispatch follows the settled captured node's live hit target");
            await poll(() => evaluate("window.terminal?.status === 'completed'"));
            const events = cdp.events.slice(cursor);
            const submitted = events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/project/simulations") && event.params.request.method === "POST");
            assert.equal(submitted.length, 1);
            const browserRequestId = submitted[0].params.requestId;
            assert.equal(submitted[0].params.request.postData, "{}");
            const terminalEvent = await poll(() => cdp.events.slice(cursor).find((event) => event.method === "Network.responseReceived" && event.params.response.url.endsWith("/api/project/simulations/retry-job")));
            await poll(() => cdp.events.some((event) => event.method === "Network.loadingFinished" && event.params.requestId === terminalEvent.params.requestId));
            const terminal = JSON.parse((await cdp.send("Network.getResponseBody", {requestId:terminalEvent.params.requestId})).body);
            const receipt = {status:terminal.status, jobId:terminal.id, result:terminal, resultSha256:hash(JSON.stringify(terminal)), browserRequestId:terminalEvent.params.requestId};
            const transaction = {operation:"simulation-retry", stateClass:"recovery-operation", control:{stableControlId:"simulation-retry"}, pointerActivations:[pointer], keyboardActivations:[], requestCount:1, request:{browserRequestId, method:"POST", path:"/api/project/simulations"}, terminal:{...receipt, causedByRequestId:browserRequestId}};
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "the network terminal cannot replace a rendered result");
            await evaluate("window.renderTerminal('unrelated-job')");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "an unrelated rendered job cannot release this receipt");
            await evaluate("window.renderTerminal(); document.getElementById('simulation-results').hidden = true");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "a hidden terminal cannot replace the visible result");
            await evaluate("document.getElementById('simulation-results').hidden = false; document.getElementById('simulation-results').focus()");
            transaction.postTransitionRenderedState = await observeP805PointerTerminal(evaluate, transaction, receipt);
            const expectedControlState = ["moving", "moving-parent", "confirmation-pointer"].includes(mode) ? "retained" : mode === "moving-replaced" ? "replaced" : mode;
            assert.equal(transaction.postTransitionRenderedState.controlState, expectedControlState);
            assert.equal(transaction.postTransitionRenderedState.capturedControlConnected, expectedControlState === "retained");
            assert.equal(transaction.postTransitionRenderedState.activeElementId, "simulation-results");
            assert.deepEqual(transaction.postTransitionRenderedState.preDispatchEvidence, {capturedControlId:pointer.capturedControlId, focus:pointer.preDispatchFocus, hitTest:pointer.hitTest, dispatch:pointer.dispatch});
            const retry = {operation:"simulation-retry", controlId:"simulation-retry", stateClass:"recovery-operation", transaction};
            assert.equal(validateP805RetryTerminalReceipt(retry), retry);
            for (const corrupt of [
                (value) => { value.transaction.pointerActivations[0].preDispatchFocus.native = false; },
                (value) => { value.transaction.pointerActivations[0].hitTest.matchesCapturedControl = false; },
                (value) => { value.transaction.pointerActivations[0].dispatch.focus.targetMatchesCapturedControl = false; },
                (value) => { value.transaction.pointerActivations = []; value.transaction.keyboardActivations = [{kind:"keyboard", controlId:"simulation-retry", count:1, nativeFocus:true}]; },
                (value) => { value.transaction.postTransitionRenderedState.requestId = "unrelated-request"; },
                (value) => { value.transaction.postTransitionRenderedState.resultJobId = "unrelated-job"; },
                (value) => { value.transaction.postTransitionRenderedState.resultSha256 = "0".repeat(64); },
            ]) {
                const invalid = structuredClone(retry);
                corrupt(invalid);
                assert.throws(() => validateP805RetryTerminalReceipt(invalid), /not bound to its captured Retry control/);
            }
            assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"simulation-retry"}]);
            assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"), [0, 0]);
            assert.equal(events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/project/simulations/retry-job") && event.params.request.method === "GET").length, 1);
        }
        assert.equal(requests.filter(({method, path}) => method === "POST" && path === "/api/project/simulations").length, 7);
    } finally {
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
});
