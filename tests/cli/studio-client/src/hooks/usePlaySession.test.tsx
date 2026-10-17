import {act, fireEvent, render, renderHook, screen, waitFor} from "@testing-library/react";
import {MantineProvider} from "@mantine/core";
import {StrictMode, type ReactNode} from "react";
import {webcrypto} from "node:crypto";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import type {StudioRuntimeSessionView} from "../../../../../cli/studio-client/src/api/types";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {usePlaySession} from "../../../../../cli/studio-client/src/hooks/usePlaySession";
import {PlayTab} from "../../../../../cli/studio-client/src/components/project/PlayTab";
import {createCanonicalWasmFixture} from "../../../../fixtures/wasm/createCanonicalWasmFixture";
import {instantiatePokieWasm, SeededPokieWasmHost} from "../../../../../src/wasm/PokieWasmRuntime";
import {projectPokieWasmRoundArtifact} from "../../../../../src/wasm/projectPokieWasmRoundArtifact";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import path from "path";
import os from "os";
import {BrowserWasmStudioApi} from "../../../../../cli/studio-client/src/wasm/BrowserWasmStudioApi";
import {StudioWasmBrowserService} from "../../../../../cli/studio/wasm/StudioWasmBrowserService";
import {StudioJobService} from "../../../../../cli/studio/jobs/StudioJobService";
import {FileStudioJobRepository} from "../../../../../cli/studio/jobs/FileStudioJobRepository";
import {StudioRoundRecorder} from "../../../../../cli/studio/runtime/StudioRoundRecorder";
import {PokieWasmWorkerProtocol, type PokieWasmWorkerRequest} from "../../../../../src/wasm/worker";
import {renderRoutedApp} from "../testUtils/renderRoutedApp";
import {createRoutedFakeFetch} from "../testUtils/fakeFetch";

const GAME = {id: "fixture-slot", name: "Fixture Slot", version: "1.0.0"};

function session(sessionId: string, overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
    return {sessionId, game: GAME, credits: 1000, bet: 1, ...overrides};
}

function strictModeWrapper(fetchImpl: FetchLike) {
    return function Wrapper({children}: {children: ReactNode}) {
        return <StrictMode><StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider></StrictMode>;
    };
}

