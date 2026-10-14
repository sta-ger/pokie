import fs from "fs";
import path from "path";
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
