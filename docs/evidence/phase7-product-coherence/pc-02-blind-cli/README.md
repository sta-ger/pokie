# PC-02 — independent blind CLI rerun

Run date: 2026-08-27. Candidate checked out at
`3787d371d4d1a0b93056e94bb48d0144c3624b58` with a clean worktree. Before
recording this ledger, the explorer used only npm registry metadata, the
registry README, the installed package manifest, and visible terminal output.
No repository source, tests, prior evidence, findings, or implementation
reports were consulted.

## Fresh public-consumer setup

In a new `mktemp` directory, the following public workflow succeeded:

```text
$ npm view pokie version dist.tarball bin engines --json
{"version":"1.2.2","dist.tarball":"https://registry.npmjs.org/pokie/-/pokie-1.2.2.tgz"}

$ npm init --yes
$ npm install pokie@1.2.2
added 1 package, and audited 2 packages in 583ms
found 0 vulnerabilities

$ npm ls pokie --depth=0
└── pokie@1.2.2

$ node -p "require('./node_modules/pokie/package.json').version"
1.2.2
$ node -p "JSON.stringify(require('./node_modules/pokie/package.json').bin || null)"
null
$ find node_modules/.bin -maxdepth 1 -type l -printf '%f\\n'
find: ‘node_modules/.bin’: No such file or directory
```

The consumer lockfile identifies the installed artifact as
`https://registry.npmjs.org/pokie/-/pokie-1.2.2.tgz`, integrity
`sha512-HC8PYAfj37Yl+DV/gbSiHV/OkcZYisVNUpx1CyGnUSsAsW+jgm1ENAq6VipbXbK9AZHUvHhKacVdYs6PH8tBXA==`.
The public registry README's installation instruction is `npm install pokie`;
it describes an importable JavaScript/TypeScript framework, not a CLI command.

## Observed CLI exploration (frozen)

Because the installed manifest has no `bin`, the natural next step cannot find
an executable:

```text
$ npx --no-install pokie --help
npm error could not determine executable to run
[exit=1]
```

The following follow-on actions were then attempted independently, without
inventing project inputs or modifying the installed package. Each emitted the
same visible error above and exited 1 before command dispatch:

```text
npx --no-install pokie create demo-slot
npx --no-install pokie open demo-slot
npx --no-install pokie build demo-slot
npx --no-install pokie validate demo-slot
npx --no-install pokie serve demo-slot
npx --no-install pokie simulate demo-slot
npx --no-install pokie report demo-slot
npx --no-install pokie replay demo-slot
npx --no-install pokie import ./missing-ledger.json
npx --no-install pokie export demo-slot --output ./out.json
```

## Frozen impact ledger

| Surface | Classification by observed user impact | Result |
| --- | --- | --- |
| Public install / CLI discovery | Dead end | Install succeeds, but no `pokie` executable is installed; help cannot start. |
| Create, open, build, validate, serve, simulate, report, replay, import, export | Blocked follow-on actions | Every action stops at executable resolution, so no command success, validation, generated artifact, or user-facing recovery is observable. |
| Wrong/missing input (`import ./missing-ledger.json`) | Exact public blocker | The missing-file check is unreachable because there is no executable. |
| Relative/absolute/spaced paths; stale output; dry run | Exact public blocker | These are command-level behaviours. They cannot be reached without an executable, so no path or overwrite claim is made. |
| Interruption, duplication, and recovery | Exact public blocker | No command starts and no project/output is produced; there is nothing to interrupt, duplicate, or recover. |
| Misleading language, internal prerequisites, incompatible artifacts | Not observed | The registry README presents a library installation, and this rerun saw no CLI message asserting a hidden prerequisite or producing an incompatible artifact. |

No generated projects, outputs, raw logs, profiles, or automation files are
retained in this evidence tree.
