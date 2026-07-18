import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
    GameSessionHandling,
    PokieDevServer,
    PokieGame,
    PokieGameManifest,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
} from "pokie";
import type {ResolvedOutcomeLibrary} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryService.js";
import {StudioRuntimeManager} from "../../../../cli/studio/runtime/StudioRuntimeManager.js";
import type {ValidatedStartRuntimeRequest} from "../../../../cli/studio/runtime/validateStartRuntimeRequest.js";

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

function createFakeSession(): GameSessionHandling {
    let credits = 1000;
    const bet = 5;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 2 === 0 ? bet * 3 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function createFakeGame(): PokieGame {
    return {getManifest: () => manifest, createSession: () => createFakeSession()};
}

function fakeLoadGame(): () => Promise<PokieGame> {
    return () => Promise.resolve(createFakeGame());
}

function startOptions(overrides: Partial<ValidatedStartRuntimeRequest> = {}): ValidatedStartRuntimeRequest {
    return {debug: false, repositoryMode: "memory", port: 0, ...overrides};
}

// A minimal, valid single-outcome WeightedOutcomeLibrary built for exactly the fake game's own manifest
// (id/version) -- assertLibraryMatchesGameManifest checks this against provenance.game before a
// pre-generated server is ever allowed to start.
function fakeOutcomeLibrary(libraryId = "lib-handoff"): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId,
        outcomes: [
            {
                id: "0000",
                weight: 1,
                artifact: buildRoundArtifact({
                    roundId: "r0",
                    provenance: {game: manifest, pokieVersion: "1.0.0"},
                    betMode: "base",
                    stake: 1,
                    steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
                }),
            },
        ],
    });
}

function stubResolver(result: ResolvedOutcomeLibrary): () => Promise<ResolvedOutcomeLibrary> {
    return () => Promise.resolve(result);
}

