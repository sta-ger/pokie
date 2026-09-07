# PC-19 independent cold-start record

- Candidate: `169c80f839758285d02de55eb72008e750e48a53`
- Dependency lock digest (SHA-256): `755c40dc3a866cc206cd2548b151c1de8e96b102b4bee8aac5682ffaed1fef54`
- Installed package digest (SHA-256 of `node_modules/.package-lock.json`): `414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`
- Fresh rendered-run transcript digest (SHA-256): `2370764ca64557015fd830cf4fac1078deec2452aba2a0e70268f145e85825f9`

The reviewer began without reading source, roadmap, prior evidence, recovery history, or known findings. The candidate was built and Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open` and a new Studio/browser profile.

Observed public UI results from the fresh final run:

- The starter design rendered valid in every visible design section.
- One enabled `Create game` activation rendered its local checking state, then `Your game was saved. Opening its workspace…`, then the project workspace.
- The workspace rendered the overview, player entry (`Open Play`), Simulation, Replay, Game Model, and Build/Export surfaces. Game Model rendered its saved five-reel, three-row design; Build/Export rendered ready local destinations and an exact 1024-combination Outcome Library preflight.

No product defect was observed. This review is nevertheless incomplete: the public-launch cap was consumed while repairing the generic visible-UI driver, before the independent run could execute `Start Play`, `Run Simulation`, replay loading, Outcome Library generation, export, all six role missions, CLI/Studio parity, and examples-player parity. No pass or finding is claimed from this partial evidence.