it.each(["error", "messageerror"])("V2C-22-WORKER-RETRY recovers the rendered browser-play %s through a fresh admitted session", async failure => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-rendered-retry-"));
    const file = path.join(directory, "game.wasm");
    const fixture = createCanonicalWasmFixture({id: GAME.id});
    fs.writeFileSync(file, fixture.bytes);
    fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    const subtle = Reflect.getOwnPropertyDescriptor(globalThis.crypto, "subtle");
    Reflect.defineProperty(globalThis.crypto, "subtle", {configurable: true, value: webcrypto.subtle});
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const recorder = new StudioRoundRecorder();
    const broker = new StudioWasmBrowserService(jobs, recorder);
    const context = {mode: "project" as const, projectRoot: file};
    const {fetchImpl} = createRoutedFakeFetch({
        "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: file, game: GAME, type: "wasm", capabilities: ["wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.runtime.replay"]}}),
        "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: file, valid: true}}),
        "/api/project/validate": () => ({ok: true, status: 200, body: {packageRoot: file, valid: true, game: GAME, errors: [], warnings: [], suggestions: []}}),
        "/api/project/jobs": () => ({ok: true, status: 200, body: {jobs: jobs.list()}}),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        "/api/project/rounds": () => ({ok: true, status: 200, body: []}),
        "/api/project/symbol-artwork": () => ({ok: true, status: 200, body: {artwork: {}}}),
    });
    let fault = true;
    let created = 0;
    let terminated = 0;
    const dispatches: Promise<unknown>[] = [];
    const owner = new BrowserWasmStudioApi(async (url, init) => {
        if (!url.startsWith("/api/project/wasm/")) return fetchImpl(url, init);
        const result = await broker.handle(init?.method ?? "GET", url, init?.body ? JSON.parse(init.body) : undefined, context, () => true);
        return {ok: result.status < 300, status: result.status, json: () => Promise.resolve(result.body)};
    }, () => {
        created++;
        const protocol = new PokieWasmWorkerProtocol();
        type WorkerListener = (event: MessageEvent & ErrorEvent) => void;
        const listeners = new Map<string, WorkerListener>();
        let disposed = false;
        return {
            addEventListener: (type, listener) => {
                listeners.set(type, listener);
            },
            removeEventListener: type => {
                listeners.delete(type);
            },
            postMessage: data => {
                if (fault) {
                    // Fail the actual production transport request, rather than reject a checkpoint.
                    listeners.get(failure)?.({message: "Injected Worker load failure"} as MessageEvent & ErrorEvent);
                    return;
                }
                const message = data as {scope: unknown; request: PokieWasmWorkerRequest};
                dispatches.push(protocol.handle(message.request).then(result => {
                    if (!disposed) listeners.get("message")?.({data: {...result, scope: message.scope, type: "response"}} as MessageEvent & ErrorEvent);
                }));
            },
            terminate: () => {
                if (disposed) return;
                disposed = true;
                terminated++;
                dispatches.push(protocol.handle({id: "cleanup", type: "dispose"}));
            },
        };
    });
    let view: ReturnType<typeof renderRoutedApp> | undefined;
    let reference: Awaited<ReturnType<typeof instantiatePokieWasm>> | undefined;
    try {
        const user = userEvent.setup();
        view = renderRoutedApp({fetchImpl: owner.fetch, initialEntries: [`/project/${encodeURIComponent(file)}/play`], strictMode: true});
        await user.click(await screen.findByRole("button", {name: "New Play session"}));
        const retry = await screen.findByRole("button", {name: "Retry"});
        const failed = jobs.list().find(job => job.operation === "browser-play");
        expect(failed).toMatchObject({status: "failed", request: {action: "new"}, recovery: {action: "retry"}});
        expect(created).toBe(1);
        expect(terminated).toBe(1);
        expect(recorder.list()).toHaveLength(0);
        fault = false;
        await user.click(retry);
        await screen.findByRole("button", {name: "Spin"});
        expect(view.router.state.location.pathname).toMatch(/\/play$/);
        expect(screen.queryByText(/isn't available for this project/)).not.toBeInTheDocument();
        expect(created).toBe(2);
        const recovered = jobs.list().find(job => job.id !== failed?.id);
        expect(recovered).toMatchObject({operation: "browser-play", status: "completed", request: {action: "new"}});
        expect(jobs.list()).toHaveLength(2);
        expect(jobs.list().find(job => job.id === failed?.id)).toEqual(failed);
        expect(recorder.list()).toHaveLength(0);
        reference = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost(String(recovered!.request.seed)));
        const session = reference.createSession(String(recovered!.request.seed));
        for (let round = 1; round <= 2; round++) {
            const expected = await session.play({bet: 1});
            await user.click(screen.getByRole("button", {name: "Spin"}));
            await waitFor(() => expect(recorder.list()).toHaveLength(round));
            await waitFor(() => expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled());
            const accepted = jobs.list().find(job => job.request.action === "spin" && job.result?.detail?.session);
            expect(accepted?.result?.detail?.session).toMatchObject({credits: expected.credits, win: expected.payout, screen: expected.screen, debug: {stateAfter: session.serialize()}});
        }
        expect(created).toBe(2);
        expect(terminated).toBe(1);
        session.dispose();
        // V2C-22-REPLACEMENT-PLAY-SELECTION: follow Retry through actual replacement spins.
        const modes = createCanonicalWasmFixture({blueprint: {manifest: GAME, reels: 2, rows: 1, symbols: ["A", "B"],
            reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1], paytable: {A: {2: 0}},
            betModes: [{id: "base", runtimeType: "base", isDefault: true}]}});
        fs.writeFileSync(file, modes.bytes);
        fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(modes.manifest));
        await user.click(screen.getByRole("button", {name: "Reset Play session"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Select mode base"})).toBeVisible());
        const replacement = createCanonicalWasmFixture({availableBets: [7.5], capabilities: ["runtime.play", "runtime.replay"]});
        fs.writeFileSync(file, replacement.bytes);
        fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(replacement.manifest));
        await user.click(screen.getByRole("button", {name: "Reset Play session"}));
        await waitFor(() => {
            expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled();
            expect(screen.queryByRole("button", {name: "Select mode base"})).toBeNull();
        });
        for (let round = 3; round <= 4; round++) {
            await user.click(screen.getByRole("button", {name: "Spin"}));
            await waitFor(() => expect(recorder.list()).toHaveLength(round));
            await waitFor(() => expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled());
            const accepted = jobs.list().find(job => job.request.action === "spin");
            expect(accepted).toMatchObject({status: "completed", request: {artifactIdentity: replacement.manifest.artifact!.sha256, command: {bet: 7.5}}});
            expect(accepted!.request.command).not.toHaveProperty("mode");
        }
    } finally {
        view?.unmount();
        owner.dispose();
        await broker.shutdown();
        await Promise.all(dispatches);
        reference?.dispose();
        fs.rmSync(directory, {recursive: true, force: true});
        if (subtle) Reflect.defineProperty(globalThis.crypto, "subtle", subtle);
        else Reflect.deleteProperty(globalThis.crypto, "subtle");
    }
    expect(terminated).toBe(created);
});

