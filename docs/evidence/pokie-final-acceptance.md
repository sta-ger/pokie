# POKIE final acceptance

## CURRENT TASK

Гэта самастойная фінальная прыёмка POKIE пасьля audit і Studio
праверкі. Базавая незалежна правераная рэвізія —
`77a9417a810eaeab25c91d307ea3609d32fb926d`. Рэвізія рэалізацыі з
fix і першаснымі evidence —
`3a47e732dbc4e2753f4442fffb5b2c35b74927d4`; continuation evidence
дадзены ў `1d2973394f475f728847825223a29d7965fbefef`.

Паўтораныя continuation gates выкананыя на правераным product SHA
`426577e2708e0c7121f73b38a6a6af1db364e8d6`; `1d297339` дадае толькі
harnesses і доказы, не мяняючы runtime/product source.

External status publication / Google Drive round-trip:
waived by user for this standalone goal; not performed.

## AGENT REPORT

### Вынік і зьмена

Поўны integration rerun пацьвердзіў адну рэальную памежную памылку,
якая не была часткай ужо апублікаванага `77a9417` выніку: калі іншы
працэс ствараў тэчку прызначэньня Outcome Library пасьля bound
preflight, але да retained read, Studio магла перакласьці яе як
corrupt retained bundle. Гэта хавала канфлікт уласнасьці тэчкі.

`StudioOutcomeLibraryGenerateService` цяпер перад выклікам injectable
reader фізічна правярае `manifest.json`. Тэчка без сапраўднага файла
manifest адхіляецца як unsafe existing destination. Такім чынам
caller-owned data ня можа быць "ператвораная" port-валідатарам у
retained bundle. Рэгрэсія пакрыта рэальным artifact-chain сцэнарам:
`StudioArtifactInteroperabilityTorture.integration.test.ts`,
`uses the same prepared artifact chain`.

Дададзены actual-Chromium Studio harness і доказы. Ён запускае
сабраны CLI/Studio, сапраўдны PAR XLSX праз ExcelJS і прызначаны PNG:

- PAR Overview дае `Valid`, а Game Model — read-only canonical model;
- Reel preview паказвае artwork; searchable picker выбірае `A` з
  клявіятуры (`ArrowDown`, `Enter`) і дадае яго ў literal strip;
- Per-reel Reel Strip Modeler праходзіць `Select → Configure → Preview
  → Stop window`: keyboard picker дадае `A`, stop `0 → 1` мяняе
  preview `A,B,C → B,C,A`, а само акно паказвае і PNG `A`, і text
  fallback `B` без artwork;
- Play пасьля Spin паказвае экран, Spin, result і player ў адным
  1280×800 viewport.

Скрыншоты і transcript: [`studio-browser`](pokie-final-acceptance/studio-browser/).
Асобны Chromium parity proof пацьвярджае, што Studio і ізаляваны
рэальны examples host выкарыстоўваюць shared canonical player, а не
другі game renderer: [`pc-12-player-parity`](pokie-final-acceptance/pc-12-player-parity/).
Examples checkout на момант праверкі: `/home/stager/Work/sta-ger/pokie-examples`,
branch `main`, SHA `6497eef6c1e9bd36fb7a1708c0a944833096bece`.

### Compatibility / product decisions

- Resolved default-mode/ante цяпер зьяўляецца часткай resolved model і
  library/config identity: прапушчаны mode азначае дэкляраваны
  executable default, а не неяўны асобны шлях. Гэта захоўвае аднолькавы
  seed + resolved model для runtime, simulation і export.
- Працяглая session persistence патрабуе дэкляраваных package
  serialization/state capabilities. `getSessionSerializer()` застаецца
  optional/additive contract; package без адпаведнай capability ня мае
  права абяцаць lossless game-specific continuation.
- WASM разглядаўся толькі як existing boundary: у бягучым прадуктавым
  surface няма CLI/Studio build/export target. У гэтай задачы не
  дадаваўся fake UI, compiler, runtime або export; wasm не заяўляецца
  як даступная capability.
- Зьмена Outcome Library сумяшчальная па фармаце. Яна сьвядома мяняе
  толькі error classification для ўжо існай тэчкі без manifest: цяпер
  гэта explicit ownership/destination conflict, а не "corrupt retained
  library".

### Audit status and limits

Незалежны review для `77a9417` паведаміў **83 assertions passed / 0
failed**. Незалежная праверка архіву `426577e2` дадала 2 праверкі
destination guard: **85 pass / 0 fail**. Гэта зьнешнія вынікі,
перададзеныя заказчыкам; яны не выдаюцца за незалежна паўтораны тут
audit.

