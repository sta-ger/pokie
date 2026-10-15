# V2C-13 independent public-workflow observation

Candidate product identity: `ac581e39e0cd121a870a9b15ee176811f9181f5b`.
The candidate source tree was clean before and after the controller-owned
targeted test receipt and before this verifier's evidence-only record.

## Bound test receipt

The authorized controller receipt at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/13b6da3faae14bec8f560371/result.json`
records the exact candidate before/after as clean, return code 0, and the
terminal summary: 13 suites passed, 866 tests passed. Its stdout SHA-256 is
`b053f1f790fc22d55673cd034329e58826f075f1c89ef4d0ac095130e39bf1a9`;
stderr SHA-256 is
`ecbe1e11846e632665dd7a770150a54dca01b55d63a3dbef1b46a83c1a88af91`.
No test was rerun.

## Candidate build and two fresh Studio launches

The neutral launcher built the candidate once with `npm run build-cli`.
Its authenticated receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/candidate-builds/ac581e39e0cd121a870a9b15ee176811f9181f5b/result.json`:
candidate tree `75aec7b757ff57a160d06b073a4fe346f147a06e`, compiled-output
SHA-256 `631ef38f33bfafab09e25fc1b8e93397afdaf8df9c44aa671631387b59d4e9c0`,
8,776 files, build-log SHA-256
`1461f568b7acb5052e24afb542d2ee2ab5b768ddfa2fb3aefa443e87d299e21b`.

Launch 1 transcript:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-30-55-836Z/transcript.json`
(SHA-256 `bf21db20849189d18c5a4de8c35d49b312df31c2d49f3e4d9c9be762b9de3bc9`).
The rendered Home workflow created/saved the starter project, then Play
completed one spin. A seeded workers=1 Studio simulation accepted job
`97c763c10d044b20af02dc38a89f6fb1` and completed 100/100 rounds. Its real
browser download was 1,994 bytes with SHA-256
`be7c0c3c624a31e89759ad09b1c8d67927cd544887b1ec06508d5a5037142107`;
the downloaded JSON records seed `v2c13-sequential`, config hash
`sha256:d28efc34ce7b0e14651afcf2b2b5ed4489d071cd9b164381440485c7442ddceb`,
and the public reproduction command. Seed replay then completed job
`b4e9465fc6ae40718ce7a5c321ecc644`, session
`a462a306-91d5-4b57-9ac7-5c0f096191ef`, with the same seed and full round
artifact. Visual review was performed on the Home, simulation, and replay
screenshots; each was readable and visually coherent.

Launch 2 transcript:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-33-24-429Z/transcript.json`.
The rendered Home server-side picker listed the isolated fixture and loaded
then explicitly saved `wild-sticky.blueprint.json` as `wild-sticky` v1.0.0.
Studio reported 0 errors and four warnings (two never-land symbols and two
wild-frequency warnings). The independently inspected overview screenshot is
`2-observation.png` in that run.

## Disposition

These are partial observations only. They do not demonstrate all six
capabilities or recovery states, generated ordinary and weighted packages,
XLSX round-trip, workers>1 seed partitioning/state isolation/cancellation, the
known A/W2/W3 payout, or matching HTML/Markdown reports. No product defect is
claimed from those uncollected branches. Both Studio children were closed by
the neutral launcher; no runtime artifact, profile, generated package, or raw
log is committed here. Packaging and official full/release gates remain
deferred.

## Recovery collection revision

This revision reused the authenticated candidate build and did not rerun tests.
Two further fresh-profile Studio launches completed and their owned children
drained before this record was written.

