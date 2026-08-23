import fs from "fs";
import path from "path";
import {SeededRandomNumberGenerator, VideoSlotConfig} from "../../src/browser.js";

describe("browser runtime API", () => {
    it("exposes game-runtime classes without traversing a Node builtin", () => {
        expect(new SeededRandomNumberGenerator("browser-seed").getRandomInt(0, 100)).toBe(
            new SeededRandomNumberGenerator("browser-seed").getRandomInt(0, 100),
        );
        expect(new VideoSlotConfig().getReelsNumber()).toBeGreaterThan(0);

        const browserEntry = path.resolve(__dirname, "../../src/browser.ts");
        expect(collectNodeBuiltinImports(browserEntry)).toEqual([]);
    });
});

function collectNodeBuiltinImports(entryPath: string): string[] {
    const visited = new Set<string>();
    const nodeBuiltins = new Set<string>();
    const visit = (filePath: string): void => {
        if (visited.has(filePath)) {
            return;
        }
        visited.add(filePath);

        const source = fs.readFileSync(filePath, "utf8");
        for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
            const specifier = match[1];
            if (specifier.startsWith("node:") || ["fs", "module", "path"].includes(specifier)) {
                nodeBuiltins.add(specifier);
            } else if (specifier.startsWith(".")) {
                visit(path.resolve(path.dirname(filePath), specifier.replace(/\.js$/, ".ts")));
            }
        }
    };

    visit(entryPath);
    return [...nodeBuiltins].sort();
}
