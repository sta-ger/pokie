# P6-20 independent host verification — passed

Candidate `f8a90bf40d8bbfb9bb29db6163e6473f8147dd25` was normally built and
packed with Node `v24.18.0`; the package archive was
`sha256:6b23b37723539445196f404d5b345d1135efa26e4d0a578f6e03aef2f8e7577a`.
The supplied read-only companion checkout was clean at
`09a0889b8d335eeacbdb277c37376d97de96c268` before and after verification.

An archive of that exact companion commit installed the candidate archive and
ran its public `npm start` Vite workflow. Its visible Fixture Slot **Play**
rendered `A/C/A | A/A/C | A/A/A`, credits `1004`, win `5`, and `5x`.

The candidate built the tracked 3x3 Fixture Slot Blueprint into a real package;
that package installed the same archive and ran its public `npm start`
(`pokie dev`) workflow. Visible **Start new session** and **Spin** with seed
`fixture-round` rendered the identical round and amounts.

One fresh local Studio process and fresh headed-browser profile then used only
rendered controls and browser mouse/keyboard input: **Play** → advanced seed
`fixture-round` → **New Play session** → **Spin**, followed by **Replay** →
**Session Spin** → **Refresh** → the rendered Session 1 / Round 1 row. Both
Studio surfaces rendered the identical Player round. The two screenshots below
are the only retained images; checksums are in `SHA256SUMS`.

No generated package, package archive, browser profile, automation source,
server log, or full raw log is retained.
