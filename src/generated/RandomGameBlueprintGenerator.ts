import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {DefaultGameMechanicCompatibilityPolicy} from "./DefaultGameMechanicCompatibilityPolicy.js";
import {DefaultRandomGameBlueprintStrategy} from "./DefaultRandomGameBlueprintStrategy.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameMechanicCompatibilityPolicy} from "./GameMechanicCompatibilityPolicy.js";
import type {RandomGameBlueprintGenerating} from "./RandomGameBlueprintGenerating.js";
import type {RandomGameBlueprintOverrides, RandomGameBlueprintRequest} from "./RandomGameBlueprintRequest.js";
import type {RandomGameBlueprintResult} from "./RandomGameBlueprintResult.js";
import type {RandomGameBlueprintStrategy} from "./RandomGameBlueprintStrategy.js";
import {SlotGameNameGenerator} from "./SlotGameNameGenerator.js";
import type {SlotGameNameGenerating} from "./SlotGameNameGenerating.js";

const DEFAULT_MANIFEST_VERSION = "0.1.0";

// Bumped whenever RandomGameBlueprintStrategy's own algorithm changes in a way that would make the
// same seed produce a different blueprint -- see RandomGameBlueprintProvenance for what this is for.
const GENERATOR_VERSION = "1.0.0";

// Owns naming, manifest, and provenance for a randomly generated GameBlueprint; the mechanic-bearing
// fields (reels/rows/symbols/paytable/symbolWeights/...) come from whichever RandomGameBlueprintStrategy
// is plugged in (DefaultRandomGameBlueprintStrategy unless overridden), and the strategy's declared
// GameMechanicFeature set is checked against a GameMechanicCompatibilityPolicy once, at construction,
// so an incompatible strategy is rejected before it ever runs. Output is always an ordinary
// GameBlueprint -- there is no parallel "random blueprint" model.
export class RandomGameBlueprintGenerator implements RandomGameBlueprintGenerating {
    private readonly nameGenerator: SlotGameNameGenerating;
    private readonly strategy: RandomGameBlueprintStrategy;
    private readonly createRandom: (seed: number) => RandomNumberGenerating;

    constructor(
        nameGenerator: SlotGameNameGenerating = new SlotGameNameGenerator(),
        strategy: RandomGameBlueprintStrategy = new DefaultRandomGameBlueprintStrategy(),
        compatibilityPolicy: GameMechanicCompatibilityPolicy = new DefaultGameMechanicCompatibilityPolicy(),
        createRandom: (seed: number) => RandomNumberGenerating = (seed) => new SeededRandomNumberGenerator(seed),
    ) {
        if (!compatibilityPolicy.isCompatible(strategy.features)) {
            throw new Error(
                `RandomGameBlueprintStrategy "${strategy.name}" declares mechanic features ` +
                    `[${strategy.features.join(", ")}] that GameMechanicCompatibilityPolicy rejects as incompatible.`,
            );
        }
        this.nameGenerator = nameGenerator;
        this.strategy = strategy;
        this.createRandom = createRandom;
    }

    private static slugify(value: string): string {
        const slug = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return slug.length > 0 ? slug : "random-game";
    }

    private static mintSeed(): number {
        return Math.floor(Math.random() * 0x7fffffff);
    }

    public generate(request: RandomGameBlueprintRequest = {}): RandomGameBlueprintResult {
        const resolvedSeed = request.seed ?? RandomGameBlueprintGenerator.mintSeed();
        const random = this.createRandom(resolvedSeed);

        const mechanics = this.strategy.build(random);
        const {id, name} = this.resolveName(resolvedSeed, request.overrides);

        const blueprint: GameBlueprint = {
            manifest: {
                id,
                name,
                version: DEFAULT_MANIFEST_VERSION,
                description: `Randomly generated video slot (seed ${resolvedSeed}).`,
            },
            ...mechanics,
        };

        return {
            blueprint,
            seed: resolvedSeed,
            provenance: {generatorVersion: GENERATOR_VERSION, strategy: this.strategy.name, seed: resolvedSeed},
        };
    }

    private resolveName(seed: number, overrides?: RandomGameBlueprintOverrides): {id: string; name: string} {
        const overrideName = overrides?.name?.trim();
        if (overrideName === undefined || overrideName.length === 0) {
            const {title, slug} = this.nameGenerator.generate({seed});
            return {id: slug, name: title};
        }
        return {id: overrides?.id ?? RandomGameBlueprintGenerator.slugify(overrideName), name: overrideName};
    }
}