it.each([true, false])("V2C-22-BET-COMMITMENT renders the exact selection before and after ordered fractional plays with artifact.inspect=%s", async inspect => {
    const bets = [0.05, 7.5, 1e-7];
    const fixture = createCanonicalWasmFixture({id: GAME.id, availableBets: bets,
        reelStrips: [["A", "B", "C"], ["A", "B", "C"], ["A", "B", "C"]], paytable: {A: {3: 5}, B: {3: 0}},
        capabilities: ["runtime.play", "runtime.serialize", ...(inspect ? ["artifact.inspect"] : [])]});
    // jsdom supplies crypto without SubtleCrypto. Use Node's real implementation
    // for the portable loader's integrity check, then restore the browser test global.
    const subtle = Reflect.getOwnPropertyDescriptor(globalThis.crypto, "subtle");
    Reflect.defineProperty(globalThis.crypto, "subtle", {configurable: true, value: webcrypto.subtle});
    let runtime: Awaited<ReturnType<typeof instantiatePokieWasm>>;
    try {
        runtime = await instantiatePokieWasm(fixture.bytes, fixture.manifest, new SeededPokieWasmHost("0"));
    } finally {
        if (subtle) Reflect.defineProperty(globalThis.crypto, "subtle", subtle);
        else Reflect.deleteProperty(globalThis.crypto, "subtle");
    }
    const native = runtime.createSession("0");
    const requests: Record<string, unknown>[] = [];
    let publish: (() => void) | undefined;
    let current: ReturnType<typeof usePlaySession>;
    const fetchImpl: FetchLike = async (url, init) => {
        if (url === "/api/project/symbol-artwork") return {ok: true, status: 200, json: () => Promise.resolve({artwork: {}})};
        const body = JSON.parse(init?.body ?? "{}");
        if (url === "/api/project/play/session") {
            expect(body).toEqual({seed: "0"});
            // Ordinary Worker initial data supplies choices but no selected bet.
            return {ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {bet: undefined, availableBets: bets})})};
        }
        expect(url).toBe("/api/project/play/sessions/stable/spin");
        requests.push(body);
        const before = native.serialize();
        const round = await native.play({bet: body.bet as number});
        const accepted = session("stable", {availableBets: bets, bet: round.stake, credits: round.credits, win: round.payout,
            screen: round.screen.map(reel => [...reel]), debug: {stateBefore: before, stateAfter: native.serialize(),
                ...(inspect ? {artifact: projectPokieWasmRoundArtifact(round, {game: GAME, pokieVersion: "1.3.0"}, String(requests.length))}
                    : {artifactUnavailableReason: "This artifact does not declare artifact.inspect."})}});
        // Execution/recording can finish before the browser publishes the accepted view.
        return new Promise(resolve => {
            publish = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: accepted})});
        });
    };
    function Page() {
        current = usePlaySession();
        return <PlayTab session={current.session} sessionId={current.sessionId} onNewSession={current.newSession}
            onSpin={current.spin} onFindAnyWin={current.findAnyWin} onFindSymbolWin={current.findSymbolWin}
            onFindFreeGames={current.findFreeGames} />;
    }
    const view = render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><Page /></StudioApiProvider></MantineProvider>);
    const choose = async (bet: number) => {
        const button = screen.getByRole("button", {name: `Select bet ${bet}`});
        if (button.getAttribute("aria-pressed") !== "true") fireEvent.click(button);
        await waitFor(() => {
            expect(screen.getByRole("button", {name: `Select bet ${bet}`})).toHaveAttribute("aria-pressed", "true");
            expect(view.container.querySelector(".player-bet-current")?.textContent).toBe(`Bet: ${bet}`);
        });
    };
    try {
        fireEvent.click(screen.getByRole("button", {name: /Show advanced details/}));
        fireEvent.change(screen.getByLabelText("Seed (optional)"), {target: {value: "0"}});
        fireEvent.click(screen.getByRole("button", {name: "New Play session"}));
        await screen.findByRole("button", {name: "Spin"});
        const initial = native.serialize();
        await choose(7.5);
        await choose(0.05);
        await choose(0.05); // Already-selected no-op must not execute a draw.
        expect(requests).toHaveLength(0);
        expect(native.serialize()).toEqual(initial);
        for (const [index, bet] of bets.entries()) {
            await waitFor(() => expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled());
            await choose(bet);
            fireEvent.click(screen.getByRole("button", {name: "Spin"}));
            await waitFor(() => expect(publish).toBeDefined());
            expect(screen.getByRole("button", {name: "Spin"})).toBeDisabled();
            expect(requests).toHaveLength(index + 1);
            expect(requests[index]).toMatchObject({bet, requestId: expect.any(String)});
            expect(native.serialize().sequence).toBe(index + 1);
            act(() => {
                publish!();
                publish = undefined;
            });
            await waitFor(() => expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled());
            expect(current!.session).toMatchObject({status: "ok", session: {bet, credits: native.serialize().credits, debug: {stateAfter: native.serialize()}}});
            await choose(bet);
        }
        expect(new Set(requests.map(body => body.requestId)).size).toBe(3);
    } finally {
        view.unmount();
        native.dispose();
        await runtime.dispose();
    }
});

