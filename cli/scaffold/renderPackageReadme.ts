import {PokieGameManifest} from "pokie";

// A short orientation doc for a hand-editable POKIE game package (pokie create/pokie init/the
// GamePackagePreparer lifecycle) -- the hand-editable counterpart to renderGeneratedPackageReadme.ts,
// which documents the wholly-generated "pokie build" package instead.
export function renderPackageReadme(manifest: PokieGameManifest): string {
    return `# ${manifest.name}

A POKIE game package. \`src/index.ts\` implements the \`PokieGame\` contract -- edit it (and add whatever
else your game needs under \`src/\`) to build out your own game logic.

## Workflow

\`\`\`
npm install
npm run build

npx pokie inspect .
npx pokie validate .
npx pokie sim . --rounds 10000 --seed demo --out sim.json
npx pokie report sim.json
npx pokie replay . --seed demo --round 1
npx pokie dev .
\`\`\`

\`npm run build\` compiles \`src/index.ts\` to \`dist/index.js\` -- the same path \`package.json\`'s \`main\`,
\`exports\`, and \`pokie.entry\` fields all point at (see \`tsconfig.json\`'s own \`outDir\`). Every command
above (and any other POKIE tool) loads this package through that compiled output, never the TypeScript
source directly, so re-run \`npm run build\` after every source change before reloading it.

## Moving or copying this package

If \`package.json\`'s \`"pokie"\` dependency is a \`file:\` path (check it -- \`pokie init\` writes this whenever the \`pokie\` installation that scaffolded this package has not been published to the npm registry yet, e.g. a dev checkout, an \`npm link\`ed target, or a pre-release tarball install), that path points at this exact machine's own \`pokie\` installation. Moving this package elsewhere on the same machine is fine, but copying it to another machine or environment and running \`npm install\` there from scratch will fail unless either \`node_modules\` is copied along with it (no reinstall needed), a matching \`pokie\` installation already exists at that same path there, or \`pokie\` has since been published and you replace the \`file:\` spec with a version range (e.g. \`"^1.3.0"\`) yourself.

See [\`pokie\`'s CLI docs](https://github.com/sta-ger/pokie/blob/master/docs/cli.md) for what each
command does and every available option.
`;
}
