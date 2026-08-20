# P6-20 candidate binding transcript — report repair

The requested candidate is `30613c63af2085d6bcd9e6546847769a1da63d50`.
The supplied read-only companion checkout was clean and at the requested
`6bb67dee3d2e8e98bab754e1000019701a17266b` HEAD.

`npm run build-cli` completed from the candidate. Two fresh public Studio
launches were then used at a rendered 1050px browser width. Both commands used
the normal `./node_modules/.bin/pokie --no-open` entrypoint, which resolves to
`node_modules/pokie/dist/cli/pokie.js`, not this worktree's freshly built
`dist/cli/pokie.js`. The served page referenced stale assets
`index-C1406RUB.js` and `index-BYljzUTd.css`; the candidate build contains
`index-CSug-t-n.js` and `index-BUJgmJpG.css`.

The stale client rendered the old Projects table and its Open controls beyond
the 1050px right edge. That observation is deliberately not reported as a
candidate finding. The two allowed public launches are exhausted, so the exact
candidate could not be browser-verified without exceeding the request's launch
bound. No screenshot or generated project/output artifact is retained; this
single transcript is the complete retained proof.
