import assert from "node:assert/strict";
import {execFileSync, spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {WebSocketServer} from "ws";
import {verifyP805CandidatePackage} from "../../scripts/p8-05-candidate-package-verifier.mjs";
import {activateP805KeyboardControl, setP805ReplayArtifactInput, clickP805CapturedControl, hasP805NativeActivation, connectP805Devtools, createP805RenderedGame, observeP805CreatorValidation, observeP805NavigationReadiness, observeP805PointerTerminal, pressP805Enter, validateP805BlueprintMutationResponse, validateP805RetryTerminalReceipt} from "../../scripts/p8-05-valera-browser-audit.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const nativeButtonStyles = await readFile(new URL("../../node_modules/@mantine/core/styles/global.css", import.meta.url), "utf8");

test.each(["npm wrapper", "direct Jest"])("candidate verification isolates %s context and retains canonical archive bytes", async (launcher) => {
    // This bounded fixture exercises the verifier's real build/receipt path;
    // it does not launch the controller-owned full package or release gates.
    const repository = await mkdtemp(path.join(process.cwd(), ".p8-05-canonical-context-test-"));
    const git = (...args) => execFileSync("git", args, {cwd:repository, encoding:"utf8"});
    const callerContext = {NODE_ENV:"test", INIT_CWD:repository, PWD:repository, npm_lifecycle_event:"test:targeted", npm_lifecycle_script:"caller test script", npm_lifecycle_caller:"caller-only lifecycle field", npm_package_json:path.join(repository, "caller-package.json"), npm_package_name:"caller-package", npm_package_version:"0.0.0", npm_package_scripts_build:"caller build script", npm_package_config_output:"caller output"};
    const environmentKeys = new Set([...Object.keys(process.env).filter((name) => name.startsWith("npm_package_") || name.startsWith("npm_lifecycle_")), ...Object.keys(callerContext)]);
    const savedEnvironment = new Map([...environmentKeys].map((name) => [name, process.env[name]]));
    try {
        const declaration = {name:"pokie", version:"1.3.0", type:"module", scripts:{prebuild:"node -e \"throw new Error('unrelated prebuild gate must not run')\"", build:"node build.cjs"}};
        const executable = "export const candidate = 805;\n";
        await writeFile(path.join(repository, "package.json"), JSON.stringify(declaration));
        await writeFile(path.join(repository, "package-lock.json"), "{}\n");
        await writeFile(path.join(repository, "source.js"), executable);
        await writeFile(path.join(repository, "build.cjs"), `
            const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
            assert.equal(process.env.NODE_ENV, 'production');
            assert.equal(process.env.npm_lifecycle_event, 'build');
            assert.equal(process.env.npm_lifecycle_script, 'node build.cjs');
            assert.equal(process.env.npm_package_json, path.join(process.cwd(), 'package.json'));
            assert.equal(process.env.npm_package_name, 'pokie');
            assert.equal(process.env.npm_package_version, '1.3.0');
            assert.deepEqual(Object.keys(process.env).filter((name) => name.startsWith('npm_package_') || name.startsWith('npm_lifecycle_')).sort(), ['npm_lifecycle_event', 'npm_lifecycle_script', 'npm_package_json', 'npm_package_name', 'npm_package_version']);
            assert.equal(process.env.INIT_CWD, process.cwd());
            assert.equal(process.env.PWD, process.cwd());
            fs.mkdirSync('dist');
            fs.copyFileSync(path.join(path.dirname(process.env.npm_package_json), 'source.js'), 'dist/index.js');
        `);
        git("init", "--quiet");
        git("add", "package.json", "package-lock.json", "source.js", "build.cjs");
        git("-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "[P8-05] canonical build context fixture");
        const candidateId = git("rev-parse", "HEAD").trim();
        await mkdir(path.join(repository, "node_modules"));
        await mkdir(path.join(repository, "package", "dist"), {recursive:true});
        await writeFile(path.join(repository, "package", "package.json"), JSON.stringify(declaration));
        await writeFile(path.join(repository, "package", "dist", "index.js"), executable);
        const sourceArchive = path.join(repository, "canonical.tgz"), candidateArchive = path.join(repository, "handoff.tgz"), receipt = path.join(repository, "receipt.json");
        const pack = () => execFileSync("tar", ["-czf", sourceArchive, "-C", repository, "package"]);
        pack();
        const canonicalBytes = await readFile(sourceArchive);
        // Exercise both supported launchers regardless of how this test itself
        // was launched. Caller context is fixture data, not npm-only authority.
        for (const name of environmentKeys) delete process.env[name];
        if (launcher === "npm wrapper") Object.assign(process.env, callerContext);
        else process.env.NODE_ENV = "test";
        const inheritedContext = [...environmentKeys].map((name) => [name, process.env[name]]);
        const verified = await verifyP805CandidatePackage({sourceArchive, candidateArchive, receipt, candidateId, repositoryRoot:repository});
        assert.deepEqual([...environmentKeys].map((name) => [name, process.env[name]]), inheritedContext, "verification must not mutate its caller's environment");
        assert.deepEqual(await readFile(sourceArchive), canonicalBytes);
        assert.deepEqual(await readFile(candidateArchive), canonicalBytes);
        assert.equal(verified.candidateId, candidateId);
        assert.equal(verified.candidatePackageSha256, hash(canonicalBytes));
        assert.deepEqual(verified.verifiedBuild.environment, {NODE_ENV:"production"});
        assert.deepEqual(verified.verifiedBuild.lifecycle, {event:"build", packageName:"pokie", packageVersion:"1.3.0"});
        assert.equal(verified.authentication.attestedBuildSha256, hash(JSON.stringify(verified.verifiedBuild)));
        assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), verified);
        assert.equal((await readdir(repository)).some((entry) => entry.startsWith(".p8-05-candidate-build-")), false);

        await writeFile(path.join(repository, "package", "dist", "index.js"), "export const candidate = 804;\n");
        pack();
        const staleArchive = await readFile(sourceArchive);
        const rejectedReceipt = path.join(repository, "rejected-receipt.json"), rejectedArchive = path.join(repository, "rejected-handoff.tgz");
        await assert.rejects(verifyP805CandidatePackage({sourceArchive, candidateArchive:rejectedArchive, receipt:rejectedReceipt, candidateId, repositoryRoot:repository}), /changed.*dist\/index.js/);
        assert.deepEqual(await readFile(sourceArchive), staleArchive);
        await assert.rejects(readFile(rejectedReceipt), {code:"ENOENT"});
        await assert.rejects(readFile(rejectedArchive), {code:"ENOENT"});
        assert.deepEqual(await readFile(candidateArchive), canonicalBytes, "a rejected archive must preserve the prior handoff");
        assert.equal((await readdir(repository)).some((entry) => entry.startsWith(".p8-05-candidate-build-")), false);
        assert.deepEqual([...environmentKeys].map((name) => [name, process.env[name]]), inheritedContext);
    } finally {
        for (const [name, value] of savedEnvironment) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        await rm(repository, {recursive:true, force:true});
    }
});

