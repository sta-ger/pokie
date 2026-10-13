import fs from "node:fs";
import {pathToFileURL} from "node:url";
import {SqliteTransactionalRoundStore, SpinCommandHandler, PokieDevServer, captureInitialPokieSessionState, type RepositoryCommand} from "@fromstan/pokie";
import {transactionalRoundGame} from "./TransactionalRoundGame.js";
import type {setTransactionBoundaryHook} from "../../../src/server/storage/internal/transactionBoundary.js";

async function main(): Promise<void> {
    const [database, action, serialized, boundary, hookPath, calculationFile] = process.argv.slice(2);
    const command = JSON.parse(serialized) as RepositoryCommand;
    const game = transactionalRoundGame(() => {
        fs.appendFileSync(calculationFile, `${process.pid}\n`);
        process.send?.({type: "calculation"});
    });
    const construct = game.createSession.bind(game);
    game.createSession = context => {
        fs.appendFileSync(`${calculationFile}.construction`, `${process.pid}\n`);
        return construct(context);
    };
    const store = await SqliteTransactionalRoundStore.open(database, {lockWaitMs: action === "busy" ? 30 : 5000});
    const hook = await import(pathToFileURL(hookPath).href) as {setTransactionBoundaryHook: typeof setTransactionBoundaryHook};
    function message(type: string): Promise<void> {
        return new Promise(resolve => {
            const listen = (value: {type: string}): void => {
                if (value.type !== type) return;
                process.off("message", listen);
                resolve();
            };
            process.on("message", listen);
        });
    }
    hook.setTransactionBoundaryHook(store, async name => {
        if (name === boundary) {
            const resumed = message("resume");
            process.send?.({type: "boundary", boundary: name});
            await resumed;
        }
    });
    if (action === "initialize") {
        const context = {seed: 7};
        await store.initialize(command.sessionId, captureInitialPokieSessionState(context, game.createSession(context), game.getSessionSerializer!(), true, game), game);
        await store.close();
        process.send?.({type: "done"});
        process.disconnect?.();
    } else if (action === "observe") {
        const state = await store.readSession(command.sessionId),
            result = await store.lookupResult(command.sessionId, command.requestId!),
            balance = await store.getBalance(command.sessionId);
        await store.close();
        const {DatabaseSync} = await import("node:sqlite");
        const reader = new DatabaseSync(database, {readOnly: true});
        const ledger = reader.prepare("SELECT kind, amount, balance FROM ledger WHERE session_id=? ORDER BY rowid").all(command.sessionId),
            operations = reader.prepare("SELECT record FROM operations WHERE session_id=?").all(command.sessionId),
            requests = reader.prepare("SELECT envelope, result FROM requests WHERE session_id=?").all(command.sessionId);
        reader.close();
        process.send?.({type: "done", state, result, balance, ledger, operations, requests});
        process.disconnect?.();
    } else if (action === "server") {
        const server = new PokieDevServer(game, {port: 0, transactionalRoundStore: store});
        const address = await server.start();
        process.send?.({type: "ready", port: address.port});
        await message("stop");
        await server.stop();
        process.send?.({type: "done"});
        process.disconnect?.();
    } else {
        const started = message("start");
        process.send?.({type: "ready"});
        await started;
        const result = await new SpinCommandHandler(game, store).execute(command);
        await store.close();
        process.send?.({type: "done", result});
        process.disconnect?.();
    }
}
main().catch(error => {
    process.send?.({type: "error", error: String(error)});
    process.exitCode = 1;
    process.disconnect?.();
});
