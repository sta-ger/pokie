import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

describe("standalone client compiler boundary", () => {
    it("compiles runtime type dependencies while preserving served assets and the public player export", () => {
        const root = process.cwd();
        const configPath = path.join(root, "tsconfig.client.json");
        const config = ts.readConfigFile(configPath, ts.sys.readFile);
        expect(config.error).toBeUndefined();
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
        expect(parsed.errors).toEqual([]);
        const program = ts.createProgram(parsed.fileNames, parsed.options);
        expect(ts.getPreEmitDiagnostics(program).map(({code}) => code)).toEqual([]);

        // Use the real compiler's output in memory; do not build or modify the
        // installed package, static assets or authored sources in this test.
        const output = new Map<string, string>();
        const result = program.emit(undefined, (name, text) => output.set(path.resolve(name), text));
        expect(result.emitSkipped).toBe(false);
        expect(result.diagnostics).toEqual([]);
        for (const name of output.keys()) {
            expect(path.relative(path.join(root, "dist"), name).startsWith("..")).toBe(false);
        }

        const readOutput = (name: string): string => {
            const text = output.get(path.join(root, name));
            expect(text).toBeDefined();
            return text!;
        };
        const html = fs.readFileSync(path.join(root, "cli/client/index.html"), "utf8");
        expect(html).toContain('src="./main.js"');
        expect(readOutput("dist/cli/client/main.js")).not.toContain("src/runtime/");
        expect(readOutput("dist/cli/client/apiClient.js")).not.toContain("src/runtime/");
        expect(readOutput("dist/cli/client/types.d.ts")).toContain("../../src/runtime/projectLogicalRound.js");
        readOutput("dist/src/runtime/projectLogicalRound.d.ts");
        readOutput("dist/src/runtime/SessionCommand.d.ts");

        const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
        const player = manifest.exports["./client/player"].import;
        expect(readOutput(player.default)).toContain('"./renderPlayer.js"');
        expect(readOutput(player.types)).toContain('"./videoSlotRoundView.js"');
        readOutput("dist/cli/client/player/renderPlayer.js");
        readOutput("dist/cli/client/player/videoSlotRoundView.js");
    });
});