describe("usePlaySession - resetForProjectSwitch", () => {
    it("discards a pending new-session response after a project switch", async () => {
        let release: (() => void) | undefined;
        const fetchImpl: FetchLike = () => new Promise((resolve) => {
            release = () => resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stale-session")})});
        });
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.newSession());
        expect(result.current.session.status).toBe("loading");
        act(() => result.current.resetForProjectSwitch());
        act(() => release?.());

        await waitFor(() => expect(result.current.session).toEqual({status: "idle"}));
        expect(result.current.sessionId).toBeUndefined();
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });

    it("discards a pending round and recorder refresh after a project switch", async () => {
        let releaseSpin: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/play/session") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("old-session")})});
            }
            if (url === "/api/project/play/sessions/old-session/spin" && init?.method === "POST") {
                return new Promise((resolve) => {
                    releaseSpin = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("old-session", {win: 25, screen: [["stale-win"]]})})});
                });
            }
            return Promise.reject(new Error(`Unexpected request ${url}`));
        };
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.newSession());
        await waitFor(() => expect(result.current.sessionId).toBe("old-session"));
        act(() => result.current.spin());
        await waitFor(() => expect(releaseSpin).toBeDefined());
        act(() => result.current.resetForProjectSwitch());
        act(() => releaseSpin?.());

        await waitFor(() => expect(result.current.session).toEqual({status: "idle"}));
        expect(result.current.sessionId).toBeUndefined();
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });
});

