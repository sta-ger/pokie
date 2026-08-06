import {
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
    GameSessionHandling,
    PokieDevServer,
    PokieDevServerHandling,
    PokieDevServerOptions,
    PokieGame,
    PokieGameManifest,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
} from "pokie";
import type {ResolvedOutcomeLibrary} from "../../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryService.js";
import {StudioRuntimeManager} from "../../../../cli/studio/runtime/StudioRuntimeManager.js";
import type {ValidatedStartRuntimeRequest} from "../../../../cli/studio/runtime/validateStartRuntimeRequest.js";

const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

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

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A real GameSessionHandling + VideoSlotSessionHandling-shaped fake (getSymbolsCombination/
// getWinEvaluationResult) -- unlike createFakeSession() above, which only has the plain
// GameSessionHandling shape PokieDevServer needs for wallet/idempotency, this is what the
// "sessionCapturePolicyMode: full" tests below need to actually exercise buildRoundArtifactFromSession
// end-to-end through a real running server, not just a plain fake.
function createFakeVideoSlotSession(): GameSessionHandling & VideoSlotSessionHandling<string> {
    let credits = 1000;
    const bet = 5;
    const screen = [["A", "A", "A"]];

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
            credits -= bet;
        },
        getWinAmount: () => winEvaluationResultWithWin().getTotalWin(),
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;
}

function createFakeVideoSlotGame(): PokieGame {
    return {getManifest: () => manifest, createSession: () => createFakeVideoSlotSession()};
}

function fakeLoadVideoSlotGame(): () => Promise<PokieGame> {
    return () => Promise.resolve(createFakeVideoSlotGame());
}

// A twin of createFakeVideoSlotGame that additionally implements the optional
// PokieGame.getConfigHash() hook -- proves a real spin through StudioRuntimeManager's own runtime
// (always "full" capture, see startInternal()) carries that authoritative hash into the persisted
// RoundArtifact's provenance.configHash, without StudioRuntimeManager itself needing any wiring of
// its own (it hands the loaded game straight to PokieDevServer/SpinCommandHandler).
function createFakeVideoSlotGameWithConfigHash(): PokieGame {
    return {getManifest: () => manifest, createSession: () => createFakeVideoSlotSession(), getConfigHash: () => "sha256:fake-config-hash"};
}