const poll = async (predicate, timeoutMs = 10_000, diagnostic = () => "focused DevTools boundary timed out") => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const result = await predicate();
        if (result) return result;
        assert.ok(Date.now() < deadline, diagnostic());
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
};

function launchFocusedBrowser(profile) {
    const browser = spawn(process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio:["ignore", "ignore", "pipe"]});
    let terminal;
    let stderr = "";
    browser.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    // Observe early exit/spawn failure immediately and leave one settled
    // promise for the fixture's finally block to await on every path.
    const exited = new Promise((resolve) => {
        browser.once("error", (error) => { terminal = {error:error.message}; resolve(terminal); });
        browser.once("exit", (code, signal) => { terminal = {code, signal}; resolve(terminal); });
    });
    // A fresh Chromium profile starts under the controller's concurrent
    // changed-test load. Give only process startup its own bounded budget;
    // request completion, rendered readiness and native actions retain 10s.
    const waitForPort = () => poll(async () => {
        assert.equal(terminal, undefined, `focused Chromium stopped before DevTools startup: ${JSON.stringify(terminal)}\n${stderr}`);
        try {
            const port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
            return /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 ? port : false;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            return false;
        }
    }, 30_000, () => `focused Chromium DevTools startup timed out\n${stderr}`);
    return {browser, exited, waitForPort};
}

