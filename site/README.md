# Public site

The explicit maintained inventory is `site/content.json`. It publishes only named guides and examples, not campaign logs. Guides use CommonMark plus tables, parsed by the repository's installed Prettier Markdown parser. Raw HTML and unsupported Markdown nodes fail the build. There are no CDN dependencies, hosted APIs, tracking or preference storage.

From the repository root with the lockfile dependencies installed:

```sh
npm run site:build
npm run site:preview
# Optional ephemeral port: npm run site:preview -- --port 0
```

Build output: **site/.output/**. Preview defaults to http://127.0.0.1:4174 and reports the actual URL. Ctrl-C closes the owned server and connections. The site is a static HTML/CSS/JavaScript artifact, independent of Studio and runtime `dist`. Runtime builds cannot erase it, and the npm `files` allowlist does not package `site/`. Downloads are explicitly copied into the site; their availability does not imply they are in an installed npm package.

The build inspects the real CLI registry, validates JSON examples with the production Blueprint/policy validators, compiles TypeScript examples against public source exports, rewrites repository links, and crawls the rendered pages/search URLs/assets/downloads/fragments. `build-manifest.json` records candidate SHA, inventoried source hashes and inspected contracts. Build failure is unsuccessful, removes the prior deployment manifest and removes its staging output. Preview refuses missing/unvalidated output. Rerun the build after fixing the reported source/example/reference. No runtime/Studio production build or package installation is part of the site build.

For static deployment, hand off **the complete contents** of `site/.output/` with its manifest. The intended origin is **https://pokie.fromstan.com**, at the domain root. Assets and downloads use root-relative paths. Configure directory indexes (`/docs/architecture/` → `docs/architecture/index.html`), trailing-slash redirects and `404.html` as the custom error document with an actual **404 status**. Do not use an SPA fallback to `index.html`; unknown addresses must show recovery links. Direct deep links, refresh and browser history use ordinary HTML navigation. Hosts that lack custom 404 support need an equivalent explicit error route. Preview implements these same directory/error semantics locally.

Links between inventoried site guides stay local; explicit repository-guide links retain their maintained detail instead of being aliased to summaries. Source links intentionally continue to the repository's `develop` tree during separately controlled deployment. The candidate manifest identifies the checked source; no public hosting or branch availability is asserted. Source/example links are checked for local existence before rewriting, and Markdown heading references are validated. The actual ISC `LICENSE` is copied unchanged. Search indexes only this inventory, has section titles/excerpts, and failure leaves ordinary document navigation available. Native links/inputs/buttons and an always-visible wrapping mobile navigation avoid overlay focus traps.

Focused regression entrypoint (controller also runs its own required gates):

```sh
npm run test:targeted -- tests/cli/CommanderHelp.contract.test.ts tests/cli/studio-client/src/components/home/DocumentationLinks.test.tsx tests/v2/PackageIdentity.test.ts tests/v2/PublicDocsSite.test.ts
```

The site test builds real output and owns a documented preview, Chromium process and temporary profile. Set `CHROMIUM_PATH` to a working Chromium executable if discovery fails. Missing tooling is a test failure, never a passing skip. Browser assertions cover desktop/mobile layout, navigation/history/deep links/404, keyboard access and search success/failure/stale responses. Independent rendered review and controller gates remain required; these tests cannot approve the campaign or authorize deployment.


The public gallery at `/gallery/` and playground at `/playground/?example=lines` bundle their own local ES modules and Worker. Vite rejects Node builtins in this graph; generated fixture WASM/sidecars, runtime modules and sources are hashed in the build manifest. Preview serves `.wasm` as `application/wasm` and modules as JavaScript. No Studio server or remote runtime is needed. Reload resets work without local-storage restoration. Dynamic downloads bind to the current validated model and settings. See [the reproduction contract](content/playground.md).

The named `tests/v2/PlaygroundGallery.test.ts` exercises built rendered actions in real local Workers, downloadable byte identities and shared-library reproduction, using a browser proxy that permits only localhost. Controller-owned mandatory verification and professional visual review remain separate authorities.
