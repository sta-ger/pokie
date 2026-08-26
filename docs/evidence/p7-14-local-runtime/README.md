# P7-14 independent packed local-runtime rerun

Candidate: `add0a0d242d96c6fd46098446cace9f0335a7d48` (`pokie@1.3.0`).
Verified 2026-08-26 on Node `v24.18.0`.

## Fresh public package

One candidate build was made, then `npm pack --ignore-scripts` produced the package used below.
Its SHA-256 was `16409af9362b0744dbfddb885d954ff9b1e8b02ecd98eade7d8d80c05fac299b`.
In a new temporary directory, the public fixture game was copied and installed with:

```sh
npm install --ignore-scripts --no-audit --no-fund /tmp/.../pokie-1.3.0.tgz
./node_modules/.bin/pokie --version # 1.3.0
```

All runtime commands below used that installed `./node_modules/.bin/pokie`, never this checkout's CLI or its `node_modules` self-dependency. The package's public `README.md`/`docs/cli.md` supplied the `serve`, `client`, `dev`, `/health`, `/game`, `/sessions`, spin, restore, and `--port 0` workflow.

## Bounded runtime transcript

```text
$ pokie serve <fresh-game> --host 127.0.0.1 --port 0
serve_start port=40349
GET /health                              200 {"status":"ok"}
GET /game                                200 playable-game@1.0.0
POST /sessions {"seed":"p7-14-independent"} 201 session created
POST /sessions/:id/spin {"requestId":"p7-14-spin-1"} 200 screenRows=5
GET /sessions/:id                        200; id/credits/win/screen match the spin

$ pokie client <fresh-game> --host 127.0.0.1 --port 0 --api-host 127.0.0.1 --api-port 40349 --no-open
client_start port=39277 api_port=40349
GET /                                    200; title="POKIE client", rendered spin control present
GET /config                              200 {"apiBaseUrl":"http://127.0.0.1:40349"}
SIGINT client; listener on 39277 absent
SIGINT serve; listener on 40349 absent

$ pokie dev <fresh-game> --host 127.0.0.1 --port 0 --client-host 127.0.0.1 --client-port 0 --no-open
dev_start api_port=46171 client_port=42541
GET /health, /game                       200; playable-game@1.0.0
POST /sessions                           201 session created
POST /sessions/:id/spin                  200 screenRows=5
GET /sessions/:id                        200; id/credits/win/screen match the spin
GET client /                              200; title and spin control present
GET client /config                       200 {"apiBaseUrl":"http://127.0.0.1:46171"}
SIGINT dev                                exit=0; API and client listeners absent

$ pokie serve <invalid-directory> --port 0
exit=1: Could not load a POKIE game package from "<invalid-directory>".
        Run `pokie validate "<invalid-directory>"` to diagnose the package, then retry.

$ pokie serve <fresh-game> --host 127.0.0.1 --port 38925 # occupied loopback port
exit=1: POKIE dev server could not listen on 127.0.0.1:38925 because that address is already in use.
        Stop the process using it, or retry with --port <number> (or --port 0 for an available port).
```

The two failing commands contained only the concise recovery messages shown above: no stack trace, `Error:` prefix, Node internal path, or `EADDRINUSE` implementation code. Standalone server/client processes exit with the conventional SIGINT code 130 while their listeners are confirmed absent; `dev` owns both servers and completes its graceful handler with exit 0.

Transient full logs were discarded after this summary. Their retained SHA-256 checksums were:

```text
serve    3df04573546136fef80c681b16def565e82529e128605f993180abba0c0af465
client   64d92e1632f436cc19048ccb8c2e843a871035dd607dafa791bf262dfe891392
dev      040e18e48c4bec8f9aa7790e48112bb17d65d930c4cbf64393c4147d0bb445bb
invalid  35f7a078d66ffc83243fbe818b31a8813dac7869b9ed1a4b4c849fc5d05baf96
busy     cea76e98b2e71816efad3318bf4626d58ab84ea41951efb1c9629599a2656758
```

## Required whole-file contracts

```sh
npm run test:targeted -- tests/cli/cliCommandInventory.contract.test.ts tests/cli/client/clientPresentation.test.ts
```

Passed: 2 suites, 1076 tests, 0 snapshots (2.17 s).