describe("usePlaySession - canonical runtime failures", () => {
    it.each([
        ["invalid-command", 400, "Check the command"],
        ["incompatible-state", 409, "matching game version"],
        ["corrupt-state", 409, "valid backup"],
        ["restoration-unsupported", 409, "original live runtime"],
        ["storage-error", 503, "storage availability"],
        ["recovery-required", 409, "Reconcile"],
    ])("retains the settled view and does not reset or retry %s", async (code, status, guidance) => {
        let creations = 0;
        let spins = 0;
        const settled = session("stable", {win: 3, screen: [["A"]]});
        const fetchImpl: FetchLike = url => {
            if (url === "/api/project/play/session") {
                creations++;
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: settled})});
            }
            spins++;
            return Promise.resolve({ok: false, status: Number(status), json: () => Promise.resolve({code, error: "Saved rejection"})});
        };
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.newSession());
        await waitFor(() => expect(result.current.sessionId).toBe("stable"));
        act(() => result.current.spin());
        await waitFor(() => expect(result.current.session).toMatchObject({status: "error", previousSession: settled, message: expect.stringContaining(String(guidance))}));
        expect(result.current.sessionId).toBe("stable");
        expect(creations).toBe(1);
        expect(spins).toBe(1);
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });
});

it("keeps the same entry identity after response loss and then sends the saved delivery token, not its mathematical cursor", async () => {
    const bodies: Record<string, unknown>[] = [];
    const {boundedPlayChain} = await import("../../../studio/runtime/fixtures/boundedPlayChain");
    const pending = (await boundedPlayChain("cascade-respins-collection", 26))[1].logicalRound!;
    expect(pending).toMatchObject({cursor: 2, mathematicalCursor: 1, status: "pending"});
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) return Promise.reject(new Error("Published response lost"));
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true, logicalRound: pending})})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(1, "buy", "stepwise"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(7.5, "base", "composite"));
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
    expect(bodies[1]).toEqual(bodies[0]);
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toMatchObject({delivery: "stepwise", continuation: {roundId: pending.roundId, cursor: 2}});
    expect(bodies[2]).not.toHaveProperty("bet");
    expect(bodies[2]).not.toHaveProperty("mode");
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
});

it.each(["invalid-command", "blocked"])("releases a definitively rejected %s intent so changed controls submit a fresh entry", async code => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({code, error: "Rejected selection", retryDisposition: "rejected"})});
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(0.05, "base", "composite"));
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
    expect(bodies[1]).toMatchObject({bet: 0.05, mode: "base", delivery: "composite"});
    expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
    expect(bodies[1].roundId).not.toBe(bodies[0].roundId);
});

it.each(["recovery-required", "settlement-error"])("retains the original intent after uncertain %s", async code => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: false, status: 409, json: () => Promise.resolve({code, error: "Uncertain settlement"})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(0.05, "base", "composite"));
    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(bodies[1]).toEqual(bodies[0]);
});

it("shows a committed prefix on successor error while retaining the original intent for retry", async () => {
    const bodies: Record<string, unknown>[] = [];
    const prefix = session("stable", {credits: 999, logicalRoundDeliverySupported: true});
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({code: "execution-error", error: "Successor failed", committedProgress: {roundId: "round", cursor: 1, requestId: "entry", nextRequestId: "entry:subround:1"}, session: prefix})});
    };
    const recorded = jest.fn();
    const {result} = renderHook(() => usePlaySession(recorded), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy", "composite"));
    await waitFor(() => expect(result.current.session).toMatchObject({status: "error", previousSession: prefix}));
    expect(recorded).toHaveBeenCalledTimes(1);
    act(() => result.current.spin(0.05, "base"));
    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(bodies[1]).toEqual(bodies[0]);
});

