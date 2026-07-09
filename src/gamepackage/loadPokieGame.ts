import {PokieGame, PokieGameContractValidationRule, resolvePokieGameEntryModule, ValidationResult} from "pokie";

export async function loadPokieGame(packageRoot: string): Promise<PokieGame> {
    const {entryPath, candidate} = await resolvePokieGameEntryModule(packageRoot);

    const validation = new ValidationResult(new PokieGameContractValidationRule().validate(candidate));
    if (validation.hasErrors()) {
        const issues = validation
            .getIssues()
            .map((issue) => `  - ${issue.code}: ${issue.message}`)
            .join("\n");
        throw new Error(
            `Entry module "${entryPath}" (from "pokie.entry" in "${packageRoot}/package.json") does not export a valid ` +
                `PokieGame:\n${issues}`,
        );
    }

    return candidate as PokieGame;
}
