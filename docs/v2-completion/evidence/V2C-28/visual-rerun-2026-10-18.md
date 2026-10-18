# V2C-28 public-site visual rerun

Candidate/product identity: `d9b62fb07259c57f54f1f2a56dc85d195e87ebc7`.
The retained `site/.output/build-manifest.json` has SHA-256
`1c55072d131625681bfce493a0772ac44a81ced49b9defe018584167292779ce` and
names that candidate. Each collection launch rechecked its source and emitted-artifact hashes
against that manifest, used `node site/preview.mjs --dir site/.output --port 0`, and closed its
owned preview and browser children. Screenshots remain in the controller-approved harness rather
than being committed.

## Captures and receipts

| View | Runtime path | SHA-256 |
| --- | --- | --- |
| desktop landing, 1280x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-20-27-617Z/01-desktop-landing.png` | `d5083aea82b5c1ed4da0ffa944aa01717c19000826f9217ef45e287020d23d28` |
| desktop documentation/reference table, 1280x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-20-27-617Z/02-desktop-documentation-reference-table.png` | `25b6e8ec4f20925a979eade43acf3fb9f2155a2228c6c79c5097a3b33ac53c5b` |
| desktop corrected WASM, 1280x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-25-18-838Z/01-desktop-corrected-wasm-guidance.png` | `7e82cd01376345358c5bbff6cf58f99648e72b168f6e736f9079f987f5ee49a3` |
| mobile landing, 390x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-28-43-951Z/01-mobile-landing.png` | `81976f4af9e870551b7c74f121ded8fcb7e33c5ef923b49ad9011814c29955f4` |
| mobile documentation navigation/search/prose, 390x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-28-43-951Z/02-mobile-documentation-navigation-search-prose.png` | `7dbc4fdc4dd1c67dec6e2f03919df6519a9b7494e05d2d5c7cbea6dabaf914ef` |
| mobile reference table, 390x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-28-43-951Z/03-mobile-documentation-reference-table.png` | `5143a178e8afdefee1b5ed185ae9560e3235292653badc2b746fdf22e523c182` |
| mobile WASM code/prose, 390x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-29-12-201Z/01-mobile-corrected-wasm-guidance.png` | `c3e78d521cc4d0e88817f1775fc83a8d035d6d4efb4bb05877cd372b159f6d9b` |
| mobile corrected WASM mode guidance, 390x844 | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-29-52-725Z/01-mobile-corrected-wasm-mode-guidance.png` | `effe90e59e60ca4f68d314292811ed41759f63c0e720dd91fae15e2d5d28732a` |

The current mobile transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-29-52-725Z/transcript.json`
(SHA-256 `dd788c465af6fcffbb4a1d900064c8a8c281a44353c3dc65d25f6f8e5abf3eae`).
It records the real public Interop navigation, 390x844 viewport, visible corrected paragraph,
candidate/manifest binding, and `closed_owned_resources=true`. It authenticates the preceding
mobile landing/documentation/table transcript at
`site-visual-2026-10-18T17-28-43-951Z/transcript.json`
(SHA-256 `39c4b5da18ffd02b66a2a80d3edfe7e7f6ad2081266f6df4f7316f4bc8e5ef5c`).

## Keyboard-focus evidence and independent review

The retained desktop transcript
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-28-c747efbb178863b6/site-visual-2026-10-18T17-20-27-617Z/transcript.json`
(SHA-256 `b14e206757d126672bd61343d29c95beee563739d359df33ab7469e4d0468fef`)
records native keyboard transitions through Skip to main content, main, search input, Clear,
focus return to search after Clear, and a search result. Every recorded owner has its bounds,
1280x844 viewport, `focus-visible` measurement and `viewportIntersection=true`. Representative
Skip, Clear and search-result images have SHA-256
`f28adf7c2f72532aa899d514d34cf28ac39fff4b36b7c75403ac3a2c7288a85a`,
`695ebd0d2e25620d9e25fd54d66d55567c781f030ecc3adb3a0b9a877d004bef`, and
`5cb93c41ee6c71c72da2234681b6bf8555a5633fcaae8a913d081bc505b2d6da`.

I independently opened the retained desktop contact sheet and the seven representative images
above. They show readable text and reachable navigation/search controls at both viewports; a
visibly blue focus ring around the focused skip link, Clear button and result; and no page-wide
horizontal overflow. At 390x844 the table's own visible scrollbar contains its 512px table in a
343px scroller while document width is 375px (below the 390px viewport). The final mobile WASM
image visibly states that declared modes accept `--mode <id>`, `sim --mode all` uses the full
round budget per mode, and feature-aware replay supports `--unit logical-round`. No contradictory
rendered observation was found.
