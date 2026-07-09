import {loadPokieGame, PokieGameContractValidationRule, ValidationResult} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import * as ts from "typescript";
import {GamePackageCreator} from "../../../cli/scaffold/GamePackageCreator";

describe("a pokie create-scaffolded entry module", () => {
    let parentDir: string;
    let projectRoot: string;

    beforeEach(() => {
        parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-create-load-test-"));
        const result = new GamePackageCreator("1.2.1").create(parentDir, "crazy-fruits");
        projectRoot = result.projectRoot;

        // Stand in for "npm run build" (tsc): compile the generated src/*.ts files down to the
        // dist/*.js files that package.json's "pokie.entry" points at, so loadPokieGame has real
        // JS modules to import, the same way it would after a developer runs the generated build script.
        fs.mkdirSync(path.join(projectRoot, "dist"), {recursive: true});
        for (const file of fs.readdirSync(path.join(projectRoot, "src"))) {
            const source = fs.readFileSync(path.join(projectRoot, "src", file), "utf-8");
            const {outputText} = ts.transpileModule(source, {
                compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
            });
            const outputFile = file.replace(/\.ts$/, ".js");
            fs.writeFileSync(path.join(projectRoot, "dist", outputFile), outputText);
        }
    });

    afterEach(() => {
        fs.rmSync(parentDir, {recursive: true, force: true});
    });

    it("can be loaded via loadPokieGame", async () => {
        const game = await loadPokieGame(projectRoot);

        expect(game.getManifest()).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
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