The first transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-38-18-862Z/transcript.json`
(SHA-256 `788bee3aa38f94edef2c6f4cb3b531ae3ff2cb7680812d2c6790ee68139329e9`).
Rendered Home and Project screens loaded and saved `wild-sticky.blueprint.json`,
then submitted a Simulation with 200 rounds, seed `v2c13-sticky-workers`, and
`workers=2`. Its queued and terminal receipts identify job
`191065c54c8d40d08e6ca6bc7bc78921`; the full report records 200 executed,
sticky, rule-application and multiplied-component steps, total bet 10.00,
total payout 600.00, config hash
`sha256:e5e82037d6c83e75b726d37327920f5c72e8ddc0bbf7f42b33c23ef0ffe73584`,
and a public reproduction command with `--workers 2`.

The same launch completed TypeScript package job
`6580e02cfeab4d9aa38dbc752b31df14` through rendered Build/Export and then
opened it with the visible `Open as Project` action. Studio rendered a
read-only `Playable game`. A seeded public Play session
(`v2c13-generated-sticky-play`) rendered one completed A/W2/W3 round: stake
0.05 and payout 3.00 (unrounded transport payout `3.0000000000000453`).
Independently inspected screenshots: saved authoring view `1-observation.png`
(SHA-256 `9730995703582790fd0d6bfe5fcb8e67654a57abb38cf8f33c4db95290d9b3d3`),
multi-worker report `2-observation.png` (SHA-256
`eaa263f108905ab6a731321d06ff09a4bd61d15ca20b2a0f40d3bbecf3f005df`), and
Play result `3-observation.png` (SHA-256
`a0f5928a46afdd9e28b135f8d92b7de9068775058d62d895ea72195a9ef4b02a`).

The distinct retry job `d0e56a14d9a34991aa735fc2f5578832` completed 200
rounds before the driver could dispatch Cancel. It is not cancellation-cleanup
evidence and no cancellation result is claimed.

The second transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-48-16-845Z/transcript.json`
(SHA-256 `56945558723136ef60013e51ef221cd4884b080ade1cef268cdb0d99b7c382b8`).
It loaded and saved `generated-reels.blueprint.json` through Home/Project and
opened its public Outcome Library generator. Its rendered preflight states that
exact enumeration has 12,337,920 raw combinations. This is a mechanism
preflight only, not completed ordinary/weighted execution or an XLSX round trip.

### Current independent disposition

This adds public save/materialization, a generated package loader, seeded
generated-package Play with the known payout, and sticky multi-worker
accounting. It does not prove all six authoring capabilities and their
ordering/coordinates/restrictions/lifetime, malformed/stale recovery, catalogue
sweep, HTML/Markdown reports, ordinary/weighted comparison, XLSX round-trip,
state isolation, or cancellation cleanup. Those rows remain not reached. No
candidate-owned product failure was observed. Packaging and official
full/release gates remain deferred; no runtime payload is committed.

### Continued fresh-profile recovery

Three additional fresh-profile Studio launches reused the same authenticated
candidate build and added no product-code changes. The first,
`run-2026-10-15T08-57-48-285Z`, exercised the rendered generated-reels
Whole-sequence editor. Selecting that mode rendered the expected malformed
empty-variant validation surface; adding a variant rendered its required ID,
relative-weight and ordered-symbol inputs. A single `Cancel sequence changes`
activation did not itself render a terminal recovery state, so it is not claimed
as a successful cancellation. Selecting the visible Per-reel mode once restored
the valid original model without Save or Build. The transcript SHA-256 is
`812a37660a5a61947d4827dacdd8cd4bfaf5efb0204acd19e21c99e16b38d4c3`.
Independent visual inspection found the malformed-editor capture readable
(`1-observation.png`, SHA-256
`e39a3ccfbcf47581567a07b8cd7f08cf82c919316c6e80c60477be8d65ea7aa4`)
and the restored per-reel view readable (`2-observation.png`, SHA-256
`4ae26e849b2ed828375d94c84086af2dd91e406ec1c45edf1d8a42c92baf311f`).

The second launch used a mistakenly inferred application-profile directory.
Its public Load action rendered its own exact missing-path error; no fixture
observation from that run is claimed. The corrected harness records that
driver repair and its closed transcript SHA-256 is
`7e74675e63b754031c8b24398a541336bd6ddbfb9eca3641ad37b8aa275763fd`.

The third launch used the actual launcher-provisioned path, loaded
`wild-transform.blueprint.json` through rendered Home, awaited its local
valid-with-warnings state, and activated the public `Save game` action. The
action rendered its pending state then navigated to the editable `Wild
transform` Project overview. That screen identifies `wild-transform` v1.0.0,
the isolated fixture location, and the public Play/Simulation/Replay/Build
entries. Visual inspection found the overview and its four visible validation
warnings readable and coherent; it is still only partial authoring evidence.
Its transcript SHA-256 is
`78029bd4081beb8f78a99318c945596adede9a9817cc8823bf0c878920930711`;
the screenshot SHA-256 is
`74c6236ef22ca21cadc3bb9e3db2ffaa6ea86703cd15fb177b20759236a900c9`.

