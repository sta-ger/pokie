import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {WebSocketServer} from "ws";
import {connectP805Devtools, observeP805CreatorValidation, pressP805Enter} from "../../scripts/p8-05-valera-browser-audit.mjs";

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
        await rm(profile, {recursive:true, force:true});
    }
});
