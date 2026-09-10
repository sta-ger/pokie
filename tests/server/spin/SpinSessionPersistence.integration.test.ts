import {loadPokieGame} from "../../../src/gamepackage/loadPokieGame.js";
import {captureInitialPokieSessionState} from "../../../src/server/session/captureInitialPokieSessionState.js";
import {FileSessionRepository} from "../../../src/server/session/FileSessionRepository.js";
import {SpinCommandHandler} from "../../../src/server/spin/SpinCommandHandler.js";
import {InMemoryWallet} from "../../../src/server/wallet/InMemoryWallet.js";
import fs from "fs";
import os from "os";
import path from "path";

describe("SpinCommandHandler persistence (real generated game + file repository)", () => {
    const fixtureRoot = path.join(__dirname, "..", "..", "cli", "fixtures", "playable-game");
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-spin-continuation-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function initialize(
        game: Awaited<ReturnType<typeof loadPokieGame>>,
        repository: FileSessionRepository,
        wallet: InMemoryWallet,
        sessionId: string,
    ): Promise<SpinCommandHandler> {
        const context = {seed: "save-restore-continuation"};
        const session = game.createSession(context);
        session.setCreditsAmount(1_000);
        await repository.save(sessionId, captureInitialPokieSessionState(context, session));
        await wallet.setBalance(sessionId, 1_000);
        const handler = new SpinCommandHandler(game, repository, wallet);
        handler.primeSession(sessionId, session);
        return handler;
    }

    it("has the same deterministic next round after save, destruction, restore, and continuation", async () => {
        const game = await loadPokieGame(fixtureRoot);

        const continuousRepository = new FileSessionRepository(path.join(directory, "continuous"));
        const continuousWallet = new InMemoryWallet();
        const continuous = await initialize(game, continuousRepository, continuousWallet, "continuous");
        await continuous.handle("continuous");
        const uninterruptedNext = await continuous.handle("continuous");

        const restoredDirectory = path.join(directory, "restored");
        const initialRepository = new FileSessionRepository(restoredDirectory);
        const restoredWallet = new InMemoryWallet();
        const beforeRestart = await initialize(game, initialRepository, restoredWallet, "restored");
        await beforeRestart.handle("restored");

        // A fresh repository and handler model process destruction: no live session and no in-memory
        // RNG survives, only the state atomically written by the first handler does.
        const afterRestart = new SpinCommandHandler(game, new FileSessionRepository(restoredDirectory), restoredWallet);
        const restoredNext = await afterRestart.handle("restored");

        expect({...restoredNext, sessionId: "continuous"}).toEqual(uninterruptedNext);
        await expect(new FileSessionRepository(restoredDirectory).load("restored")).resolves.toEqual(
            await continuousRepository.load("continuous"),
        );
    });
});
