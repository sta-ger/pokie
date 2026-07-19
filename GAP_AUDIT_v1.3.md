# POKIE v1.3 — Gap Audit

Дата: 2026-07-19. Ветка на момент аудита: `develop` (HEAD `10716a7`).

Аудит сверяет фактический код/тесты на `develop` с product-roadmap v1.3 (CLI/tooling, simulation depth,
deterministic replay/artifacts, server/session runtime boundary, Studio, reel strip core, PAR sheet
interoperability, weighted outcome libraries + pre-generated runtime, Stake Engine interoperability,
certification evidence bundle, provably-fair, External Adapter SDK, buy bonus/ante bet/per-bet-mode stats,
modern mechanics, org/npm migration, docs site/playground, XLSX gaps, test depth). `docs/*.md` формулировки
использовались только как вспомогательный источник, не как истина — каждый пункт проверен чтением
кода/тестов.

## CLI/tooling — DONE

Все 18 команд (`build/create/init/inspect/validate/sim/report/diff/replay/serve/client/dev/par
import|export/stakeengine export|import/outcomelibrary build|validate/certification build|verify/fairness
verify/studio`) реализованы в `cli/commands/*` с реальным (не smoke) покрытием в `tests/cli/`.

Расхождение: секция "What's next" в `docs/cli.md:2649-2655` устарела — называет уже реализованные команды
"планируемыми" и не упоминает `par/stakeengine/outcomelibrary/certification/fairness/studio`. Косметика:
`ServeCommand.test.ts` не покрывает документированный `--port 0`.

## Simulation — смешанно

- Depth, bulk RTP (`Simulation`, `AggregateSimulationRunner`, play strategies) — DONE.
- Workers (`ParallelSimulationRunner`, `SimulationWorkerCoordinator`) — DONE, тесты сквозные.
- Confidence intervals (`ConfidenceIntervalCalculator`, интегрирован в `SimulationAccumulator`, Welford-merge
  для параллельных воркеров) — DONE, только для Monte-Carlo слоя (для `WeightedOutcomeLibraryAnalyzer` не
  нужны — там точная статистика по полному перечислению).
- Feature/base/bonus breakdown (`SimulationRoundCategoryDetermining` + Explicit/StakeBased/Fallback
  determiners, `SimulationReportBuilder`) — DONE.
- **Convergence/adaptive early-stop — MISSING.** Ноль совпадений на "converg/tolerance/earlyStop/adaptive" —
  симуляция всегда идёт заявленное число раундов.
- **Per-bet-mode статистика на live/`pokie sim` слое — MISSING**, при этом на offline-слое
  (`WeightedOutcomeLibrary`, Stake Engine export) `betMode` — реальное поле. Несовпадение: `pokie sim` против
  мульти-bet-mode игры даёт один смешанный RTP без разбивки.

## Replay / RoundArtifact / reproducibility — в основном DONE

`ReplayCommand` → `ReplayRecorder` — честный best-effort (признано в самом коде), `buildRoundArtifactFromSession`
не пересчитывает исход повторно, `PokieJsonRoundArtifactProjector`/`RoundArtifactValidator` полные и
протестированы, `PreGeneratedRoundReplayer` — единственное место, где воспроизведение действительно
**точное** (не best-effort). PARTIAL: нет отдельного инструмента для диагностики расхождения public/internal
состояния живой сессии — только то, что можно собрать вручную через `RoundArtifact.debug`.

## Server/session/runtime boundary

- Persistence (`SessionRepository` + `InMemorySessionRepository`/`FileSessionRepository`) — DONE, реально
  плагинится.
- Idempotency (`IdempotencyRepository`, `SpinCommandHandler.handleSerialized`) — DONE, актуально на develop.
- Public/internal split (`PokieDevSessionResponse`/`PokieInternalSessionData`, `?debug=1`) — DONE.
- **Transactions — PARTIAL, реальный gap.** `SpinCommandHandler.playAndSettle()` — debit→play→credit→save→
  idempotency-save раздельными await, best-effort try/catch компенсация. Сам код документирует: при падении
  процесса между шагами компенсация не сработает, кошелёк/сессия могут разойтись.

## Studio — в основном DONE, два реальных product gap

