import fs from "fs";
import path from "path";
import os from "os";
import type {GameBlueprint} from "@fromstan/pokie";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";

export function writeDescriptorPackage(
    parent: string,
    options: {name?: string; model?: Partial<GameBlueprint>; legacy?: boolean; descriptorBody?: string} = {},
): string {
    const root = path.join(parent, options.name ?? "descriptor-package");
    fs.mkdirSync(root, {recursive: true});
    const model = options.model ?? fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
    fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({name: "npm-identity", version: "99", pokie: {entry: "index.js"}}),
    );
    fs.writeFileSync(
        path.join(root, "index.js"),
        `const model = ${JSON.stringify(model)};
module.exports = {
    getManifest() { return model.manifest; },
    createSession() { throw new Error("Model extraction must not create a session"); },
    ${
    options.legacy
        ? ""
        : `getModelDescriptor() { ${
            options.descriptorBody ??
                  'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};'
        } },`
}
};`,
    );
    return root;
}

/** A real descriptor read, paused at an explicit read number or when a lifecycle phase arms it. */
export function writePausedDescriptorPackage(
    parent: string,
    descriptorExpression = '{descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model}',
    options: {pauseAtRead?: number} = {},
) {
    const control = path.join(parent, "descriptor-read.txt");
    fs.writeFileSync(control, "existing descriptor input");
    const source = writeDescriptorPackage(parent, {descriptorBody:
        `return require("fs").promises.readFile(${JSON.stringify(control)}, "utf8").then(descriptorInput => (${descriptorExpression}));`,});
    let armed = false;
    let readCount = 0;
    let started!: () => void;
    let settle!: () => void;
    const readStarted = new Promise<void>(resolve => {
        started = resolve;
    });
    const gate = new Promise<void>(resolve => {
        settle = resolve;
    });
    const readFile = fs.promises.readFile.bind(fs.promises);
    const spy = jest.spyOn(fs.promises, "readFile").mockImplementation((...args) => {
        const read = readFile(...args);
        if (String(args[0]) !== control) return read;
        readCount++;
        if (!armed && readCount !== options.pauseAtRead) return read;
        armed = false;
        started();
        return gate.then(() => read);
    });
    return {source, control, readStarted, settle, get readCount() {
        return readCount;
    }, arm: () => {
        armed = true;
    }, restore: () => {
        settle();
        spy.mockRestore();
    }};
}

export function runtimeSnapshotNames(): string[] {
    return fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-runtime-")).sort();
}