function fakeLoadVideoSlotGameWithConfigHash(): () => Promise<PokieGame> {
    return () => Promise.resolve(createFakeVideoSlotGameWithConfigHash());
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

    it("ties the underlying server's own capture policy (captureDebugSessionData) to this runtime's own debug toggle", async () => {
        const capturedOptions: PokieDevServerOptions[] = [];
        const createServer = (game: PokieGame, options: PokieDevServerOptions): PokieDevServerHandling => {
            capturedOptions.push(options);
            return new PokieDevServer(game, options);
        };

        const debugOffManager = new StudioRuntimeManager(fakeLoadGame(), createServer);
        await debugOffManager.start("/fake/project", startOptions({debug: false}));
        await debugOffManager.stop();

        const debugOnManager = new StudioRuntimeManager(fakeLoadGame(), createServer);
        await debugOnManager.start("/fake/project", startOptions({debug: true}));
        await debugOnManager.stop();

        expect(capturedOptions).toHaveLength(2);
        expect(capturedOptions[0].captureDebugSessionData).toBe(false);
        expect(capturedOptions[1].captureDebugSessionData).toBe(true);
    });

    it('always requests the underlying server\'s "full" sessionCapturePolicyMode, independent of this runtime\'s own debug toggle', async () => {
        const capturedOptions: PokieDevServerOptions[] = [];
        const createServer = (game: PokieGame, options: PokieDevServerOptions): PokieDevServerHandling => {
            capturedOptions.push(options);
            return new PokieDevServer(game, options);
        };

        const debugOffManager = new StudioRuntimeManager(fakeLoadGame(), createServer);
        await debugOffManager.start("/fake/project", startOptions({debug: false}));
        await debugOffManager.stop();

        const debugOnManager = new StudioRuntimeManager(fakeLoadGame(), createServer);
        await debugOnManager.start("/fake/project", startOptions({debug: true}));
        await debugOnManager.stop();

        // Unlike captureDebugSessionData above (tied 1:1 to the debug toggle), sessionCapturePolicyMode
        // is always "full" -- a Studio/dev session's whole point is a fully inspectable recorded round,
        // and turning off `?debug=1`-only serializer content should never also drop the RoundArtifact.
        expect(capturedOptions).toHaveLength(2);
        expect(capturedOptions[0].sessionCapturePolicyMode).toBe("full");
        expect(capturedOptions[1].sessionCapturePolicyMode).toBe("full");
    });

    it("stamps the server's own pokieVersion option from this manager's own constructor-injected pokieVersion", async () => {
        const capturedOptions: PokieDevServerOptions[] = [];
        const createServer = (game: PokieGame, options: PokieDevServerOptions): PokieDevServerHandling => {
            capturedOptions.push(options);
            return new PokieDevServer(game, options);
        };

        const manager = new StudioRuntimeManager(fakeLoadGame(), createServer, undefined, undefined, "7.7.7");
        await manager.start("/fake/project", startOptions());
        await manager.stop();

        expect(capturedOptions).toHaveLength(1);
        expect(capturedOptions[0].pokieVersion).toBe("7.7.7");
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

        it("a real spin persists a complete RoundArtifact (screen/wins/steps/provenance/betMode/stake) — the underlying server's own \"full\" sessionCapturePolicyMode, inspectable through debug mode", async () => {
            const manager = new StudioRuntimeManager(fakeLoadVideoSlotGame(), undefined, undefined, undefined, "5.5.5");
            await manager.start("/fake/project", startOptions({debug: true}));

            const created = await manager.createSession();
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }

            const spun = await manager.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status !== "ok") {
                return;
            }

            const stateAfter = spun.session.debug?.stateAfter as Record<string, unknown> | undefined;
            expect(stateAfter).toBeDefined();
            expect(stateAfter?.capturePolicy).toEqual({version: 1, mode: "full", captureDebugPayloads: true});
            expect(stateAfter?.roundArtifactUnavailableReason).toBeUndefined();

            const artifact = stateAfter?.roundArtifact as Record<string, unknown>;
            expect(artifact).toBeDefined();
            expect(artifact.provenance).toEqual({game: manifest, pokieVersion: "5.5.5"});
            expect(artifact.screen).toEqual([["A", "A", "A"]]);
            expect(Array.isArray(artifact.wins)).toBe(true);
            expect(Array.isArray(artifact.steps)).toBe(true);
            expect((artifact.debug as Record<string, unknown>).command).toBe("spin");

            await manager.stop();
        });

        it("carries the loaded game's own PokieGame.getConfigHash() into the persisted RoundArtifact's provenance.configHash", async () => {
            const manager = new StudioRuntimeManager(fakeLoadVideoSlotGameWithConfigHash(), undefined, undefined, undefined, "5.5.5");
            await manager.start("/fake/project", startOptions({debug: true}));

            const created = await manager.createSession();
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }

            const spun = await manager.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status !== "ok") {
                return;
            }

            const stateAfter = spun.session.debug?.stateAfter as Record<string, unknown> | undefined;
            const artifact = stateAfter?.roundArtifact as Record<string, unknown>;
            expect(artifact.provenance).toEqual({game: manifest, pokieVersion: "5.5.5", configHash: "sha256:fake-config-hash"});

            await manager.stop();
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

        it("stamps each recorded spin with a stable, session-local round index, a recorded-at timestamp, and its source", async () => {
            const manager = await startedManager({debug: false});
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            const first = await manager.spin(sessionId, "req-a");
            const second = await manager.spin(sessionId, "req-b");
            expect(first.status).toBe("ok");
            expect(second.status).toBe("ok");
            if (first.status !== "ok" || second.status !== "ok") {
                return;
            }

            // Round indexing is session-local (this session's own 1st and 2nd round) and 1-based --
            // not a global spin counter across every session the manager has ever touched.
            expect(first.session.studioRound).toBe(1);
            expect(second.session.studioRound).toBe(2);
            expect(typeof first.session.studioRecordedAt).toBe("string");
            expect(Number.isNaN(Date.parse(first.session.studioRecordedAt as string))).toBe(false);
            // A plain start (no pre-generated library) is always "live".
            expect(first.session.studioSource).toBe("live");

            const recent = manager.listRecentSpins();
            expect(recent.map((entry) => entry.studioRound)).toEqual([2, 1]);

            await manager.stop();
        });

        it("an idempotent retry of the same (sessionId, requestId) reuses the original round's identity instead of filing a duplicate entry", async () => {
            const manager = await startedManager({debug: false});
            const created = await manager.createSession();
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;

            const first = await manager.spin(sessionId, "req-retry");
            const retry = await manager.spin(sessionId, "req-retry");
            expect(first.status).toBe("ok");
            expect(retry.status).toBe("ok");
            if (first.status !== "ok" || retry.status !== "ok") {
                return;
            }

            // Canonically the same round -- same identity (round/recordedAt/source) on both results,
            // and the retry's idempotent replay is deep-equal to the original in every other field too.
            expect(retry).toEqual(first);
            expect(retry.session.studioRound).toBe(first.session.studioRound);
            expect(retry.session.studioRecordedAt).toBe(first.session.studioRecordedAt);

            // Never filed as a second entry -- the retry left the recent-spin list exactly as it was.
            const recent = manager.listRecentSpins();
            expect(recent).toHaveLength(1);
            expect(recent[0].studioRound).toBe(1);

            // A genuinely new round for the same session still gets its own, later index.
            const nextRound = await manager.spin(sessionId, "req-next");
            expect(nextRound.status).toBe("ok");
            if (nextRound.status === "ok") {
                expect(nextRound.session.studioRound).toBe(2);
            }
            expect(manager.listRecentSpins()).toHaveLength(2);

            await manager.stop();
        });

        it("never conflates two different sessions that happen to reuse the same manually-typed requestId", async () => {
            const manager = await startedManager({debug: false});
            const createdA = await manager.createSession();
            const createdB = await manager.createSession();
            if (createdA.status !== "ok" || createdB.status !== "ok") {
                return;
            }
            expect(createdA.session.sessionId).not.toBe(createdB.session.sessionId);

            // Same literal requestId, deliberately reused across two distinct sessions -- e.g. via the
            // Debug tab's manual "Request id override" field -- must still be recorded as two distinct,
            // legitimate rounds, since the canonical identity is the (sessionId, requestId) pair, never
            // requestId alone.
            const spunA = await manager.spin(createdA.session.sessionId, "shared-request-id");
            const spunB = await manager.spin(createdB.session.sessionId, "shared-request-id");
            expect(spunA.status).toBe("ok");
            expect(spunB.status).toBe("ok");
            if (spunA.status !== "ok" || spunB.status !== "ok") {
                return;
            }

            expect(spunA.session.studioRound).toBe(1);
            expect(spunB.session.studioRound).toBe(1);

            const recent = manager.listRecentSpins();
            expect(recent).toHaveLength(2);
            expect(new Set(recent.map((entry) => entry.sessionId))).toEqual(new Set([createdA.session.sessionId, createdB.session.sessionId]));

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

        it("starts normally when preGeneratedLibraryExpectedHash matches the freshly-resolved library's hash", async () => {
            const library = fakeOutcomeLibrary("lib-handoff");
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library, source: "json"}));

            const result = await manager.start(
                "/fake/project",
                startOptions({
                    preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
                    preGeneratedLibraryExpectedHash: computeWeightedOutcomeLibraryHash(library),
                }),
            );

            expect(result.status).toBe("started");
            if (result.status === "started" && result.view.status === "running") {
                expect(result.view.preGenerated).toEqual({libraryId: "lib-handoff", hash: computeWeightedOutcomeLibraryHash(library)});
            }

            await manager.stop();
        });

        it("fails the whole start with a clear stale-library error when the library changed on disk since it was selected -- never silently starting against the new content", async () => {
            // Simulates exactly the "Select library A -> file changes on disk -> Use in runtime" scenario:
            // the selector still resolves successfully (the file is still readable/valid), but its content
            // -- and therefore its hash -- no longer matches what Outcome Libraries showed the user.
            const changedLibrary = fakeOutcomeLibrary("lib-handoff-changed");
            const staleExpectedHash = computeWeightedOutcomeLibraryHash(fakeOutcomeLibrary("lib-handoff"));
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library: changedLibrary, source: "json"}));

            const result = await manager.start(
                "/fake/project",
                startOptions({
                    preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
                    preGeneratedLibraryExpectedHash: staleExpectedHash,
                }),
            );

            expect(result.status).toBe("failed");
            if (result.status === "failed") {
                expect(result.error).toContain("changed since you selected it");
                expect(result.error).toContain("Re-select it in Outcome Libraries");
            }
            // No server was ever started against the changed content -- the manager stays cleanly stopped.
            expect(manager.getState().status).toBe("failed");
            expect(await manager.createSession()).toEqual({status: "not-running"});
        });

        it("does not tear down an already-running runtime for a stale 'Use in runtime' handoff -- the old runtime, its session, and recent-spin history are all preserved", async () => {
            // The handoff always goes through restart() (see ProjectDashboardPage's own onUseInRuntime),
            // which must resolve/hash-check the requested library as a *preflight*, before touching
            // whatever is currently running -- a stale library must never destroy an already-working
            // runtime only to then fail to replace it with anything.
            const changedLibrary = fakeOutcomeLibrary("lib-handoff-changed");
            const staleExpectedHash = computeWeightedOutcomeLibraryHash(fakeOutcomeLibrary("lib-handoff"));
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, stubResolver({status: "ok", library: changedLibrary, source: "json"}));

            const started = await manager.start("/fake/project", startOptions());
            expect(started.status).toBe("started");
            if (started.status !== "started" || started.view.status !== "running") {
                return;
            }
            const originalView = started.view;

            const created = await manager.createSession();
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                return;
            }
            const sessionId = created.session.sessionId;
            await manager.spin(sessionId, "request-before-handoff");
            expect(manager.listRecentSpins()).toHaveLength(1);

            const handoffResult = await manager.restart("/fake/project", {
                ...startOptions(),
                preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
                preGeneratedLibraryExpectedHash: staleExpectedHash,
            });

            expect(handoffResult.status).toBe("failed");
            if (handoffResult.status === "failed") {
                expect(handoffResult.error).toContain("changed since you selected it");
            }

            // The old runtime is still running -- the exact same view, never superseded -- and its
            // session/recent-spin history survived completely untouched.
            expect(manager.getState()).toEqual(originalView);
            expect(manager.listRecentSpins()).toHaveLength(1);
            const stillThere = await manager.getSession(sessionId);
            expect(stillThere.status).toBe("ok");

            await manager.stop();
        });

        it("pins the preflight's own resolved library into the actual start -- never re-resolves it a second time after teardown", async () => {
            // The resolver answers "ok" with a valid library the *first* time it's called (restart()'s
            // own preflight) but "invalid" every time after -- simulating the file changing (or becoming
            // unreadable) in the gap between preflight and the real start. If startInternal() were to
            // resolve a second time after teardown (the TOCTOU this preflight is meant to close), it
            // would see this second, "invalid" answer and the whole restart would fail -- instead, it
            // must reuse the exact library/hash the preflight already validated, calling the resolver
            // exactly once.
            const pinnedLibrary = fakeOutcomeLibrary("lib-pinned");
            const pinnedHash = computeWeightedOutcomeLibraryHash(pinnedLibrary);
            let resolveCallCount = 0;
            const resolveOutcomeLibrary = jest.fn((): Promise<ResolvedOutcomeLibrary> => {
                resolveCallCount += 1;
                if (resolveCallCount === 1) {
                    return Promise.resolve({status: "ok", library: pinnedLibrary, source: "json"});
                }
                return Promise.resolve({
                    status: "invalid",
                    errors: [{code: "weighted-outcome-library-empty", severity: "error", message: "The library has no outcomes."}],
                    warnings: [],
                });
            });
            const manager = new StudioRuntimeManager(fakeLoadGame(), undefined, resolveOutcomeLibrary);

            const result = await manager.restart("/fake/project", {
                ...startOptions(),
                preGeneratedLibrarySelector: {kind: "json", path: "./libs/base.json"},
                preGeneratedLibraryExpectedHash: pinnedHash,
            });

            expect(resolveOutcomeLibrary).toHaveBeenCalledTimes(1);
            expect(result.status).toBe("started");
            if (result.status === "started" && result.view.status === "running") {
                expect(result.view.preGenerated).toEqual({libraryId: "lib-pinned", hash: pinnedHash});
            }

            await manager.stop();
        });
    });
});