Global/Project mode (`StudioContextResolver`, единый 409 "No active project." на всех project-scoped
роутах), Mechanics Editor Apply (атомарный commit, `applyGameBlueprintToProject.ts`), Outcome
Libraries/Pre-Generated workflow, PAR Sheet Import/Export, Deployment/External Adapter SDK UI — все DONE,
frontend↔backend без разрывов, тесты поведенческие (`StudioServer.test.ts` ~3320 строк, `*Workflow.test.tsx`).

- **Certification/Provably Fair — MISSING в Studio**, только CLI.
- **Stake Engine — PARTIAL**: import через Outcome Libraries работает, `pokie stakeengine export` в Studio не
  выведен вообще.
- Архитектурная деталь (не функциональный gap): generic `StudioToolHandling` seam — мёртвый код
  (`StudioCommand` никогда не передаёт `toolHandlers`), все команды на деле — bespoke роуты.

## Reel Strip constraint-driven core — DONE

Все 8 заявленных constraint-классов существуют и протестированы (`src/reels/constraints/*`,
`tests/reels/constraints/*`). Отдельного "modeler" сверх generator+analyzer нет — это зона ответственности
Studio, не core.

## PAR sheet interoperability — PARTIAL, содержательный gap

`ParSheetExporter`/`ParSheetImporter` (exceljs) явно отклоняют `reelStripGeneration`/`symbolWeights` как
lossy. Но **`GameBlueprint.winModel`, `.mechanics` (включая `freeGames`) и `.betModes` вообще нигде не
маппятся** в `src/parsheet/` — молча теряются при экспорте, без ошибки/warning, в отличие от задекларированной
lossy-границы для reel generation. Неконсистентный, недокументированный gap.

## Weighted Outcome Library / Pre-Generated Runtime / Outcome Library Bundle — DONE

Точное перечисление, потоковый writer/reader (никогда не буферизует весь mode в памяти — подтверждено
чтением `streamModeOutcomesToTempFile.ts`/`readOutcomeAtByteRange.ts`), идемпотентность на
`/pregenerated-sessions`. Без замечаний.

## Stake Engine — PARTIAL

Байт-в-байт round-trip реально протестирован. Поддержка чисто статическая/batch — ноль хитов "stake" в
`src/server/`, нет live-моста для RGS-потребления в реальном времени. Плюс: полностью параллельный
код-путь от External Adapter SDK (см. ниже) — Stake Engine не реализован как `ExternalDeploymentTarget`,
хотя концептуально это именно то, что SDK моделирует.

## Certification Evidence Bundle — DONE

`CertificationEvidenceBundleBuilder` реально отказывается собирать бандл без чистой deep-validation
источника, сэмплы индивидуально проверяемы.

## Provably Fair — DONE в библиотеке, PARTIAL в CLI

HMAC-SHA256 commit-reveal — настоящий, end-to-end round-trip протестирован. `pokie fairness` CLI имеет
только `verify` — `commit`/`reveal` подкоманд нет (признано в коде как future work).

## External Adapter SDK — PARTIAL

Пайплайн (descriptor→compatibility→projection→generation→artifact-validation→diagnostic→delivery) реализован
точно как задокументировано. Реально работающая цель ровно одна — `createLocalJsonExternalDeploymentTarget`
(local filesystem). Никакой реальной RGS-интеграции через SDK нет, Stake Engine подключён мимо этого SDK.

## Buy bonus / Ante bet / Bet-mode per-mode stats — все три MISSING как поведение

`BetMode` (`src/gamepackage/BetMode.ts`) — чисто декларативные данные (id/label/costMultiplier), собственный
doc-комментарий: "nothing in the runtime session-construction path reads a bet mode at all". Ноль хитов
"buy/purchase/BuyBonus" и "ante/Ante" во всём `src/`. `GameSessionConfig`/`VideoSlotConfig`/paytable-слой не
знает о bet mode — только offline-слой (stake-engine export, WeightedOutcomeLibrary) использует его как
ярлык. Крупнейший product gap аудита относительно современных ожиданий рынка.

## Остальные современные механики (`src/session/videoslot/`)

- Resizable grid / Megaways-style — DONE.
- Cluster pays — DONE (`ClusterWinCalculator`/`ClusterWinEvaluator`/`ClusterDetector`).
- Multipliers (accumulating, injectable combine) — DONE (`MultiplierResolver`).
- Cascades/tumble — DONE (`CascadingSpinResolver`).
- Expanding/sticky wilds — PARTIAL: есть generic-примитив `SymbolOverlayTransformer`, но нет именованного
  класса.
