import {loadPokieGame, PokieGameContractValidationRule, ValidationResult} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import * as ts from "typescript";
import {GamePackageScaffolder} from "../../../cli/scaffold/GamePackageScaffolder.js";

describe("a pokie init-scaffolded entry module", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-load-test-"));
        fs.writeFileSync(
            path.join(projectRoot, "package.json"),
            JSON.stringify({name: "crazy-fruits", version: "1.0.0"}, null, 4),
        );

        new GamePackageScaffolder("1.2.1").scaffold(projectRoot);

        // Stand in for "npm run build" (tsc): compile the generated src/index.ts down to the
        // dist/index.js that package.json's "pokie.entry" points at, so loadPokieGame has a real
        // JS module to import, the same way it would after a developer runs the generated build script.
        const source = fs.readFileSync(path.join(projectRoot, "src", "index.ts"), "utf-8");
        const {outputText} = ts.transpileModule(source, {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
        });
        fs.mkdirSync(path.join(projectRoot, "dist"), {recursive: true});
        fs.writeFileSync(path.join(projectRoot, "dist", "index.js"), outputText);
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("can be loaded via loadPokieGame", async () => {
        const game = await loadPokieGame(projectRoot);

        expect(game.getManifest()).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"});
    });

    it("produces a manifest that passes PokieGameContractValidationRule with no issues", async () => {
        const game = await loadPokieGame(projectRoot);

        const result = new ValidationResult(new PokieGameContractValidationRule().validate(game));
        expect(result.hasErrors()).toBe(false);
    });

    it("creates a playable session", async () => {
        const game = await loadPokieGame(projectRoot);

        const session = game.createSession();
        session.setBet(1);
        session.play();

        expect(typeof session.getWinAmount()).toBe("number");
    });
});