it("continues a restored pending feature using its saved public delivery cursor", async () => {
    const {boundedPlayChain} = await import("../../../studio/runtime/fixtures/boundedPlayChain");
    const logicalRound = (await boundedPlayChain("cascade-respins-collection", 26))[1].logicalRound!;
    const restored = session("restored", {logicalRoundDeliverySupported: true, logicalRound});
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url.endsWith("/restore")) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: restored})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: restored})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.restore({checkpoint: "validated by Worker"}));
    await waitFor(() => expect(result.current.sessionId).toBe("restored"));
    act(() => result.current.spin(7.5, "buy", "composite"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({requestId: expect.any(String), delivery: "composite", continuation: {roundId: logicalRound.roundId, cursor: logicalRound.cursor}});
    expect(bodies[0]).not.toHaveProperty("roundId");
    expect(bodies[0]).not.toHaveProperty("bet");
});

it("renders local JSON rejection, executed restore rejection, retained Play and explicit corrected restore through the real Play tab", async () => {
    const state = {schemaVersion: "pokie.state.v3", artifactIdentity: "sha256:original", seed: "0", sequence: 3, credits: 992.4499999, drawCount: 8, rngState: 123};
    const foreign = {...state, artifactIdentity: "foreign"};
    const settled = session("stable", {credits: state.credits, bet: 0.05, availableBets: [0.05], debug: {stateAfter: state}});
    const requests: {url: string; body: Record<string, unknown>}[] = [];
    let current: ReturnType<typeof usePlaySession>;
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/symbol-artwork") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({artwork: {}})});
        const body = JSON.parse(init?.body ?? "{}");
        requests.push({url, body});
        if (url.endsWith("/restore")) {
            if (body.state.artifactIdentity === "foreign") return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({error: "POKIE WASM state belongs to an incompatible artifact identity."})});
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: {...settled, sessionId: "restored"}})});
        }
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: settled})});
    };
    function Page() {
        current = usePlaySession();
        return <PlayTab session={current.session} sessionId={current.sessionId} onNewSession={current.newSession}
            onSpin={current.spin} onFindAnyWin={current.findAnyWin} onFindSymbolWin={current.findSymbolWin}
            onFindFreeGames={current.findFreeGames} onRestore={current.restore} />;
    }
    render(<MantineProvider><StudioApiProvider fetchImpl={fetchImpl}><Page /></StudioApiProvider></MantineProvider>);
    fireEvent.click(screen.getByRole("button", {name: "New Play session"}));
    await screen.findByRole("button", {name: "Reset Play session"});
    const input = screen.getByLabelText("JSON checkpoint");
    fireEvent.change(input, {target: {value: "{"}});
    fireEvent.click(screen.getByRole("button", {name: "Restore checkpoint"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Supply valid checkpoint JSON");
    expect(requests).toHaveLength(1);
    expect(current!.sessionId).toBe("stable");
    fireEvent.change(input, {target: {value: JSON.stringify(foreign)}});
    fireEvent.click(screen.getByRole("button", {name: "Restore checkpoint"}));
    expect(screen.getByRole("button", {name: "Restore checkpoint"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Spin"})).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Checkpoint restore failed. Supply a valid checkpoint from this WASM artifact and matching version"));
    expect(screen.getByRole("alert")).toHaveTextContent("incompatible artifact identity");
    expect(current!.sessionId).toBe("stable");
    expect(current!.session).toMatchObject({status: "error", subject: "Checkpoint restore", previousSession: settled});
    expect(requests[1]).toEqual({url: "/api/project/play/session/restore", body: {state: foreign}});
    for (let index = 0; index < 2; index++) {
        fireEvent.click(screen.getByRole("button", {name: "Spin"}));
        await waitFor(() => expect(current!.session.status).toBe("ok"));
        expect(requests.at(-1)?.url).toBe("/api/project/play/sessions/stable/spin");
    }
    fireEvent.click(screen.getByRole("button", {name: "Copy current checkpoint to input"}));
    expect(input).toHaveValue(JSON.stringify(state));
    fireEvent.click(screen.getByRole("button", {name: "Restore checkpoint"}));
    await waitFor(() => expect(current!.sessionId).toBe("restored"));
    expect(requests.at(-1)).toEqual({url: "/api/project/play/session/restore", body: {state}});
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", {name: "Spin"})).toBeEnabled();
});
