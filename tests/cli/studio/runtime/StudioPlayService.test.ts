import {
    GameSessionHandling,
    OutcomeLibraryBundleWriter,
    PokieGame,
    PokieGameManifest,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WinEvaluationResult,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioPlayService} from "../../../../cli/studio/runtime/StudioPlayService.js";
import {buildOutcomeLibraryBundleModeInput} from "../../../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildStakeEngineTestLibrary} from "../../../stakeengine/StakeEngineTestFixtures.js";

const manifest: PokieGameManifest = {id: "sample-slot", name: "Sample Slot", version: "0.1.0"};

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

// A real GameSessionHandling + VideoSlotSessionHandling-shaped fake -- what "full" capture (always on
// for Play, see StudioPlayService's own doc comment) needs to actually build a RoundArtifact through
// buildRoundArtifactFromSession, not just a plain fake with no screen/win-evaluation shape.
function createFakeVideoSlotSession(seed: string | number | undefined): GameSessionHandling & VideoSlotSessionHandling<string> {
    let credits = 1000;
    const bet = 5;
    const screen = [[`seed-${String(seed ?? "none")}`]];

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
    return {getManifest: () => manifest, createSession: (context) => createFakeVideoSlotSession(context?.seed)};
}

function fakeLoadVideoSlotGame(): (packageRoot: string) => Promise<PokieGame> {
    return () => Promise.resolve(createFakeVideoSlotGame());
}

// The serializer's public payload is allowed to be presentation-oriented and therefore can contain a
// stale `win`. Studio must keep the settled result from SpinCommandHandler as the round summary's
// authoritative win; otherwise Session Spin can contradict the RoundArtifact it opens.
function fakeLoadGameWithStaleSerializedWin(): (packageRoot: string) => Promise<PokieGame> {
    return () =>
        Promise.resolve({
            getManifest: () => manifest,
            createSession: () => {
                const session = createFakeVideoSlotSession(undefined);
                return {...session, getWinAmount: () => 7};
            },
            getSessionSerializer: () => ({
                getInitialData: (session: GameSessionHandling) => ({
                    availableBets: session.getAvailableBets(),
                    credits: session.getCreditsAmount(),
                    bet: session.getBet(),
                }),
                getRoundData: (session: GameSessionHandling) => ({
                    credits: session.getCreditsAmount(),
                    bet: session.getBet(),
                    win: 0,
                }),
            }),
        });
}

// A controllable VideoSlotSessionHandling-shaped fake for findAnyWin()/findSymbolWin() -- unlike
// createFakeVideoSlotSession above (always wins the exact same way), each play() here consults
// `winningSymbolAtAttempt` for *this* attempt's own outcome, so a test can make the search take an exact
// number of real spins, or never win at all, without depending on the real win-evaluation engine's own
// paytable/line-matching odds. getWinningLines()/getWinningScatters()/isSymbolScatter() are exactly what
// PlayUntilSymbolWinStrategy itself reads (see its own doc comment) -- getWinEvaluationResult() (what
// buildRoundArtifactFromSession itself reads) is kept independently truthful to the same outcome.
function createControllableVideoSlotSession(winningSymbolAtAttempt: (attempt: number) => string | undefined): {
    session: GameSessionHandling & VideoSlotSessionHandling<string>;
    getAttempts: () => number;
} {
    let credits = 100000;
    const bet = 5;
    let attempts = 0;
    let currentWinningSymbol: string | undefined;

    const session = {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        getAvailableSymbols: () => ["A", "K", "Q", "J"],
        canPlayNextGame: () => credits >= bet,
        isSymbolScatter: () => false,
        play: () => {
            attempts += 1;
            currentWinningSymbol = winningSymbolAtAttempt(attempts);
            credits = credits - bet + (currentWinningSymbol !== undefined ? 2 : 0);
        },
        getWinAmount: () => (currentWinningSymbol !== undefined ? 2 : 0),
        getSymbolsCombination: () => ({toMatrix: () => [[currentWinningSymbol ?? "none"]]}),
        getWinEvaluationResult: () => (currentWinningSymbol !== undefined ? winEvaluationResultWithWin() : new WinEvaluationResult<string>()),
        getWinningLines: () => (currentWinningSymbol !== undefined ? {"1": {getSymbolId: () => currentWinningSymbol}} : {}),
        getWinningScatters: () => ({}),
    } as unknown as GameSessionHandling & VideoSlotSessionHandling<string>;

    return {session, getAttempts: () => attempts};
}

// No getSymbolsCombination()/getWinEvaluationResult() at all -- plain GameSessionHandling, so a "full"
// capture can't build a RoundArtifact and must report roundArtifactUnavailableReason instead.
function createFakeNonVideoSlotGame(): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
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
                getWinAmount: () => 0,
            };
        },
    };
}

