# PC-12 independent exact-candidate rerun

Candidate `a0808c5c4ad5f40ac9cf008fcce7f452eecba62e` was built once with
`npm run build-cli`. The clean companion checkout was
`/home/stager/Work/sta-ger/pokie-examples` at
`1ecbca95994e19c171fc8cd4aa9065705e9e27b5`.

Two isolated copies of `tests/cli/fixtures/playable-game` supplied the same-game
Studio and superseding fixtures. Their respective `index.js` and `package.json`
SHA-256 values were `b184d1ff6d777a6eecb71a88b31b9c3e5fba7a164a42574cfe372576652d1394`
and `de9edbfd2b553a6cce434fae1e95df9b56e888a965efa6592067140e89a6be8c`.

The supplied runner was executed once through the controller-owned
`PC-12-a1e92b9179e31365/current.mjs` harness. Its isolated packed consumer did
resolve `pokie/client/player` from the candidate tarball, as recorded in
[`current-run/TRANSCRIPT.txt`](current-run/TRANSCRIPT.txt). Before Studio became
ready, however, the runner's `node dist/cli/pokie.js studio <fixture> --no-open`
launch exited because `studio` is not a public CLI command; the candidate CLI
reports [`Unknown command "studio"`](current-run/studio-launch-diagnostic.txt).
Consequently Chromium never started and no
desktop (`1280x800`) or narrow (`390x844`) capture, checksum, rendered interaction,
or comparison can be claimed.

One complete machine-owned targeted command was green: eight suites / 99 tests,
covering `renderPlayer`, `playerParity`, canonical-player, PlayTab, project Play
workflow, `usePlaySession`, `StudioPlayService`, and the companion
`pokie-examples/tests/ui.test.ts`. After the failed runner had written its concise
transcript, its orphaned Vite child was terminated; port checks confirmed that
32192, 51792, and 9229 had no listeners. Temporary fixture and runner data are
not retained.