// Proves Studio's Play/Runtime feature crosses the shared runtime-package-materialization boundary (see
// materializeRuntimePackage.ts) exactly once per start(), and only ever loads against whatever runtime
// path that boundary hands back -- never the caller's own raw projectRoot.
describe("StudioRuntimeManager runtime package materialization boundary", () => {
    it("resolves the raw projectRoot once and loads the resolved runtime path instead", async () => {
        const rawProjectRoot = "/blueprints/raw-game.json";
        const resolvedRuntimePath = "/materialized/raw-game";
        const resolveCalls: string[] = [];
        const resolveRuntimePackageRoot = (packageRoot: string) => {
            resolveCalls.push(packageRoot);
            return Promise.resolve({runtimePath: resolvedRuntimePath, release: () => Promise.resolve()});
        };
        const loadCalls: string[] = [];
        const loadGame = (packageRoot: string) => {
            loadCalls.push(packageRoot);
            return Promise.resolve(createFakeGame());
        };
        const manager = new StudioRuntimeManager(loadGame, undefined, undefined, resolveRuntimePackageRoot);

        const result = await manager.start(rawProjectRoot, startOptions());

        expect(result.status).toBe("started");
        expect(resolveCalls).toEqual([rawProjectRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);

        await manager.stop();
    });

    it("reports a safe 'failed' result, without ever loading the game, when the runtime package cannot be materialized", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeGame()));
        const manager = new StudioRuntimeManager(loadGame, undefined, undefined, resolveRuntimePackageRoot);

        const result = await manager.start("/fake/project", startOptions());

        expect(result).toEqual({status: "failed", error: "dependencies phase failed"});
        expect(loadGame).not.toHaveBeenCalled();
    });
});
