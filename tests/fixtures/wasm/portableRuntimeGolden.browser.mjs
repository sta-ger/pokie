// Browser-readable twin of portableRuntimeGolden.ts. It is deliberately static
// so the Chromium harness cannot manufacture the artifact under test at runtime.
export const PORTABLE_RUNTIME_BROWSER_FIXTURE = {
    bytes: "AGFzbQEAAAABBQFgAAF/AhUBBXBva2llC25leHRfcmFuZG9tAAADAgEABwgBBHBsYXkAAQo/AT0BAn8DQBAAIgFBgICAgHhPDQALIAAgAUECcHIhAANAEAAiAUGAgICAeE8NAAsgACABQQJwQQF0ciEAIAALALABDXBva2llLmdhbWUudjF7InNjaGVtYVZlcnNpb24iOiJwb2tpZS5nYW1lLnYxIiwicmVlbHMiOjIsInJvd3MiOjEsInJlZWxTdHJpcHMiOltbIkEiLCJCIl0sWyJBIiwiQiJdXSwicGF5bGluZXMiOltbMCwwXV0sInBheXRhYmxlIjp7IkEiOnsiMiI6Mn0sIkIiOnsiMiI6MX19LCJzdG9wV2lkdGhzIjpbMSwxXX0A6wMScG9raWUuY29tcG9uZW50LnYxeyJzY2hlbWFWZXJzaW9uIjoiMS4wLjAiLCJjb21wb25lbnQiOnsiaWQiOiJwb3J0YWJsZS1ydW50aW1lLWdvbGRlbiIsInZlcnNpb24iOiIxLjAuMCJ9LCJzZXJpYWxpemF0aW9uIjp7InNlc3Npb24iOiJwb2tpZS5zZXNzaW9uLnYxIiwicGxheSI6InBva2llLnBsYXkudjEiLCJzdGF0ZSI6InBva2llLnN0YXRlLnYxIn0sImhvc3QiOnsicm5nIjoicG9raWUucm5nLnYxIiwic2VydmljZXMiOltdfSwiY2FwYWJpbGl0aWVzIjpbInJ1bnRpbWUucGxheSIsInJ1bnRpbWUuc2VyaWFsaXplIiwicnVudGltZS5yZXBsYXkiXSwiYXJ0aWZhY3QiOnsiZm9ybWF0IjoicG9raWUud2FzbS52MSIsImFiaVZlcnNpb24iOiIxLjAuMCIsImFkYXB0ZXIiOiJwb2tpZS93YXNtIiwiY29uZmlndXJhdGlvbkhhc2giOiJzaGEyNTY6NDM4MTQ4MzIxZjk5OWI1ZDBlN2VhMTYzYzNkYmJkYzc2YzU0YmVlZWJiYmZiYjBjMGVhMjgxMTA4YjE5NTFmNCJ9fQ==",
    manifest: {
        schemaVersion: "1.0.0",
        component: {id: "portable-runtime-golden", version: "1.0.0"},
        serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
        host: {rng: "pokie.rng.v1", services: []},
        capabilities: ["runtime.play", "runtime.serialize", "runtime.replay"],
        artifact: {
            format: "pokie.wasm.v1",
            sha256: "sha256:bded5fabefa7a8f6d345504491c0e3783f15e272d56bac56dd2fe4f2e467085c",
            bytes: 790,
            abiVersion: "1.0.0",
            adapter: "pokie/wasm",
            configurationHash: "sha256:438148321f999b5d0e7ea163c3dbbdc76c54beeebbbfbb0c0ea281108b1951f4",
        },
    },
    // This browser-safe copy is intentionally checked in rather than derived
    // from the runtime under test. Keep it identical to PORTABLE_RUNTIME_GOLDEN
    // so genuine Chromium verifies the reviewed cross-host contract.
    golden: {
        seed: "wasm-parity-golden",
        commands: [{bet: 1}, {bet: 1}, {bet: 1}],
        continuationCommand: {bet: 1},
        replayRound: 4,
        expected: {
            draws: [0.5967806649859995, 0.5375500756781548, 0.07866769284009933, 0.3642472343053669, 0.5574665090534836, 0.0013346921186894178],
            rounds: [
                {sequence: 1, draw: 0.5967806649859995, stops: [1, 1], screen: [["B"], ["B"]], winMultiplier: 1, stake: 1, payout: 1, creditsBefore: 1000, credits: 1000, command: {bet: 1}},
                {sequence: 2, draw: 0.07866769284009933, stops: [0, 0], screen: [["A"], ["A"]], winMultiplier: 2, stake: 1, payout: 2, creditsBefore: 1000, credits: 1001, command: {bet: 1}},
                {sequence: 3, draw: 0.5574665090534836, stops: [1, 0], screen: [["B"], ["A"]], winMultiplier: 0, stake: 1, payout: 0, creditsBefore: 1001, credits: 1000, command: {bet: 1}},
            ],
            state: {schemaVersion: "pokie.state.v1", seed: "wasm-parity-golden", draws: [0.5967806649859995, 0.5375500756781548, 0.07866769284009933, 0.3642472343053669, 0.5574665090534836, 0.0013346921186894178], sequence: 3, credits: 1000, rngState: 1365295755},
            continuation: {sequence: 4, draw: 0.14641731861047447, stops: [0, 1], screen: [["A"], ["B"]], winMultiplier: 0, stake: 1, payout: 0, creditsBefore: 1000, credits: 999, command: {bet: 1}},
            replay: {round: 4, totalBet: 4, totalWin: 3, screen: [["A"], ["B"]]},
        },
    },
};
