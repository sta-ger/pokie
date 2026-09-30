import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {createP805OwnedProcessRecord} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {registerPc20OwnedResource} from "../../scripts/pc-20-release-completion.mjs";

test("a packed browser owner retains its namespace through release", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p805-owned-browser-"));
    const options = {
        resourceRegistryPath:path.join(directory, "resources.ndjson"),
        resourceRegistrySecret:randomBytes(32).toString("hex"),
        operationId:randomBytes(16).toString("hex"),
    };
    try {
        const owner = createP805OwnedProcessRecord("browser", {pid:process.pid}, options);
        assert.equal(owner.operationId, options.operationId);
        const resource = {
            kind:"browser", resourceId:`browser:${owner.pid}:browser`,
            pid:owner.pid, processIdentity:owner.identity,
        };
        const acquired = {
            POKIE_PC20_RESOURCE_REGISTRY:options.resourceRegistryPath,
            POKIE_PC20_RESOURCE_REGISTRY_SECRET:options.resourceRegistrySecret,
            POKIE_PC20_OPERATION_ID:options.operationId,
        };
        const released = {
            POKIE_PC20_RESOURCE_REGISTRY:owner.resourceRegistryPath,
            POKIE_PC20_RESOURCE_REGISTRY_SECRET:owner.resourceRegistrySecret,
            POKIE_PC20_OPERATION_ID:owner.operationId,
        };
        assert.equal(registerPc20OwnedResource(resource, "acquired", acquired), true);
        assert.equal(registerPc20OwnedResource(resource, "released", released), true);
        const records = (await readFile(options.resourceRegistryPath, "utf8"))
            .trim().split("\n").map((line) => JSON.parse(line));
        assert.deepEqual(records.map(({action, operationId}) => ({action, operationId})), [
            {action:"acquired", operationId:options.operationId},
            {action:"released", operationId:options.operationId},
        ]);
    } finally {
        await rm(directory, {recursive:true, force:true});
    }
});