These recovery observations do not complete the six-capability matrix, reload,
stale-build protection, ordinary/weighted package execution, XLSX round trip,
catalogue/report sweep, worker partition comparison, state isolation, or
cancellation cleanup. They therefore do not change the incomplete disposition
above. The controller-owned 13-suite/866-test receipt remains the sole test
execution used here; packaging and official full/release gates remain deferred.

### Fresh focused recovery collection

Two further fresh-profile Studio runs reused the same candidate build and are
retained only as runtime references. The first transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T09-11-58-908Z/transcript.json`
(SHA-256 `c5d8e2a0c1120139611a04e50144db5cb03e905f00d7690af3d0c7b65d119140`).
It loaded `wild-transform` by the rendered Home form, saved it through the
visible `Save game` action and reached its editable Project overview. It then
loaded `generated-reels`, captured the per-reel surface, and selected the
visible Whole-sequence variants radio. The UI rendered five empty weighted
variants and disabled preview/apply with the local validation error. Activating
`Cancel sequence changes` left that same deliberately selected whole-sequence
mode invalid. This is not claimed as a product failure: source confirms the
mode radio first applies `setReelGenerationMode` to the Home draft, while that
button only restores the whole-sequence editor's definitions from its current
source (`ReelGenerationModeSelector.tsx`, `WholeSequencesEditor.tsx`, and
`blueprintFormOps.ts`). No Save or Build followed the malformed state. Visual
inspection found the malformed and post-cancel screenshots readable:
`4-observation.png` SHA-256
`03f51b25ca4130312a6288ffa92f82d782134a76a878219c56d88915bed27aa5` and
`5-observation.png` SHA-256
`7797149196fa086dd532f8449aead76a62115d3aba2752b1d1ecac9b98e8e151`.

The second transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T09-16-37-071Z/transcript.json`
(SHA-256 `8bce97765b7cc30335277de80c13a32e4f3f24c79c4e44db7beb56b4ed633bbb`).
It loaded and saved `wild-sticky` through the rendered Home/Project workflow,
then submitted one Simulation with 500,000 rounds, seed
`v2c13-sticky-cancel-20261015`, and workers `2`. The accepted job
`6e7f13a8126d4022a3efed43f8ae30ad` rendered queued, running, cancellation
requested, and durable cancelled states. It stopped at 355,000/500,000 after
23.879 seconds; the Recent runs surface stated `No completed simulations yet`.
Thus the run supplies actual multi-worker cancellation/cleanup evidence without
claiming a partial result as completed. The independently inspected terminal
screenshot `1-observation.png` is readable and has SHA-256
`3da266d694efc2bf1bef5e5f4317c89b8de25ffe75e8c32f10521b865792daa1`.

This additional collection still does not establish complete ordinary/weighted
package execution, XLSX export/import/rebuild, catalogue/report coverage,
six-capability authoring, explicit reload, worker partition comparison, or
independent session state. Those acceptance portions remain not reached.

### Public package and final focused collection

The retained public-CLI receipt
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/public-packages-2026-10-15T09-25-30.625Z/receipt.json`
authenticates a clean evidence-only descendant of the candidate before and
after 37 public `dist/cli/pokie.js` commands. It built the six wild example
blueprints as TypeScript packages, then used the public `sim`, `replay`, and
`report` commands with each recorded `v2c13-public-*` seed. Each command has
return code zero and bounded hashed stdout/stderr. The sticky workers=2
simulation records 12/12 rounds, total bet 0.60, total win 36.00 and modifier
totals 12/12/12/12 with config hash
`sha256:e5e82037d6c83e75b726d37327920f5c72e8ddc0bbf7f42b33c23ef0ffe73584`.
The separately authenticated partition receipt
`public-packages-2026-10-15T09-27-00.162Z/receipt.json` compares its two
derived worker seeds (`::worker0/2`, `::worker1/2`) against that workers=2
record: rounds, stake, payout, and all four modifier counters agree exactly.
JSON, Markdown and HTML report files are runtime-only and are not committed.

The final fresh-profile rendered Studio transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T09-31-40-754Z/transcript.json`
(SHA-256 `be57018f97adea671a5c71018da2cf93881328094c8d1e94684ea281175f4fbf`).
It used the candidate's public `node ./dist/cli/pokie.js --no-open` entry and
a new application profile. After the advanced disclosure was visibly expanded,
Home loaded `wild-transform.blueprint.json`; the action rendered disabled
loading state and then the loaded `wild-transform` identity and validation
state. `Save game` likewise rendered local pending state before the editable
Project terminal `project-open-materialization · Completed` (244 ms). The
Project Game Model rendered ordered mechanics including `Rule 1: transform,
transform, evaluated [[0,0]]; B → A`, `W2`/`W3` factors and substitution.

