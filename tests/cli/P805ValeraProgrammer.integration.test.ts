import {readFileSync} from "fs";
import path from "path";

import {registerCliCommands} from "../../cli/registerCliCommands.js";

describe("P8-05 Valera Programmer public path", () => {
    it("preserves installed/npx entry points and exposes the readiness and one-shot release validators", () => {
        const packageJson = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")) as {bin: Record<string, string>; scripts: Record<string, string>; exports: Record<string, unknown>};
        const commands = registerCliCommands({version: "1.3.0", pokiePackageRoot: "/packed/pokie", clientRoot: "/packed/pokie/dist/cli/client", studioRoot: "/packed/pokie/dist/cli/studio-client"});

        expect(packageJson.bin.pokie).toBe("./dist/cli/pokie.js");
        expect(packageJson.scripts["audit:product-readiness"]).toContain("p8-05-product-readiness-campaign.mjs");
        expect(packageJson.scripts["release:p8-05"]).toContain("p8-05-release-completion.mjs");
        expect(Object.keys(packageJson.exports)).toEqual(expect.arrayContaining([".", "./browser", "./wasm", "./client/player"]));
        expect(commands.find((command) => command.getName() === "__studio")?.getCommanderCommand().helpInformation()).toContain("Usage: pokie");
        for (const command of ["build", "diff", "replay", "report", "serve", "sim", "validate"]) expect(commands.find((item) => item.getName() === command)?.getCommanderCommand().helpInformation()).toContain(`Usage: ${command}`);
    });
});