test("the live DevTools collector retains exact request completion without retaining data notifications", async () => {
    const targetUrls = [], commands = [];
    const initialUrl = "http://localhost/#/home/design";
    const server = createServer((request, response) => {
        targetUrls.push(decodeURIComponent(request.url.split("?")[1]));
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
        commands.push(command.method);
        if (command.method === "Page.navigate") {
            assert.equal(command.params.url, initialUrl);
            assert.deepEqual(commands, ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable", "Runtime.evaluate", "Page.navigate"]);
            for (let index = 0; index < 100; index += 1) socket.send(JSON.stringify({method:"Network.dataReceived", params:{requestId:"validation-1", dataLength:1}}));
            for (const event of lifecycle) socket.send(JSON.stringify(event));
        }
        socket.send(JSON.stringify({id:command.id, result:command.method === "Runtime.evaluate" ? {result:{value:true}} : {}}));
    }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let cdp;
    try {
        cdp = await connectP805Devtools(`http://127.0.0.1:${server.address().port}`, initialUrl);
        assert.deepEqual(targetUrls, ["about:blank"], "the production initialUrl path must instrument a blank target first");
        assert.equal(commands.at(-1), "Page.navigate");
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

test("production initialUrl captures immediate automatic validation before one native pointer and Overview, including project switching", async () => {
    const requests = [];
    const body = JSON.stringify({status:"ok", warnings:[]});
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/home/blueprints/validate") {
            response.writeHead(200, {"Content-Type":"application/json"});
            response.end(body);
        } else if (request.url === "/api/home/blueprints/save-managed") {
            response.writeHead(201, {"Content-Type":"application/json"});
            response.end(JSON.stringify({status:"ok", path:"starter.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><style>:root { --mantine-scale: 1; }${nativeButtonStyles}</style><button class="mantine-active" id="blueprint-create-game" data-pokie-validation-state="loading" aria-busy="true" disabled><span>Create game</span></button><div role="status" data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="loading"></div><script>
                const button = document.getElementById('blueprint-create-game');
                window.activations = [];
                button.addEventListener('click', async (event) => {
                    window.activations.push({trusted:event.isTrusted, controlId:event.currentTarget.id});
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                    const response = await fetch('/api/home/blueprints/save-managed', {method:'POST', body:'{}'});
                    if (response.status === 201) {
                        location.hash = '/project/starter/overview';
                        button.remove();
                        document.querySelector('[role=status]').textContent = 'Overview';
                        if (location.pathname !== '/withheld/') document.querySelector('[role=status]').dataset.pokieLifecycleTerminal = 'rendered';
                    }
                });
                fetch('/api/home/blueprints/validate', {method:'POST', body:'{"game":"starter"}'})
                    .then((response) => response.json()).then((payload) => {
                        button.dataset.pokieValidationState = payload.status;
                        button.removeAttribute('aria-busy');
                        button.disabled = false;
                    });
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-initial-url-"));
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const initialUrl = `http://127.0.0.1:${server.address().port}/#/home/design`;
        cdp = await connectP805Devtools(`http://127.0.0.1:${await waitForPort()}`, initialUrl);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        const validationIds = [];
        for (const phase of ["startup", "project-switch"]) {
            const cursor = phase === "startup" ? 0 : cdp.events.length;
            if (phase === "project-switch") await cdp.send("Page.navigate", {url:initialUrl.replace("/#/", "/switch/#/")});
            const observations = [];
            const created = await createP805RenderedGame(cdp, evaluate, observations, 10_000,
                (requestId) => cdp.send("Network.getResponseBody", {requestId}), 10_000);
            const requestId = created.validation.browserRequestId;
            validationIds.push(requestId);
            const events = cdp.events.slice(cursor);
            const validationEvents = events.filter((event) => event.params.requestId === requestId);
            assert.deepEqual(validationEvents.map((event) => event.method), ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"]);
            assert.equal(created.validation.completed, true);
            assert.equal(created.validation.bodySha256, hash(body));
            assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch", "dashboard-transition"]);
            assert.equal(observations[1].count, 1);
            assert.equal(observations[1].pressed && observations[1].released, true);
            assert.equal(observations[1].hitTest.matchesCapturedControl, true);
            assert.equal(observations[1].nativeDispatch.focus.trusted, true);
            assert.equal(observations[1].nativeDispatch.focus.validationState, "ok");
            assert.equal(observations[1].nativeDispatch.focus.enabled, true);
            assert.equal(observations[1].nativeDispatch.focus.ariaBusy, null);
            assert.equal(hasP805NativeActivation(created.activation, "blueprint-create-game"), true);
            const pressed = created.activation.dispatch.eventBindings[0];
            assert.equal(pressed.regionMatchesMeasured, false, "the receipt retains the observed pressed rectangle");
            assert.equal(pressed.regionMatchesCapturedPress, true);
            assert.equal(pressed.pressFeedback.active, true);
            assert.deepEqual(pressed.pressFeedback.matrix, [1, 0, 0, 1, 0, 1]);
            assert.equal(pressed.region.top, created.activation.hitTest.region.top + 1);
            assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"blueprint-create-game"}]);
            assert.equal(created.dashboard.route, "#/project/starter/overview");
            assert.equal(created.dashboard.overview, true);
            assert.equal(created.dashboard.terminal, "rendered");
            assert.equal(created.dashboard.visible, true);
            assert.equal(events.filter((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === "/api/home/blueprints/save-managed").length, 1);
        }
        assert.notEqual(validationIds[0], validationIds[1], "a project switch must obtain its own validation proof");
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/validate").length, 2);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/save-managed").length, 2);
        // A route and tab label can appear before the dashboard is ready.
        // Withhold that rendered terminal after a real native Create click:
        // failure must retain its dispatch receipt and never click again.
        await cdp.send("Page.navigate", {url:initialUrl.replace("/#/", "/withheld/#/")});
        const observations = [];
        await assert.rejects(createP805RenderedGame(cdp, evaluate, observations, 10_000,
            (requestId) => cdp.send("Network.getResponseBody", {requestId}), 100),
        /Failed post-click Create game Overview\/dashboard transition/);
        assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch"]);
        assert.equal(observations[1].nativeDispatch.focus.trusted, true);
        assert.equal(observations[1].count, 1);
        assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"blueprint-create-game"}]);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/save-managed").length, 3);
    } finally {
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
}, 60_000);

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
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const port = await waitForPort();
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

test("native navigation waits for rendered context and Retry retains captured identity through deferred layout and terminal replacement", async () => {
    const requests = [];
    let pendingContext;
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/project/context") {
            pendingContext = response;
            response.writeHead(200, {"Content-Type":"application/json"});
            response.write('{"status":');
        } else if (request.url === "/navigation-readiness") {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><button id="studio-navigation-toggle" style="position:fixed;top:8px;left:8px">Toggle navigation</button><div id="drawer" style="position:fixed;top:60px;transform:translateX(-260px)"></div><script>
                location.hash = '#/project/source/overview';
                window.initialBurger = document.getElementById('studio-navigation-toggle');
                window.mountTarget = () => {
                    document.getElementById('drawer').innerHTML = '<button id="project-tab:gameModel" data-pokie-lifecycle="navigation" data-pokie-lifecycle-route="gameModel">Game Model</button>';
                    document.body.insertAdjacentHTML('beforeend', '<p id="navigation-result" data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="loading">Opening game</p>');
                };
                window.beginContext = async () => { window.context = await (await fetch('/api/project/context')).json(); };
                window.renderContext = () => {
                    const burger = window.initialBurger.cloneNode(true);
                    window.initialBurger.replaceWith(burger);
                    burger.addEventListener('click', (event) => {
                        window.drawerActivation = {trusted:event.isTrusted, controlId:event.currentTarget.id};
                        document.getElementById('drawer').style.transform = 'none';
                    });
                    const result = document.getElementById('navigation-result');
                    result.textContent = 'Overview ready';
                    result.setAttribute('data-pokie-lifecycle-terminal', 'rendered');
                };
            </script>`);
        } else if (request.url === "/api/project/simulations") {
            response.writeHead(202, {"Content-Type":"application/json"});
            response.end(JSON.stringify({id:"retry-job", status:"queued"}));
        } else if (request.url === "/api/project/simulations/retry-job") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({id:"retry-job", status:"completed", reportPath:"report.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><style>:root { --mantine-scale: 1; }${nativeButtonStyles}</style><div style="display:inline-block"><button id="simulation-retry">Repeat simulation</button></div><div id="simulation-results" tabindex="-1"></div><script>
                const button = document.getElementById('simulation-retry');
                const result = document.getElementById('simulation-results');
                const mode = new URL(location.href).searchParams.get('mode');
                window.activations = [];
                if (['active-press', 'active-scaled-press', 'late-layout-shift', 'late-transform-shift', 'late-feedback-scale'].includes(mode)) {
                    button.classList.add('mantine-active');
                    button.innerHTML = '<span id="retry-label">Repeat simulation</span>';
                }
                if (mode === 'active-scaled-press') {
                    document.documentElement.style.fontSize = '20px';
                    document.documentElement.style.setProperty('--mantine-scale', '1.5');
                }
                if (mode === 'detached-dispatch-label') {
                    button.style.cssText = 'width:125px;height:24px';
                    button.innerHTML = '<span id="retry-label">Repeat simulation</span>';
                    // The browser retains the button in its native event path
                    // after an earlier public handler detaches the hit label.
                    document.addEventListener('click', (event) => {
                        if (event.target !== button && button.contains(event.target)) event.target.remove();
                    }, true);
                }
                if (mode === 'retargeted-dispatch-region') button.addEventListener('pointerdown', (event) => button.parentElement.setPointerCapture(event.pointerId));
                if (mode === 'dispatch-focus-transfer') document.addEventListener('pointerdown', () => result.focus(), true);
                button.addEventListener('mouseover', () => {
                    if (mode === 'transient-hit' && !window.overlayShown) {
                        window.overlayShown = true;
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                        document.body.append(overlay);
                        setTimeout(() => overlay.remove(), 180);
                    } else if (mode === 'lost-focus') result.focus();
                    else if (mode === 'changed-hit') {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                        document.body.append(overlay);
                    } else if (mode === 'changed-node') {
                        button.replaceWith(button.cloneNode(true));
                    } else if (mode === 'disabled') button.disabled = true;
                    else if (mode.startsWith('moving')) {
                        // A portal/terminal transition can move the same live
                        // control between its initial capture and native press.
                        const animated = ['moving-parent', 'moving-deferred-parent'].includes(mode) ? button.parentElement : button;
                        if (mode === 'moving-deferred-parent') {
                            // Layout can commit on the next frame after hover;
                            // capture must settle that frame before native press.
                            requestAnimationFrame(() => requestAnimationFrame(() => { animated.style.transform = 'translateX(260px)'; }));
                            return;
                        }
                        animated.style.transform = 'translateX(260px)';
                        const animation = animated.animate([{transform:'translateX(180px)'}, {transform:'translateX(260px)'}], {duration:180});
                        if (mode === 'moving-obstructed') animation.finished.then(() => {
                            const overlay = document.createElement('div');
                            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                            document.body.append(overlay);
                        });
                    }
                });
                const activationRegion = mode === 'retargeted-dispatch-region' ? button.parentElement : button;
                activationRegion.addEventListener('click', async (event) => {
                    if (!event.isTrusted) return;
                    window.activations.push({trusted:event.isTrusted, controlId:button.id});
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
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const port = await waitForPort();
        cdp = await connectP805Devtools(`http://127.0.0.1:${port}`);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:390, height:844, mobile:true, deviceScaleFactor:1});
        await cdp.send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/navigation-readiness`});
        await poll(() => evaluate("typeof window.renderContext === 'function' && document.readyState === 'complete'"));
        const navigationReady = () => observeP805NavigationReadiness(evaluate, "gameModel");
        assert.equal(await navigationReady(), false, "the imported route and shell cannot authorize drawer capture");
        await evaluate("window.mountTarget(); void window.beginContext()");
        await poll(() => pendingContext);
        assert.equal(await navigationReady(), false, "an off-canvas target cannot replace terminal context");
        pendingContext.end('"loaded","projectRoot":"source"}');
        await poll(() => evaluate("window.context?.status === 'loaded'"));
        assert.equal(await navigationReady(), false, "completed context bytes cannot replace their rendered terminal state");
        await evaluate("window.renderContext()");
        assert.deepEqual(await navigationReady(), {controlId:"project-tab:gameModel", currentRoute:"#/project/source/overview", terminal:"rendered"});
        await evaluate("document.getElementById('project-tab:gameModel').disabled = true");
        assert.equal(await navigationReady(), false, "a disabled dependent tab cannot authorize capture");
        await evaluate("document.getElementById('project-tab:gameModel').disabled = false; document.getElementById('navigation-result').hidden = true");
        assert.equal(await navigationReady(), false, "a hidden terminal cannot authorize capture");
        await evaluate("document.getElementById('navigation-result').hidden = false");
        assert.equal(await evaluate("window.initialBurger.isConnected"), false);
        const disclosure = await clickP805CapturedControl(cdp, evaluate, "studio-navigation-toggle", true, true, false);
        assert.equal(disclosure.preDispatchFocus.native, true);
        assert.equal(disclosure.hitTest.matchesCapturedControl, true);
        assert.equal(disclosure.dispatch.focus.targetMatchesCapturedControl, true);
        assert.deepEqual(await evaluate("window.drawerActivation"), {trusted:true, controlId:"studio-navigation-toggle"});
        await evaluate("document.getElementById('navigation-result').setAttribute('data-pokie-lifecycle-route', 'simulation')");
        assert.equal(await navigationReady(), false, "another route's terminal cannot release capture");
        // Exercise the shared native input/activation boundary at each
        // assigned viewport, including the narrow drawer's bottom control.
        await evaluate(`(()=>{
            document.body.insertAdjacentHTML('beforeend','<textarea id="replay-artifact-json"></textarea><button id="replay-artifact-load" disabled>Validate &amp; load</button>');
            const field=document.getElementById('replay-artifact-json'),load=document.getElementById('replay-artifact-load');
            field.addEventListener('input',(event)=>{window.artifactInputTrusted=event.isTrusted;load.disabled=!field.value.trim();});
            load.addEventListener('click',(event)=>{window.artifactActivation={trusted:event.isTrusted,body:field.value};});
        })()`);
        for (const [width,height] of [[1440,900],[960,800],[390,844]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width,height,mobile:width===390,deviceScaleFactor:1});
            const text=JSON.stringify({round:1,seed:'viewport-'+width},null,2);
            await setP805ReplayArtifactInput(cdp,evaluate,text);
            const activation=await clickP805CapturedControl(cdp,evaluate,"replay-artifact-load",true,true);
            assert.equal(activation.hitTest.matchesCapturedControl,true);
            assert.equal(await evaluate("window.artifactInputTrusted"),true);
            assert.deepEqual(await evaluate("window.artifactActivation"),{trusted:true,body:text});
            await evaluate("document.getElementById('replay-artifact-load').focus({preventScroll:true})");
            const keyboard=await activateP805KeyboardControl(cdp,evaluate,"replay-artifact-load");
            assert.equal(keyboard.dispatch.focus.trusted,true);
            assert.equal(keyboard.dispatch.keyDownCount,1);
            assert.equal(keyboard.dispatch.keyUpCount,1);
            assert.deepEqual(await evaluate("({width:innerWidth,height:innerHeight})"),{width,height});
        }
        // Trace the retained finding's actual Open control shape at the
        // assigned narrow viewport, with smooth page scrolling, a table reflow
        // outside the button's ancestors and native focus transfer at press.
        const importedLocation = '/games/Bounded reel editor.json';
        const importedControlId = 'project-open:' + importedLocation;
        await evaluate(`(()=>{
            const panel=document.createElement('section');panel.tabIndex=-1;
            const button=document.createElement('button');button.id=${JSON.stringify(importedControlId)};
            button.dataset.pokieProjectLocation=${JSON.stringify(importedLocation)};
            button.innerHTML='<span>Open</span>';
            const spacer=document.createElement('div');spacer.style.height='1800px';
            const table=document.createElement('table'),cell=table.insertRow().insertCell();cell.append(button);
            table.style.marginLeft='220px';
            panel.append(spacer,table);document.body.append(panel);
            document.documentElement.style.scrollBehavior='smooth';
            button.addEventListener('mouseover',()=>{
                // This layout change has no Web Animation on the button or
                // its ancestors. It must settle before the captured press.
                let frames=3;
                const reflow=()=>{if(--frames===0)spacer.style.height='1720px';else requestAnimationFrame(reflow);};
                requestAnimationFrame(reflow);
            },{once:true});
            window.importedOpenActivations=[];
            document.addEventListener('pointerdown',(event)=>{if(button.contains(event.target))panel.focus({preventScroll:true});},true);
            button.addEventListener('click',(event)=>{
                window.importedOpenActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                location.hash='#/project/imported/overview';button.remove();
            });
        })()`);
        // Mobile focus/scroll can pan the visual viewport independently of
        // the layout viewport. CDP consumes visual coordinates, while native
        // event.clientY and getBoundingClientRect retain layout coordinates.
        await cdp.send("Emulation.setPageScaleFactor", {pageScaleFactor:2});
        const importedMouseCommands = [];
        const importedOpen = await clickP805CapturedControl({send:async (method, params) => {
            if (method === "Input.dispatchMouseEvent") importedMouseCommands.push(params);
            return cdp.send(method, params);
        }}, evaluate, importedControlId, true, true, true, true);
        const acceptedOpenBytes = JSON.stringify(importedOpen);
        const importedActivation = {kind:"pointer", count:1, controlId:importedControlId, ...importedOpen};
        assert.equal(hasP805NativeActivation(importedActivation, importedControlId), true);
        assert.equal(importedOpen.dispatch.bindingVersion, 2);
        assert.equal(importedOpen.hitTest.visualViewport.scale, 2);
        assert.ok(importedOpen.hitTest.visualViewport.offsetLeft > 0);
        assert.ok(importedOpen.hitTest.visualViewport.offsetTop > 0);
        assert.equal(importedOpen.dispatchPoint.x, importedOpen.x - importedOpen.hitTest.visualViewport.offsetLeft);
        assert.equal(importedOpen.dispatchPoint.y, importedOpen.y - importedOpen.hitTest.visualViewport.offsetTop);
        for (const command of importedMouseCommands.slice(-3)) {
            assert.equal(command.x, importedOpen.dispatchPoint.x);
            assert.equal(command.y, importedOpen.dispatchPoint.y);
        }
        assert.deepEqual(importedMouseCommands.slice(-3).map((command) => command.type), ["mouseMoved", "mousePressed", "mouseReleased"]);
        for (const binding of importedOpen.dispatch.eventBindings) {
            assert.equal(binding.pointMatchesMeasured, true);
            assert.equal(binding.viewportMatchesMeasured, true);
            assert.deepEqual(binding.visualViewport, importedOpen.hitTest.visualViewport);
            assert.ok(Math.abs(binding.x - importedOpen.x) < 1);
            assert.ok(Math.abs(binding.y - importedOpen.y) < 1);
        }
        for (const corrupt of [
            (value) => { value.dispatchPoint.y += 1; },
            (value) => { delete value.dispatchPoint; },
            (value) => { value.hitTest.visualViewport.offsetLeft += 1; },
            (value) => { value.dispatch.eventBindings[0].visualViewport.offsetTop += 1; },
            (value) => { value.dispatch.eventBindings[1].visualViewport.scale += 1; },
            (value) => { value.dispatch.eventBindings[2].viewportMatchesMeasured = false; },
            (value) => { delete value.dispatch.eventBindings[0].visualViewport; },
            (value) => { delete value.dispatchPoint; delete value.hitTest.visualViewport; },
        ]) {
            const invalid = structuredClone(importedActivation);
            corrupt(invalid);
            assert.equal(hasP805NativeActivation(invalid, importedControlId), false, "visual coordinate receipts require the measured origin and native event bindings");
        }
        const legacyActivation = structuredClone(importedActivation);
        legacyActivation.dispatch.bindingVersion = 1;
        delete legacyActivation.dispatchPoint;
        delete legacyActivation.hitTest.visualViewport;
        for (const binding of legacyActivation.dispatch.eventBindings) {
            delete binding.visualViewport;
            delete binding.viewportMatchesMeasured;
        }
        assert.equal(hasP805NativeActivation(legacyActivation, importedControlId), true, "accepted layout-coordinate receipts remain readable without rewriting history");
        assert.equal(importedOpen.capturedControlId, importedControlId);
        assert.equal(importedOpen.preDispatchFocus.native, true);
        assert.equal(importedOpen.hitTest.matchesCapturedControl, true);
        assert.equal(importedOpen.dispatch.focus.atDispatchNative, false);
        assert.equal(importedOpen.dispatch.targetsMatchCapturedControl, true);
        assert.deepEqual([importedOpen.dispatch.pointerDownCount, importedOpen.dispatch.pointerUpCount, importedOpen.dispatch.clickCount], [1,1,1]);
        assert.deepEqual(await evaluate("window.importedOpenActivations"), [{trusted:true, controlId:importedControlId}]);
        assert.equal(await evaluate("location.hash"), '#/project/imported/overview');
        await evaluate("document.documentElement.style.scrollBehavior='auto'");
        await cdp.send("Emulation.setPageScaleFactor", {pageScaleFactor:1});
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        for (const mode of ["retained", "replaced", "removed", "moving", "moving-parent", "moving-deferred-parent", "moving-replaced", "transient-hit", "confirmation-pointer", "dispatch-focus-transfer", "detached-dispatch-label", "retargeted-dispatch-region", "active-press", "active-scaled-press", "moving-obstructed", "changed-hit", "changed-node", "disabled", "lost-focus", "late-overlay", "late-replacement", "late-layout-shift", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events", "dispatch-failed"]) {
            const url = `http://127.0.0.1:${server.address().port}/?mode=${mode}`;
            await cdp.send("Page.navigate", {url});
            await poll(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && typeof window.renderTerminal === 'function'`));
            // Move off the control before capture, so its hover handler executes
            // only at the production helper's capture-to-dispatch boundary.
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:400, y:300, pointerType:"mouse"});
            const cursor = cdp.events.length;
            const dispatcher = {
                send: async (method, params) => {
                    if (method === "Input.dispatchMouseEvent" && params.type === "mousePressed") {
                        if (mode === "dispatch-failed") throw new Error("native pointer dispatch rejected");
                        // Mutate after the last measured boundary, so a stale
                        // snapshot or a same-id replacement cannot be accepted.
                        if (mode === "late-overlay") await evaluate("document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;inset:0;z-index:1000\"></div>')");
                        if (mode === "late-replacement") await evaluate("document.getElementById('simulation-retry').replaceWith(document.getElementById('simulation-retry').cloneNode(true))");
                        if (mode === "late-layout-shift") await evaluate("document.getElementById('simulation-retry').style.marginTop='2px'");
                        if (mode === "late-transform-shift") await evaluate("document.getElementById('simulation-retry').style.transform='translateY(2px)'");
                        if (mode === "late-feedback-scale") await evaluate("document.documentElement.style.setProperty('--mantine-scale','2')");
                        if (mode === "synthetic-events") await evaluate(`(()=>{
                            const item=document.getElementById('simulation-retry');
                            for(const type of ['pointerdown','pointerup','click'])item.dispatchEvent(new PointerEvent(type,{bubbles:true,composed:true,clientX:${params.x},clientY:${params.y}}));
                        })()`);
                        if (mode === "stale-coordinate") return cdp.send(method, {...params, x:400, y:300});
                    }
                    const result = await cdp.send(method, params);
                    if (mode === "duplicate-activation" && method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") {
                        await cdp.send(method, {...params, type:"mousePressed", buttons:1});
                        await cdp.send(method, params);
                    }
                    return result;
                },
            };
            // Confirmations use the helper's simpler native pointer options;
            // preserve that sibling caller as well as the Retry configuration.
            const fullPointerState = mode !== "confirmation-pointer";
            const click = () => clickP805CapturedControl(dispatcher, evaluate, "simulation-retry", fullPointerState, fullPointerState, fullPointerState, true);
            if (["moving-obstructed", "changed-hit", "changed-node", "disabled", "lost-focus", "late-overlay", "late-replacement", "late-layout-shift", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events", "dispatch-failed"].includes(mode)) {
                const afterMeasurement = ["late-overlay", "late-replacement", "late-layout-shift", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events"].includes(mode);
                await assert.rejects(click(), mode === "dispatch-failed" ? /native pointer dispatch rejected/ : afterMeasurement ? /lost native focus or its captured hit target at pointer dispatch/ : /changed its captured identity, native focus, or hit target/);
                const expectedActivations = mode === "duplicate-activation" ? 2 : ["synthetic-events", "late-layout-shift", "late-transform-shift", "late-feedback-scale"].includes(mode) ? 1 : 0;
                assert.deepEqual(await evaluate("window.activations"), Array.from({length:expectedActivations}, () => ({trusted:true, controlId:"simulation-retry"})));
                assert.equal(JSON.stringify(importedOpen), acceptedOpenBytes, "a later rejected tuple cannot alter an accepted capture");
                assert.equal(cdp.events.slice(cursor).filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.method === "POST").length, expectedActivations);
                assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"), [0, 0]);
                continue;
            }
            const pointer = {kind:"pointer", count:1, controlId:"simulation-retry", ...await click()};
            assert.equal(hasP805NativeActivation(pointer, "simulation-retry"), true);
            assert.deepEqual(pointer.dispatch.eventBindings.map((event) => event.eventType), ["pointerdown", "pointerup", "click"]);
            for (const binding of pointer.dispatch.eventBindings) {
                assert.equal(binding.captureKey, pointer.captureKey);
                assert.equal(binding.capturedControlId, pointer.capturedControlId);
                assert.equal(binding.pointMatchesMeasured, true);
                const activePress = mode.startsWith("active-") && binding.eventType === "pointerdown";
                assert.equal(binding.regionMatchesMeasured, !activePress);
                assert.equal(binding.regionMatchesCapturedPress, activePress);
                assert.equal(binding.hitMatchesCapturedControl, true);
                assert.ok(binding.pathContainsCapturedControl || binding.dispatchRegionAncestor);
                if (!binding.pathContainsCapturedControl) assert.equal(binding.relationship, "captured-dispatch-region");
            }
            if (mode.startsWith("active-")) {
                const translateY = mode === "active-scaled-press" ? 1.875 : 1;
                assert.deepEqual(pointer.hitTest.pressFeedback, {kind:"mantine-active-translation", translateY});
                const binding = pointer.dispatch.eventBindings[0];
                assert.equal(binding.pressFeedback.active, true);
                assert.deepEqual(binding.pressFeedback.matrix, [1, 0, 0, 1, 0, translateY]);
                assert.equal(binding.region.top, pointer.hitTest.region.top + translateY);
                for (const corrupt of [
                    (value) => { value.dispatch.eventBindings[0].regionMatchesCapturedPress = false; },
                    (value) => { delete value.dispatch.eventBindings[0].pressFeedback; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.active = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.classRetained = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.inlineTransformUnchanged = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.is2D = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.matrix[5] += 1; },
                    (value) => { value.dispatch.eventBindings[0].region.top += 1; },
                    (value) => { value.dispatch.eventBindings[0].region.width += 1; },
                    (value) => { value.hitTest.pressFeedback.translateY += 1; },
                    (value) => { delete value.hitTest.pressFeedback; },
                ]) {
                    const invalid = structuredClone(pointer);
                    corrupt(invalid);
                    assert.equal(hasP805NativeActivation(invalid, "simulation-retry"), false, "press feedback requires its captured style and live region proof");
                }
            }
            if (mode === "detached-dispatch-label") {
                assert.equal(pointer.dispatch.eventBindings[2].targetId, "retry-label");
                assert.equal(pointer.dispatch.eventBindings[2].directTargetMatchesCapturedControl, false);
                assert.equal(pointer.dispatch.eventBindings[2].relationship, "captured-dispatch-path");
                assert.equal(pointer.dispatch.eventBindings[0].capturedControlConnected, true);
                assert.equal(pointer.dispatch.eventBindings[0].enabled, true);
                assert.equal(pointer.hitTest.targetId, "retry-label");
            }
            if (mode === "retargeted-dispatch-region") {
                assert.deepEqual(pointer.dispatch.eventBindings.map((event) => event.relationship), ["captured-control", "captured-dispatch-region", "captured-dispatch-region"]);
                assert.equal(pointer.dispatch.eventBindings[1].directTargetMatchesCapturedControl, false);
                assert.equal(pointer.dispatch.eventBindings[1].dispatchRegionAncestor, true);
            }
            assert.equal(pointer.hitTest.x, pointer.x);
            assert.equal(pointer.hitTest.y, pointer.y);
            assert.equal(pointer.preDispatchFocus.native, true);
            assert.equal(pointer.hitTest.matchesCapturedControl, true);
            assert.equal(pointer.dispatch.focus.native, true);
            assert.equal(pointer.dispatch.focus.observedAt, "pre-dispatch");
            assert.equal(pointer.dispatch.focus.atDispatchNative, mode !== "dispatch-focus-transfer");
            assert.equal(pointer.dispatch.pointerDownCount, 1);
            assert.equal(pointer.dispatch.pointerUpCount, 1);
            assert.equal(pointer.dispatch.clickCount, 1);
            assert.equal(pointer.dispatch.eventsTrusted, true);
            assert.equal(pointer.dispatch.targetsMatchCapturedControl, true);
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
            const transaction = {confirmation:{required:false, state:"not-required"}, operation:"simulation-retry", stateClass:"recovery-operation", control:{stableControlId:"simulation-retry"}, pointerActivations:[pointer], keyboardActivations:[], requestCount:1, request:{browserRequestId, method:"POST", path:"/api/project/simulations"}, terminal:{...receipt, causedByRequestId:browserRequestId}};
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "the network terminal cannot replace a rendered result");
            await evaluate("window.renderTerminal('unrelated-job')");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "an unrelated rendered job cannot release this receipt");
            await evaluate("window.renderTerminal(); document.getElementById('simulation-results').hidden = true");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "a hidden terminal cannot replace the visible result");
            await evaluate("document.getElementById('simulation-results').hidden = false; document.getElementById('simulation-results').focus()");
            transaction.postTransitionRenderedState = await observeP805PointerTerminal(evaluate, transaction, receipt);
            const expectedControlState = ["moving", "moving-parent", "moving-deferred-parent", "transient-hit", "confirmation-pointer", "dispatch-focus-transfer", "detached-dispatch-label", "retargeted-dispatch-region", "active-press", "active-scaled-press"].includes(mode) ? "retained" : mode === "moving-replaced" ? "replaced" : mode;
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
                ...["pointMatchesMeasured", "hitMatchesCapturedControl", "capturedControlConnected", "identityPreserved", "enabled", "pathContainsCapturedControl", "trusted"].map((field) => (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0][field] = false; }),
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].regionMatchesMeasured = false; value.transaction.pointerActivations[0].dispatch.eventBindings[0].regionMatchesCapturedPress = false; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].captureKey = "another-capture"; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].relationship = "overlay"; },
                (value) => { value.transaction.pointerActivations[0].dispatch.clickCount = 2; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings = null; },
                (value) => { delete value.transaction.pointerActivations[0].dispatch.eventBindings; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].x += 100; },
                (value) => { value.transaction.pointerActivations[0].hitTest.x += 100; },
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
        // Fourteen accepted paths and six native clicks from deliberately
        // rejected dispatches (duplicate, synthetic, and three late changes).
        assert.equal(requests.filter(({method, path}) => method === "POST" && path === "/api/project/simulations").length, 20);
    } finally {
        pendingContext?.end();
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
});