describe("StudioPlayService", () => {
    it("creates a real, live session directly, with no server/host/port involved", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.sessionId).toEqual(expect.any(String));
        expect(result.session.game).toEqual(manifest);
        expect(result.session.credits).toBe(1000);
        expect(result.session.win).toBeUndefined();
    });

    it("passes a given seed through to the game's own createSession() as a real PokieGameContext", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.newSession("/fake/project", "my-seed");

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.screen).toEqual([["seed-my-seed"]]);
    });

    it("reports a safe 'failed' result when the game fails to load, never throwing", async () => {
        const service = new StudioPlayService(() => Promise.reject(new Error("bad package")));

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "bad package"});
    });

    it("spins the just-created session and returns a real RoundArtifact, settled through the same wallet SpinCommandHandler always uses", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.credits).toBe(995);
        expect(typeof result.session.win).toBe("number");
        expect(result.session.debug?.artifact).toBeDefined();
        expect(result.session.debug?.artifactUnavailableReason).toBeUndefined();
    });

    it("keeps the settled win when a serializer's round payload carries a stale win", async () => {
        const service = new StudioPlayService(fakeLoadGameWithStaleSerializedWin());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result).toMatchObject({status: "ok"});
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.win).toBe(7);
    });

    it("reports an honest artifactUnavailableReason instead of a fabricated artifact for a non-video-slot game", async () => {
        const service = new StudioPlayService(() => Promise.resolve(createFakeNonVideoSlotGame()));
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        const result = await service.spin(created.session.sessionId);

        expect(result.status).toBe("ok");
        if (result.status !== "ok") {
            throw new Error("expected ok");
        }
        expect(result.session.debug?.artifact).toBeUndefined();
        expect(result.session.debug?.artifactUnavailableReason).toEqual(expect.any(String));
    });

    it("reports 'not-found' spinning a sessionId from before the most recent newSession() call", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        if (first.status !== "ok") {
            throw new Error("expected ok");
        }

        await service.newSession("/fake/project");
        const result = await service.spin(first.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning before any session was ever created", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());

        const result = await service.spin("unknown-session-id");

        expect(result).toEqual({status: "not-found"});
    });

    it("reports 'not-found' spinning after reset()", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const created = await service.newSession("/fake/project");
        if (created.status !== "ok") {
            throw new Error("expected ok");
        }

        service.reset();
        const result = await service.spin(created.session.sessionId);

        expect(result).toEqual({status: "not-found"});
    });

    it("crosses the shared runtime-package-materialization boundary exactly once per newSession(), loading only the resolved runtime path", async () => {
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
            return Promise.resolve(createFakeVideoSlotGame());
        };
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession(rawProjectRoot);

        expect(result.status).toBe("ok");
        expect(resolveCalls).toEqual([rawProjectRoot]);
        expect(loadCalls).toEqual([resolvedRuntimePath]);
    });

    it("reports a safe 'failed' result, without ever loading the game, when the runtime package cannot be materialized", async () => {
        const resolveRuntimePackageRoot = () => Promise.reject(new Error("dependencies phase failed"));
        const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
        const service = new StudioPlayService(loadGame, resolveRuntimePackageRoot);

        const result = await service.newSession("/fake/project");

        expect(result).toEqual({status: "failed", error: "dependencies phase failed"});
        expect(loadGame).not.toHaveBeenCalled();
    });

    it("replaces whatever session was active on every newSession() call, discarding the previous one", async () => {
        const service = new StudioPlayService(fakeLoadVideoSlotGame());
        const first = await service.newSession("/fake/project");
        const second = await service.newSession("/fake/project");
        if (first.status !== "ok" || second.status !== "ok") {
            throw new Error("expected ok");
        }

        expect(first.session.sessionId).not.toEqual(second.session.sessionId);
        expect((await service.spin(second.session.sessionId)).status).toBe("ok");
        expect(await service.spin(first.session.sessionId)).toEqual({status: "not-found"});
    });

    describe("a resolved native outcome-library project", () => {
        let bundleRoot: string;

        beforeEach(() => {
            bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-outcome-library-test-"));
        });

        afterEach(() => {
            fs.rmSync(bundleRoot, {recursive: true, force: true});
        });

        async function buildLibraryBundle(): Promise<string> {
            const bundleDir = path.join(bundleRoot, "library");
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
            return bundleDir;
        }

        it("plays a real draw through the bundle's own OutcomeLibraryBundleOutcomeSource adapter, never loadPokieGame", async () => {
            const bundleDir = await buildLibraryBundle();
            const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
            const service = new StudioPlayService(loadGame);

            const created = await service.newSession(bundleDir, "studio-play-seed");
            expect(created.status).toBe("ok");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(created.session.game).toEqual({id: "sample-slot", name: "Sample Slot", version: "0.1.0"});
            expect(created.session.win).toBeUndefined();
            expect(created.session.screen).toBeUndefined();

            const spun = await service.spin(created.session.sessionId);
            expect(spun.status).toBe("ok");
            if (spun.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(typeof spun.session.win).toBe("number");
            expect(typeof spun.session.bet).toBe("number");
            expect(spun.session.screen).toBeDefined();
            expect(spun.session.debug?.artifact).toBeDefined();
            expect(spun.session.debug?.artifactUnavailableReason).toBeUndefined();
            // Studio's own running ledger starts at 0 for a bundle-backed session (there is no real
            // starting balance to report -- see buildOutcomeSourceSessionView's own doc comment), so after
            // exactly one draw it's simply that draw's own real win minus its own real stake.
            expect(spun.session.credits).toBe((spun.session.win as number) - (spun.session.bet as number));

            expect(loadGame).not.toHaveBeenCalled();
        });

        it("draws the same real outcome every time for a given seed, the same reproducibility a live game's own seed promises", async () => {
            const bundleDir = await buildLibraryBundle();
            const first = new StudioPlayService();
            const second = new StudioPlayService();

            const firstCreated = await first.newSession(bundleDir, "reproducible-seed");
            const secondCreated = await second.newSession(bundleDir, "reproducible-seed");
            if (firstCreated.status !== "ok" || secondCreated.status !== "ok") {
                throw new Error("expected ok");
            }

            const firstSpin = await first.spin(firstCreated.session.sessionId);
            const secondSpin = await second.spin(secondCreated.session.sessionId);
            if (firstSpin.status !== "ok" || secondSpin.status !== "ok") {
                throw new Error("expected ok");
            }

            expect(firstSpin.session.debug?.artifact).toEqual(secondSpin.session.debug?.artifact);
        });
    });

    it("reports the real, resolver-derived 'outcomeSource.sample' capability diagnostic for a resolved Stake Engine export, never attempting to load it as a package", async () => {
        const stakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-stake-adapter-test-"));
        try {
            const stakeDir = path.join(stakeRoot, "stake-export");
            const modes: StakeEngineExportModeInput[] = [
                {modeName: "base", cost: 1, library: buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1})},
            ];
            await new StakeEngineExporter("1.3.0").exportToDirectory(modes, stakeDir);
            const loadGame = jest.fn(() => Promise.resolve(createFakeVideoSlotGame()));
            const service = new StudioPlayService(loadGame);

            const result = await service.newSession(stakeDir);

            expect(result.status).toBe("failed");
            if (result.status !== "failed") {
                throw new Error("expected failed");
            }
            expect(result.error).toContain("outcomeSource.sample");
            expect(result.error).toContain("stakeAdapter");
            expect(loadGame).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(stakeRoot, {recursive: true, force: true});
        }
    });

    describe("findAnyWin / findSymbolWin", () => {
        it("findAnyWin returns the very first round when it already wins, driving the engine's own PlayUntilAnyWinStrategy against the live session", async () => {
            const {session} = createControllableVideoSlotSession(() => "A");
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findAnyWin(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.win).toBeGreaterThan(0);
        });

        it("findAnyWin repeats real, authoritative spins -- never a client-side calculation -- until one actually wins", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession((attempt) => (attempt >= 4 ? "A" : undefined));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findAnyWin(created.session.sessionId);

            expect(result.status).toBe("ok");
            if (result.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(result.session.win).toBeGreaterThan(0);
            // Proves the search actually played 4 real, settled rounds to get there, not a single check --
            // each of the first 3 genuinely lost (see winningSymbolAtAttempt above).
            expect(getAttempts()).toBe(4);
        });

        it("findSymbolWin propagates the chooser's own selected symbol into the search -- a round winning a different symbol never matches", async () => {
            const {session} = createControllableVideoSlotSession(() => "A");
            // maxFindScenarioSpins is overridden to a small bound (the 6th constructor argument) so this
            // exercises the real "search exhausted" path without waiting out thousands of real spins.
            const service = new StudioPlayService(
                () => Promise.resolve({getManifest: () => manifest, createSession: () => session}),
                undefined,
                undefined,
                undefined,
                undefined,
                5,
            );
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const matchingSymbol = await service.findSymbolWin(created.session.sessionId, "A");
            expect(matchingSymbol.status).toBe("ok");

            const created2 = await service.newSession("/fake/project");
            if (created2.status !== "ok") {
                throw new Error("expected ok");
            }
            const differentSymbol = await service.findSymbolWin(created2.session.sessionId, "Q");
            expect(differentSymbol).toEqual({status: "error", error: "No matching round was found within 5 spins."});
        });

        it("findSymbolWin stops on the first real spin that actually wins the requested symbol, not just any win", async () => {
            const {session, getAttempts} = createControllableVideoSlotSession((attempt) => (attempt >= 3 ? "K" : undefined));
            const service = new StudioPlayService(() => Promise.resolve({getManifest: () => manifest, createSession: () => session}));
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findSymbolWin(created.session.sessionId, "K");

            expect(result.status).toBe("ok");
            expect(getAttempts()).toBe(3);
        });

        it("findSymbolWin reports an honest 'error' for a non-video-slot game, never throwing, and never burning a spin first", async () => {
            const loadGame = jest.fn(() => Promise.resolve(createFakeNonVideoSlotGame()));
            const service = new StudioPlayService(loadGame);
            const created = await service.newSession("/fake/project");
            if (created.status !== "ok") {
                throw new Error("expected ok");
            }

            const result = await service.findSymbolWin(created.session.sessionId, "A");

            expect(result).toEqual({status: "error", error: "This game doesn't report per-symbol win details, so Find symbol win isn't available for it."});

            // Proves it never burned a real spin trying: the session's credits are exactly what a plain
            // spin() from this same starting point produces, not one round further along.
            const spun = await service.spin(created.session.sessionId);
            if (spun.status !== "ok") {
                throw new Error("expected ok");
            }
            expect(spun.session.credits).toBe(999);
        });

        it("findAnyWin reports 'not-found' against a sessionId from before the most recent newSession() call", async () => {
            const service = new StudioPlayService(fakeLoadVideoSlotGame());
            const first = await service.newSession("/fake/project");
            if (first.status !== "ok") {
                throw new Error("expected ok");
            }

            await service.newSession("/fake/project");
            const result = await service.findAnyWin(first.session.sessionId);

            expect(result).toEqual({status: "not-found"});
        });

        describe("against a resolved native outcome-library project (no live GameSessionHandling)", () => {
            let bundleRoot: string;

            beforeEach(() => {
                bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-play-find-scenario-test-"));
            });

            afterEach(() => {
                fs.rmSync(bundleRoot, {recursive: true, force: true});
            });

            async function buildLibraryBundle(): Promise<string> {
                const bundleDir = path.join(bundleRoot, "library");
                await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "base-lib")], bundleDir);
                return bundleDir;
            }

            it("finds a real winning draw by reading the already-drawn artifact's own totalWin, never a live session/strategy object", async () => {
                const bundleDir = await buildLibraryBundle();
                const service = new StudioPlayService();
                const created = await service.newSession(bundleDir, "studio-play-find-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findAnyWin(created.session.sessionId);

                expect(result.status).toBe("ok");
                if (result.status !== "ok") {
                    throw new Error("expected ok");
                }
                expect(result.session.win).toBeGreaterThan(0);
                expect(result.session.debug?.artifact?.totalWin).toBeGreaterThan(0);
            });

            it("reaches the identical winning round for the same seed -- deterministic search, same reproducibility a single seeded draw promises", async () => {
                const bundleDir = await buildLibraryBundle();
                const first = new StudioPlayService();
                const second = new StudioPlayService();

                const firstCreated = await first.newSession(bundleDir, "reproducible-find-seed");
                const secondCreated = await second.newSession(bundleDir, "reproducible-find-seed");
                if (firstCreated.status !== "ok" || secondCreated.status !== "ok") {
                    throw new Error("expected ok");
                }

                const firstFound = await first.findAnyWin(firstCreated.session.sessionId);
                const secondFound = await second.findAnyWin(secondCreated.session.sessionId);
                if (firstFound.status !== "ok" || secondFound.status !== "ok") {
                    throw new Error("expected ok");
                }

                expect(firstFound.session.debug?.artifact).toEqual(secondFound.session.debug?.artifact);
            });

            it("findSymbolWin against a symbol that never wins in the bundle reports an honest 'error' once the bound is exhausted, never hanging", async () => {
                const bundleDir = await buildLibraryBundle();
                // maxFindScenarioSpins overridden to a small bound (6th constructor argument) -- the
                // bundle's own winning outcomes all carry symbolId "A" (see OutcomeLibraryBundleTestFixtures),
                // so "no-such-symbol" can never match.
                const service = new StudioPlayService(undefined, undefined, undefined, undefined, undefined, 5);
                const created = await service.newSession(bundleDir, "studio-play-find-seed");
                if (created.status !== "ok") {
                    throw new Error("expected ok");
                }

                const result = await service.findSymbolWin(created.session.sessionId, "no-such-symbol");

                expect(result).toEqual({status: "error", error: "No matching round was found within 5 spins."});
            });
        });
    });
});
