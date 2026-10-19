# POKIE 2.0 candidate preparation

This maintained plan is inert. It identifies planned outputs, not built, verified or published artifacts. Independent editorial review, controller gates, integration and internal status/Drive publication remain pending and controller-owned. None authorizes public release.

## Source and inventory

The implementation starts at `533217e28e77538d537a2563de468ebcd3883e05`. The exact committed candidate and actual implementer checks are recorded in [V2C-30](https://github.com/fromstan/pokie/blob/develop/docs/v2-completion/V2C-30.md) in the repository. For any new build record `git rev-parse HEAD`, require `git status --porcelain` to be empty before and after execution, and bind SHA-256 hashes of actual input/output bytes to that SHA. A build from dirty inputs has no exact committed-source claim. Mutable `develop` source links are navigation, not pinned release evidence.

The bounded inventory below uses null for evidence that does not exist. States mean: planned = no produced bytes asserted; built = actual command/exit/source/hash recorded; verified = additional independent acceptance recorded; published = separately authorized execution and actual receipt recorded. A failed/interrupted command cannot advance a state. Missing artifacts/tools, mismatched hashes and source identities remain pending or failed.

```json
{
  "package": "@fromstan/pokie",
  "version": "2.0.0",
  "node": "^20.19.0 || >=22.12.0",
  "lockfile": "package-lock.json",
  "artifacts": [
    {"id":"runtime","path":"dist/","state":"planned","sourceSha":null,"sha256":null,"command":null,"exitCode":null},
    {"id":"archive","path":null,"state":"planned","sourceSha":null,"sha256":null,"command":null,"exitCode":null},
    {"id":"site","path":"site/.output/","state":"planned","sourceSha":null,"sha256":null,"command":null,"exitCode":null}
  ],
  "externalActions": [
    {"id":"npm-account","owner":"unresolved","access":"npm scope/account administrator; verify @fromstan ownership","target":"@fromstan npm scope/account","authorization":"pending separate explicit authorization"},
    {"id":"npm-publish","owner":"unresolved","access":"verified npm publisher and scope rights","target":"verified @fromstan/pokie@2.0.0 archive, actual filename/hash/source pending","authorization":"pending separate explicit authorization"},
    {"id":"repository-transfer","owner":"unresolved","access":"current repository administrator and receiving organization acceptance","target":"fromstan/pokie target repository; current repository and ownership require verification","authorization":"pending separate explicit authorization"},
    {"id":"github-release","owner":"unresolved","access":"repository tag/release/assets write rights","target":"verified candidate SHA, prospective v2.0.0 tag and verified archive/assets","authorization":"pending separate explicit authorization"},
    {"id":"dns","owner":"unresolved","access":"authoritative DNS zone administrator","target":"pokie.fromstan.com; record values/provider pending","authorization":"pending separate explicit authorization"},
    {"id":"hosting-account","owner":"unresolved","access":"hosting account administrator and billing rights","target":"hosting provider/account/project unresolved","authorization":"pending separate explicit authorization"},
    {"id":"deployment","owner":"unresolved","access":"verified deployment rights on selected static host","target":"verified complete site/.output/ and build-manifest.json; pokie.fromstan.com target","authorization":"pending separate explicit authorization"},
    {"id":"linkedin","owner":"unresolved","access":"verified LinkedIn author/account posting rights","target":"reviewed linkedin-draft.md; final account and content pending","authorization":"pending separate explicit authorization"},
    {"id":"medium","owner":"unresolved","access":"verified Medium author/publication posting rights","target":"reviewed medium-draft.md; final publication and content pending","authorization":"pending separate explicit authorization"}
  ]
}
```

Unresolved owners are explicit blockers, not assigned responsibility or verified access. Every external action requires its own owner, verified access, exact target/source/artifact and explicit authorization. Historical receipt chronology cannot satisfy these fields.

## Local preparation and independent acceptance

Controller preparation, after dependencies are available from the root lockfile:

```sh
npm run build
npm run site:build
npm run site:preview
```

These are existing local scripts. Runtime build inputs are `src/`, `cli/`, generated `src/index.ts` via `generate-barrels.js`, `write-cjs-package-json.js`, `tsconfig.prod.json`, `tsconfig.cli.json`, `tsconfig.client.json`, Studio's TypeScript configuration and `cli/studio-client/vite.config.ts`, plus package metadata and the lockfile. Dist contains `esm/` and `cjs/` JavaScript and matching `.d.ts` declarations; CJS receives its own package marker. CLI includes `dist/cli/pokie.js`, player/client HTML/CSS/JS/declarations, Studio's bundled `dist/cli/studio-client/`, and CLI's runtime copies in `dist/src/`. No built paths are asserted to exist by this document.

Root ESM/CJS exports and ESM-only `browser`, `wasm`, `client/player` subpaths follow package.json. There is no CLI export subcommand. Portable graphs must not read Node package metadata. `src/PokieVersion.ts` is portable runtime identity; metadata agreement is tested. Game-authored versions and independent schema/ABI/API versions are not package versions; see [changelog](../../CHANGELOG.md).

The npm `files` allowlist intentionally delivers dist, source, LICENSE, README, CHANGELOG, named maintained guides/support, selected executable Blueprint examples and dossier template. Historical step receipts and launch drafts are excluded. The static site is not included. Local dependency installation temporarily uses the actual running unpublished installation, restores authored ranges/portable locks on success/failure/cancellation and removes only owned staging. Runtime cache identity includes version and installed executable bytes; old verified cache evidence does not prove this candidate. No user artifacts are migrated.

Archive creation/inspection and packaging acceptance belong to the controller, not this implementation worker. `npm pack --json --pack-destination <owned-directory>` invokes `prepack` and rebuilds through `npm run build` (including `prebuild` lint). Capture the actual `filename` from its JSON result; inspect that exact archive and record its SHA-256, size, command, exit code and source SHA. Never assume a placeholder archive exists. Fresh consumer installation and official packaging/integration/workflow gates remain controller-owned. The disabled registry does not prevent local packing.

For the independent static output use `site/content.json` and `site/.output/build-manifest.json`: candidate SHA, sourceHashes, artifactHashes, CLI/export contracts, gallery WASM and sidecars, bundles, routes, search and downloads. A version change changes descriptors/module bytes and requires a fresh site build. Prior-step hashes are historical only. Hand off the complete directory, including build manifest, directory-index routes, trailing-slash redirects and a real HTTP 404 response for unknown routes. See [site handoff](https://github.com/fromstan/pokie/blob/develop/site/README.md). Source-input hashes must match the committed source; generated artifact hashes must match delivered bytes. Do not infer exact-source identity from manifest HEAD alone.

Failed site builds invalidate the deployable manifest and clean owned staging. Preview rejects missing/invalid output and Ctrl-C drains owned connections. Build/preview success does not establish deployment. For every produced artifact retain command, exit code, exact source SHA and actual byte hashes; directory artifacts use their file-hash inventory. Do not mark unbuilt output as built. Missing or failed acceptance remains explicit. This plan introduces no release controller or new evidence protocol.

## Conditional future external execution

Only after independent candidate acceptance and separate authorization for each register row may an authorized owner use the verified archive and SHA. Future examples (not scripts/hooks and not commands to run during preparation): `npm publish "$VERIFIED_ARCHIVE" --registry https://registry.npmjs.org --access public`; create/push the approved tag at the verified SHA, then `gh release create v2.0.0 "$VERIFIED_ARCHIVE" --repo fromstan/pokie --target "$VERIFIED_SHA" --notes-file CHANGELOG.md`. Confirm repository/asset/account targets first. These variables must refer to actual accepted bytes and source, never a rebuild or guessed filename. Do not enable workflow automation to execute these instructions. Repository transfer, DNS/account configuration, hosting/deployment and each post require their own separately authorized operations.

`publishConfig.registry` remains `https://publication-disabled.invalid`. The GitHub publication workflow has no dispatch, credentials or executable publishing route. npm pre/post lifecycle hooks and their invoked scripts, generated package scripts and tracked workflows must remain inert for external actions. The historical authorized-release runner refuses before commands, credentials, network or receipt writes, including when supplied credentials or historical green gates. Historical PC-20/P8-05 receipt validators remain readable and confer no current authority. No custom Git-hook configuration is introduced; the clone's local pre-commit hook only runs changed-file ESLint.

[LinkedIn](https://github.com/fromstan/pokie/blob/develop/docs/v2-completion/linkedin-draft.md) and [Medium](https://github.com/fromstan/pokie/blob/develop/docs/v2-completion/medium-draft.md) drafts require independent editorial review and distinct posting authorization. ISC attribution/AS-IS terms remain in [LICENSE](../../LICENSE). No account ownership, service availability, hosting, commercial support or SLA is established here.