The same isolated launch separately loaded and saved `wild-sticky`, then its
Project Game Model rendered `Rule 1: sticky, sticky, evaluated [[1,0]]; W2,
lifetime 3`; its own project materialization terminal completed in 21 ms. The
same browser transcript contains the exact local pending and terminal
observations for both Save actions, and its owned child drained through the
file-channel `close`. Independent visual inspection was performed on all five
captured screens. The Home loaded-form screen, editable transform overview,
and sticky model screen were readable, coherent, and showed the stated
identities and controls. Their screenshot SHA-256 values are respectively
`1459e5c009399787166970e7c431f05ded4e4d8a39128c2429e90d847ea51689`,
`782b98277316b9bfe50df84eb0470373400afd3179a119a5c9399a241c83564a`, and
`3906e0bf47cd32395b5f73a4d29e190b03024c85c8f9d446e08b40d0bade8044`.

This is still a partial independent collection, not approval: four rendered
capabilities, explicit reload, complete malformed/stale recovery, ordinary and
weighted whole-sequence package executions, XLSX round trip, full catalogue
sweep, and independent worker-session isolation remain uncollected. The
controller-owned targeted receipt remains the only test invocation; packaging
and official full/release gates remain deferred.

### Fresh wild-reel save, reload, Play, replay and download

The controller-owned targeted receipt at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/13b6da3faae14bec8f560371/result.json`
was read together with its complete stdout/stderr. It identifies clean candidate
`ac581e39e0cd121a870a9b15ee176811f9181f5b` before/after, exit 0, and
13 passed suites / 866 passed tests; no test was re-run. Current HEAD
`50adb0252ae7c4f3a99069018dbc53643329d7ad` is the clean evidence-only
descendant (its only earlier diff from the candidate is this evidence record).

Fresh Studio run
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T09-53-42-748Z/transcript.json`
(SHA-256 `d0a2257f7df50b28aef13711e5f104d85a8c18f73e7c83c69d23d0c2788cd09a`)
used `node ./dist/cli/pokie.js --no-open` with isolated application and browser
profiles. Through the rendered Home form it resolved and loaded
`wild-reel.blueprint.json`; Load rendered disabled/loading and then `Save game`.
The Reel strips surface visibly showed B, W2, W3 and its declared reel modes.
Save rendered its local pending state, materialized `Wild reel` Project, then
Close project → public Projects → Open explicitly reloaded that project. Both
materialization terminals were rendered.

In the reopened Project, an actual Play session spun once. Its accepted local
pending `Spinning…` terminalled as one subround at stake 0.05 with A/W2/W3,
total win 3.00 and multiplier 60. The public seeded Replay then used seed
`v2c13-wild-reel-replay`, replay job
`22d0a86248934533be9e6723544918eb`, session
`3914be0b-5a1b-425f-89d9-4c9d479c842c`, and config hash
`sha256:76f0e8d64cf065282ddf214d59f1aa678e86285c72734376b6cf881c25c1fb07`.
Its exact local lifecycle moved queued 0/1 to completed 1/1. The resulting
public JSON download was observed through the browser download channel:
`wild-reel-1.0.0-22d0a86248934533be9e6723544918eb.json`, 7,959 bytes,
SHA-256 `db1d7f2688bc2e67b19777037d3faa0c7486865b819f634ff7ed222c7afaf515`.
Its decoded bytes match the rendered session, seed, game/version, round 1,
stake 0.05, A/W2/W3 screen, total win 3 and config hash. Runtime download and
browser files are not committed.