describe("StudioRuntimeManager", () => {
    it("starts stopped", () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());
        expect(manager.getState()).toEqual({status: "stopped"});
    });

    it("starts a real server on an automatic (port: 0) port and reports it as running", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());

        const result = await manager.start("/fake/project", startOptions());

        expect(result.status).toBe("started");
        if (result.status !== "started") {
            return;
        }
        expect(result.view.status).toBe("running");
        if (result.view.status !== "running") {
            return;
        }
        expect(result.view.port).toBeGreaterThan(0);
        expect(result.view.host).toBe("127.0.0.1");
        expect(result.view.baseUrl).toBe(`http://${result.view.host}:${result.view.port}`);
        expect(manager.getState()).toEqual(result.view);

        await manager.stop();
    });

    it("rejects a second start while already running (conflict), without disturbing the running one", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());
        const first = await manager.start("/fake/project", startOptions());
        expect(first.status).toBe("started");
        if (first.status !== "started") {
            return;
        }

        const second = await manager.start("/fake/project", startOptions());

        expect(second.status).toBe("already-running");
        expect(manager.getState()).toEqual(first.view);

        await manager.stop();
    });

    it("stopping an already-stopped runtime is idempotent, never an error", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());

        const result = await manager.stop();

        expect(result).toEqual({status: "already-stopped"});
        expect(manager.getState()).toEqual({status: "stopped"});
    });

    it("stop() after running settles back to stopped", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());
        await manager.start("/fake/project", startOptions());

        const result = await manager.stop();

        expect(result).toEqual({status: "stopped"});
        expect(manager.getState()).toEqual({status: "stopped"});
    });

    it("restart() while running stops the old server and starts a fresh one", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());
        const started = await manager.start("/fake/project", startOptions());
        expect(started.status).toBe("started");
        const firstPort = started.status === "started" && started.view.status === "running" ? started.view.port : undefined;

        const restarted = await manager.restart("/fake/project");

        expect(restarted.status).toBe("started");
        if (restarted.status === "started" && restarted.view.status === "running") {
            expect(restarted.view.port).toBeGreaterThan(0);
            // Not necessarily a different port (both are OS-assigned), but the manager must genuinely
            // be pointing at a live server either way — proven by the session-tools calls elsewhere.
            expect(typeof firstPort).toBe("number");
        }

        await manager.stop();
    });

    it("restart() with no prior successful start and no options given fails cleanly", async () => {
        const manager = new StudioRuntimeManager(fakeLoadGame());

        const result = await manager.restart("/fake/project");

        expect(result.status).toBe("failed");
    });

    it("reports a safe 'failed' result (no stack trace) when the project fails to load", async () => {
        const manager = new StudioRuntimeManager(() => Promise.reject(new Error("not a pokie game package")));

        const result = await manager.start("/fake/project", startOptions());

        expect(result).toEqual({status: "failed", error: "not a pokie game package"});
        expect(manager.getState()).toEqual({status: "failed", error: "not a pokie game package"});
        expect(JSON.stringify(result)).not.toContain("\\n    at ");
    });

    it("reports a safe 'failed' result when the port is already in use", async () => {
        const occupied = new PokieDevServer(createFakeGame(), {host: "127.0.0.1", port: 0});
        const address = await occupied.start();

        const manager = new StudioRuntimeManager(fakeLoadGame());
        const result = await manager.start("/fake/project", startOptions({port: address.port}));

        expect(result.status).toBe("failed");
        if (result.status === "failed") {
            expect(JSON.stringify(result)).not.toContain("\\n    at ");
        }

        await occupied.stop();
    });

    describe("session tools (against the manager's own real, running server)", () => {
        async function startedManager(overrides: Partial<ValidatedStartRuntimeRequest> = {}): Promise<StudioRuntimeManager> {
            const manager = new StudioRuntimeManager(fakeLoadGame());
            await manager.start("/fake/project", startOptions(overrides));
            return manager;
        }

        it("returns not-running for create/get/spin before anything has been started", async () => {
            const manager = new StudioRuntimeManager(fakeLoadGame());

            expect(await manager.createSession()).toEqual({status: "not-running"});
            expect(await manager.getSession("does-not-matter")).toEqual({status: "not-running"});
            expect(await manager.spin("does-not-matter")).toEqual({status: "not-running"});
        });

        it("creates a session, reads it back, and spins it", async () => {
            const manager = await startedManager();

            const created = await manager.createSession();
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;
            expect(created.session.credits).toBe(1000);

            // GET always includes `win` (0 before any spin), unlike POST /sessions's own creation
            // response — same "restore" semantics PokieDevServer itself documents — so this only
            // checks the fields that are guaranteed to still match, not a full deep-equal.
            const fetched = await manager.getSession(sessionId);
            expect(fetched.status).toBe("ok");
            if (fetched.status === "ok") {
                expect(fetched.session.sessionId).toBe(sessionId);
                expect(fetched.session.credits).toBe(created.session.credits);
                expect(fetched.session.win).toBe(0);
            }

            const spun = await manager.spin(sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status === "ok") {
                expect(spun.session.sessionId).toBe(sessionId);
                expect(typeof spun.session.win).toBe("number");
            }

            await manager.stop();
        });

        it("returns not-found for an unknown sessionId on get and spin", async () => {
            const manager = await startedManager();

            expect(await manager.getSession("does-not-exist")).toEqual({status: "not-found"});
            expect(await manager.spin("does-not-exist")).toEqual({status: "not-found"});

            await manager.stop();
        });

        it("idempotent replay: repeating the same requestId returns the exact same result without spinning again", async () => {
            const manager = await startedManager();
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            const first = await manager.spin(sessionId, "request-1");
            const replay = await manager.spin(sessionId, "request-1");

            expect(replay).toEqual(first);

            await manager.stop();
        });

        it("optimistic-lock conflict: a stale client-declared expectedSessionVersion is rejected with a clear error", async () => {
            const manager = await startedManager();
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            const result = await manager.spin(sessionId, undefined, 999);

            expect(result.status).toBe("conflict");
            if (result.status === "conflict") {
                expect(result.error).toContain("999");
            }

            await manager.stop();
        });

        it("hoists sessionVersion unconditionally, but only attaches the debug bundle when debug mode is on", async () => {
            const debugOff = await startedManager({debug: false});
            const createdOff = await debugOff.createSession();
            expect(createdOff.status).toBe("ok");
            if (createdOff.status === "ok") {
                expect(typeof createdOff.session.sessionVersion).toBe("number");
                expect(createdOff.session.debug).toBeUndefined();
            }
            await debugOff.stop();

            const debugOn = await startedManager({debug: true});
            const createdOn = await debugOn.createSession();
            expect(createdOn.status).toBe("ok");
            if (createdOn.status === "ok") {
                expect(typeof createdOn.session.sessionVersion).toBe("number");
                expect(createdOn.session.debug).toBeDefined();
                expect(createdOn.session.debug?.stateAfter).toBeDefined();
            }
            await debugOn.stop();
        });

        it("records studioRequestId on a spin's own result and in recentSpins with debug mode off, unlike debug.requestId", async () => {
            const manager = await startedManager({debug: false});
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            const spun = await manager.spin(sessionId, "request-without-debug");
            expect(spun.status).toBe("ok");
            if (spun.status === "ok") {
                // Studio's own bookkeeping, present even though this runtime has debug mode off --
                // unlike debug.requestId, which only ever exists alongside the rest of the debug bundle.
                expect(spun.session.studioRequestId).toBe("request-without-debug");
                expect(spun.session.debug).toBeUndefined();
            }

            const recent = manager.listRecentSpins();
            expect(recent).toHaveLength(1);
            expect(recent[0].studioRequestId).toBe("request-without-debug");
            expect(recent[0].debug).toBeUndefined();

            await manager.stop();
        });

        it("does not record studioRequestId when a spin was made without a requestId", async () => {
            const manager = await startedManager({debug: false});
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }

            const spun = await manager.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status === "ok") {
                expect(spun.session.studioRequestId).toBeUndefined();
            }

            await manager.stop();
        });
    });

    describe("repositoryMode: file", () => {
        it("survives sessions across a restart, unlike the memory default", async () => {
            const manager = new StudioRuntimeManager(fakeLoadGame());
            await manager.start("/fake/project", startOptions({repositoryMode: "file"}));
            const created = await manager.createSession();
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            await manager.restart("/fake/project");
            const restored = await manager.getSession(sessionId);

            expect(restored.status).toBe("ok");

            await manager.stop();
        });

        it("a fresh manager (no prior file-mode start) does not reuse another manager's session directory", async () => {
            const first = new StudioRuntimeManager(fakeLoadGame());
            await first.start("/fake/project", startOptions({repositoryMode: "file"}));
            const created = await first.createSession();
            const sessionId = created.status === "ok" ? created.session.sessionId : "unused";
            await first.stop();

            const second = new StudioRuntimeManager(fakeLoadGame());
            await second.start("/fake/project", startOptions({repositoryMode: "file"}));
            const fetched = await second.getSession(sessionId);

            expect(fetched).toEqual({status: "not-found"});

            await second.stop();
        });
    });

    describe("project switch / shutdown", () => {
        it("stopForProjectSwitch() stops a running server and clears its configuration", async () => {
            const manager = new StudioRuntimeManager(fakeLoadGame());
            await manager.start("/fake/project", startOptions({debug: true}));

            await manager.stopForProjectSwitch();

            expect(manager.getState()).toEqual({status: "stopped"});
            // The debug flag/last options were reset too — a bare restart (no options) now fails
            // cleanly instead of silently reusing the previous project's configuration.
            const restarted = await manager.restart("/fake/project");
            expect(restarted.status).toBe("failed");
        });

        it("stopForShutdown() stops a running server", async () => {
            const manager = new StudioRuntimeManager(fakeLoadGame());
            await manager.start("/fake/project", startOptions());

            await manager.stopForShutdown();

            expect(manager.getState()).toEqual({status: "stopped"});
        });

        it("stopForProjectSwitch()/stopForShutdown() are safe no-ops when nothing is running", async () => {
            const manager = new StudioRuntimeManager(fakeLoadGame());

            await expect(manager.stopForProjectSwitch()).resolves.toBeUndefined();
            await expect(manager.stopForShutdown()).resolves.toBeUndefined();
            expect(manager.getState()).toEqual({status: "stopped"});
        });
    });

    describe("pre-generated outcome library handoff (Outcome Libraries tab's 'Use in runtime')", () => {
        it("resolves the selector via the injected resolver and reports preGenerated on the running state", async () => {
            const library = fakeOutcomeLibrary("lib-handoff");
            const resolveOutcomeLibrary = jest.fn(stubResolver({status: "ok", library, source: "json"}));
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, resolveOutcomeLibrary);

            const result = await manager.start(
                "/fake/project",
                startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"}}),
            );

            expect(result.status).toBe("started");
            if (result.status !== "started" || result.view.status !== "running") {
                return;
            }
            expect(result.view.preGenerated).toEqual({libraryId: "lib-handoff", hash: computeWeightedOutcomeLibraryHash(library)});
            expect(resolveOutcomeLibrary).toHaveBeenCalledWith("/fake/project", {kind: "json", path: "./libs/base.json"});

            await manager.stop();
        });

        it("creates and spins a real pre-generated session through the /pregenerated-sessions namespace", async () => {
            const library = fakeOutcomeLibrary("lib-handoff");
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library, source: "json"}));
            await manager.start("/fake/project", startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"}}));

            const created = await manager.createSession(undefined, 1000);
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }
            expect(typeof created.session.sessionId).toBe("string");
            expect(created.session.game).toEqual(manifest);
            expect(created.session.credits).toBe(1000);

            const spun = await manager.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status === "ok") {
                expect(spun.session.sessionId).toBe(created.session.sessionId);
                // Pre-generated rounds never carry a sessionVersion over HTTP at all (see
                // buildPreGeneratedSessionView's own doc comment) -- unlike the live path, this is
                // never hoisted because PokieDevServer's own pre-generated route never sends one.
                expect(spun.session.sessionVersion).toBeUndefined();
            }

            await manager.stop();
        });

        it("reports a clear, honest error for getSession in pre-generated mode -- the engine has no GET-by-id route for it", async () => {
            const library = fakeOutcomeLibrary("lib-handoff");
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library, source: "json"}));
            await manager.start("/fake/project", startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"}}));
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }

            const fetched = await manager.getSession(created.session.sessionId);

            expect(fetched.status).toBe("error");
            if (fetched.status === "error") {
                expect(fetched.error).toContain("pre-generated outcome library");
            }

            await manager.stop();
        });

        it("fails the whole start cleanly when the selector resolves to a load-error, never starting a plain-RNG server instead", async () => {
            const manager = new StudioRuntimeManager(
                fakeLoadGame(),
                undefined,
                stubResolver({status: "load-error", error: '"./missing.json" resolves outside the project root.'}),
            );

            const result = await manager.start(
                "/fake/project",
                startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./missing.json"}}),
            );

            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.error).toContain("resolves outside the project root");
            }
            expect(manager.getState().status).toBe("failed");
        });

        it("fails the whole start cleanly when the selector resolves to an invalid library", async () => {
            const manager = new StudioRuntimeManager(
                fakeLoadGame(),
                undefined,
                stubResolver({status: "invalid", errors: [{code: "weighted-outcome-library-empty", severity: "error", message: "The library has no outcomes."}], warnings: []}),
            );

            const result = await manager.start(
                "/fake/project",
                startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./empty.json"}}),
            );

            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.error).toContain("The library has no outcomes.");
            }
        });

        it("clears pre-generated mode on stop -- a later plain start/getSession works normally again", async () => {
            const library = fakeOutcomeLibrary("lib-handoff");
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library, source: "json"}));
            await manager.start("/fake/project", startOptions({preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"}}));
            await manager.stop();

            const restarted = await manager.start("/fake/project", startOptions());

            expect(restarted.status).toBe("started");
            if (restarted.status === "started" && restarted.view.status === "running") {
                expect(restarted.view.preGenerated).toBeUndefined();
            }
            expect(await manager.getSession("does-not-exist")).toEqual({status: "not-found"});

            await manager.stop();
        });
    });
});