- Hold & Win / Lock & Spin — MISSING как отдельный класс (композируемо из существующих примитивов, но
  нулевой код сегодня).
- Jackpots (progressive/fixed) — MISSING, только упоминания в комментариях/фикстурах.

## FromStan org/npm migration — MISSING, не начато

Нигде никаких следов — `package.json`, README, git remote всё консистентно на `sta-ger/pokie`. Бренд/бизнес-
задача, не код.

## Docs site / playground — MISSING

`docs/` — 23 плоских `.md`, без генератора сайта, без `docs:build` скрипта. Ни CodeSandbox/StackBlitz, ни
интерактивной песочницы. `cli/client` и Studio — не playground в смысле API-песочницы.

## XLSX import-export gaps — PARTIAL, коррелирует с PAR sheet gap

Нет маппера для `BetMode`/`BetModes` вообще — bet modes физически не могут пройти через PAR XLSX туда-обратно.

## Tests/benchmarks/golden/property

246 тестовых файлов, 79 директорий, поведенческое покрытие подтверждено по каждому проверенному подсистемному
блоку.

- Бенчмарки — MISSING, вообще нет.
- Property-based testing — MISSING, только example-based.
- Golden-output snapshot testing — MISSING (есть input-фикстуры, но не output-snapshot).

## Что реально требует breaking change → в v2

Почти ничего из найденного не требует breaking change — культура проекта (optional ctor params/interfaces,
декораторы вроде `AbstractVideoSlotSessionDecorator`) позволяет добавить всё это аддитивно в v1.3. Единственный
по-настоящему пограничный пункт:

- **Настоящая кросс-стор атомарность** в `SpinCommandHandler` (wallet+session+idempotency как единая
  транзакция) при сохранении текущей модели "любой из трёх стораджей плагинится независимо" архитектурно
  тяжело сделать атомарной без mandated единого transactional store — это ломает текущую композиционную
  модель и лучше подходит для v2. v1.3-совместимый паллиатив — idempotent reconciliation/retry при старте,
  без полной гарантии.

Всё остальное (bet-mode/buy-bonus/ante как decorator, per-bet-mode sim stats по образцу существующего
category-breakdown, convergence config, PAR-mapper для winModel/mechanics/betModes, Studio-поверхности для
certification/fairness/stakeengine-export, Stake Engine как ExternalDeploymentTarget, Hold&Win/Jackpot как
новые decorator-классы, fairness commit/reveal CLI) — additive, совместимо с v1 контрактами, кандидат на
v1.3.

## Приоритетный список на завершение v1.3

1. PAR sheet: перестать молча терять `winModel`/`mechanics`/`betModes` — либо смаппить, либо явно отклонять
   как lossy (по образцу `reelStripGeneration`).
2. Bet-mode как первоклассный, но optional runtime-хук (decorator/feature-detected interface для ante-bet
   stake-modifier и buy-bonus forced-entry) — без него per-bet-mode stats бессмысленны за пределами меток.
3. Per-bet-mode статистика в live `Simulation`/`pokie sim` — переиспользовать паттерн
   `SimulationRoundCategoryDetermining`.
4. Studio: поверхность для Certification/Evidence Bundle и Provably Fair (сейчас только CLI).
5. Studio: `pokie stakeengine export` в UI (симметрично уже реализованному import).
6. Convergence/adaptive early-stop для Simulation (optional tolerance-конфиг).
7. Разрешить архитектурную развилку Stake Engine vs External Adapter SDK — либо реализовать Stake Engine как
   `ExternalDeploymentTarget`, либо явно задокументировать намеренное разделение.
8. Reconciliation/retry-паллиатив для non-atomic spin-sequencing в `SpinCommandHandler` до полной
   v2-атомарности.
9. Hold & Win и/или Jackpot как конкретные decorator-классы (композируемо из
   `SymbolOverlayTransformer`/`FreeGamesRoundHandler`/новый pool-примитив).
10. `pokie fairness commit`/`reveal` CLI-подкоманды — библиотечная commit-reveal машинерия уже готова и
    протестирована, не хватает только CLI-глагола.

Ниже приоритета (инфраструктура/полировка, не product-gap): бенчмарки, property-based тесты,
golden-snapshot тесты, docs-сайт/playground, FromStan-миграция — зафиксировано как MISSING, но сознательно
не в топ-10.