Independent visual inspection found the reel-editor, Play-result and replay
screens readable and coherent. Their screenshot SHA-256 values are respectively
`597a0553fe43b6326f826617488a2205a6f826faaf0cee0cb424470efc3b1be6`,
`936c3383dc98c16e1dc901bbc360f65c094078412e4c8f8c53562a324cb54ec3`, and
`4e2d2872f48deb1d8da650c744a05f28407c4608845236005a3f158e62eae71b`.
The interactive control returned close and subsequent process inspection found
no owned Studio/Chromium process. The launcher transcript did not write its
optional final `ended_at`/`cleanup` fields before its process exited; retain
that as a transport-record limitation, not a product failure.

This newly closes explicit wild-reel save/reload, exact Play, seeded replay and
download branches. It does not complete the six-capability matrix, malformed /
stale recovery, catalogue and sticky lifecycle sweep, all rendered reports,
ordinary/weighted rendered package routes, or the remaining worker evidence.

Receipt reconciliation also authenticated the later non-rendered public
comparisons already retained by this same harness. The clean 15-command
weighted receipt `public-packages-2026-10-15T09-49-36.952Z/receipt.json`
preserves ordered transform plus sticky rules, W3 factor 0 and empty
substitutions across build → extract → XLSX export/import → rebuild and seeded
simulation/replay. Its `session-isolation.json` records three independently
created public runtime sessions with an untouched second-session snapshot and
matching first-round sessions. The earlier ordinary comparison completed the
same 15 real public commands before an intentionally invalid *subsequent*
weighted fixture exited 1; that failed preparation is not an ordinary runtime
result. Finally, `public-packages-2026-10-15T09-27-00.162Z/partition-comparison.json`
authenticates workers=2 sticky rounds, stake, payout and all four modifier
counters against the two derived worker seed partitions. Together with the
separate rendered durable cancellation transcript, these records close the
worker accounting/isolation/cancellation subbranches; they do not replace the
still-missing authoring and catalogue coverage.

### Continued rendered authoring recovery

Two further isolated Studio profiles were launched from the candidate public
entry (`node ./dist/cli/pokie.js --no-open`) after repairing the persistent
harness checklist to begin with the first missing Home editor branch. Neither
run repeated the targeted tests, package/XLSX collection, nor the accepted
worker collection.

The first closed transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T10-07-23-851Z/transcript.json`
(SHA-256 `0ce20e5bad3a8097b9ec42fd56fbb5b8ee4e5411d2ac6bab3c75f4a425ee6553`).
Through the rendered advanced Home loader it loaded the isolated
`wild-expanding`, `wild-multiplier`, and `wild-restricted` fixtures and selected
the visible Bets tab. The resulting controls expose the authored modifier
surface: W2/W3 substitution policies and targets, factors, ordered-rule
description, explicit add-rule choices, and for expanding the existing
`Rule 1: expand` with evaluated coordinate space, W2 symbol, reel 1/row 0.
The three captures have hashes `4454a0169340aefc181665f24363203ca1af372dac593d0946cc03ddf537204e`,
`c7ff72ae8f95dec8b2d44d48bded38c9c2726ef88b1230bcc3ad0682faac8bef`, and
`50751c459f8c9071bd13b7f1f2ddd96d6b468079753e3ffc73b3f20b265491ff`.

The second closed transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T10-08-27-049Z/transcript.json`
(SHA-256 `fd24e05ea222b8c99adc368ded84bf8203f8109fe08c31365614b60a4e96f850`).
It reached the same `wild-restricted` public editor and focused its real
read-only W2 substitution-policy combobox. The visible option list contained
`unrestricted` and selected `restricted`; the independently inspected capture
SHA-256 `b23a88f881ca1d0678b9e0f6b734889734d1046d303f450d7f654fdb3e31ac70`
also visibly shows the empty W3 target restriction, W2 factor 2, W3 factor 0,
and the four add-rule controls. Both interactive children were closed through
the file channel before this evidence update.

These are authentic partial rendered observations. They still do not establish
the complete six-capability ordering matrix, a full malformed/stale/cancel
recovery sequence, every catalogue item through rendered Play/simulation/replay,
or the rendered sticky acquire/retain/expire trajectory. Those reviewer rows
remain not reached; no candidate-owned defect is claimed.