Ніводная audit-знаходка не была адкінутая без доказу. Бягучая прыёмка
пацьвердзіла дадатковы destination-ownership edge case і закрыла яго.
Ранейшы запіс `39 suites / 604 tests` адрозьніваецца ад гэтага
фінальнага rerun; ніжэй прыведзены новы фактычны вынік на кодзе
рэалізацыі.

Рэальны exact Outcome Library workload меў **614,656** combinations
(`28^4`) і заняў **5,719,759 ms** у асобным CLI workflow. Гэта ня
вымярэньне аднаго export і не замяняе resource result ніжэй.

Для асобнага bounded resource gate быў spawned сапраўдны CLI:
`build examples/blueprints/sample-slot.blueprint.json --target
outcomeLibrary --sample 20000 --seed final-acceptance-measurement`.
Ён стварыў 20,000 deterministic bounded-coverage outcomes ад прасторы
184,528,125, artifact **20,175,800 B**, exit 0 за **24,369.668 ms**.
Peak RSS — **233,472,000 B** (`/proc/<pid>/status`, 10-ms sampling),
sampled V8 `heapUsed` peak — **75,865,680 B** (in-process 10-ms
sampling). Гэта не exact/17-million claim і не GC-safe absolute heap
peak; поўны машыначытэльны scope: [resource measurement](pokie-final-acceptance/outcome-library-resource-measurement.json).

## TEST RESULTS

| Gate | Каманда / сцэнар | Статус | Доказ |
| --- | --- | --- | --- |
| Незалежны audit baseline | Вынік, прадастаўлены заказчыкам для `77a9417` | PASS (reported) | 83 assertions passed / 0 failed; не паўтораны агентам |
| Lint, semantic typecheck, build | `npm run build`; `npm run typecheck` | PASS | Build прайшоў пасьля fix; semantic `tsc --noEmit` і Studio client typecheck прайшлі |
| Full unit suite | `npm test` | PASS | 425 suites, 6,631 tests, 0 snapshots, 1,866.835 s |
| Final integration | `FORCE_COLOR=0 NO_COLOR=1 npm run test:integration` | PASS | 39 suites, 604 tests, 0 snapshots, 5,704.628 s |
| Studio-client workflows | `npm run test:workflows` | PASS | exit 0; 18 independently spawned `studio-client-workflows` files on SHA `426577e2` |
| Outcome Library Studio/domain | `npm run test:targeted -- tests/cli/studio/OutcomeLibraryGenerationWorkflow.integration.test.ts` | PASS | 8/8: exact/sampled parity, default/explicit ante, sibling retention/provenance, cancellation/retry |
| Outcome Library real CLI | `npm run test:targeted -- tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts` | PASS | 7/7; exact 614,656 workflow, sampling, modes, checkpoint/resume, cancellation/cleanup |
| Destination drift regression | `npm run test:targeted -- tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts -t 'uses the same prepared artifact chain'` | PASS | 1/1; non-bundle post-preflight destination stays an explicit conflict |
| Built Studio browser acceptance | `node scripts/pokie-final-studio-browser-acceptance.mjs` with Chromium | PASS | [screenshots and transcript](pokie-final-acceptance/studio-browser/); actual ExcelJS PAR, literal and per-reel keyboard pickers, stop-window PNG/fallback and Play viewport |
| Shared player parity | `node scripts/pc-12-player-parity-browser.mjs` with isolated real examples host | PASS | [desktop/mobile evidence](pokie-final-acceptance/pc-12-player-parity/); DOM/style/layout/overflow/pixel checks pass; checkout `pokie-examples@6497eef6` |
| Representative resource measurement | `node scripts/measure-command.mjs … -- node dist/cli/pokie.js build … --sample 20000` | PASS | [20,175,800-B artifact and 24.370-s/RSS/heap record](pokie-final-acceptance/outcome-library-resource-measurement.json) |
| Packaging and installed CLI | `npm run test:packaging` | PASS | 21/21, real tarball, independent install, installed CLI, worker simulation, scaffold and public Outcome Library workflow |

The final integration run emitted Jest's post-success warning that a
worker was force-exited during teardown. It did not fail a suite or
leave the package smoke with lingering worker threads, but it remains a
diagnostic risk worth tracing with `--detectOpenHandles` in a dedicated
follow-up. `npm run test:workflows` also emitted React/Mantine JSdom
`act(...)` warnings while still exiting 0; those warnings are visible in
the command output and are not represented here as a clean warning-free
test environment.
