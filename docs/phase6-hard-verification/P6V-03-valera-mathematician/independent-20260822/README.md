# P6V-03 independent cold-start rerun

- Candidate: `c7ce2723c45d6b1dcc7745ebf8850ff2fcf850e1`
- Run: 2026-08-22, one fresh Studio registry and one fresh Chrome profile, both outside the checkout.
- Startup transcript: `POKIE Studio listening on http://127.0.0.1:3200`
- Launch: `node ./dist/cli/pokie.js --no-open` from this rebuilt checkout.

The rendered Studio controls completed one continuous journey:

1. Game Model saved `valera-mathematician` / `Valera Mathematician`; the literal Reel strips editor was used and persisted (`01-model.png`).
2. A Play session settled real rounds and `Find any win` finished with a displayed win of 8.00 (`02-play.png`).
3. Simulation completed 10,000/10,000 rounds (RTP 129.82%; 0.5 s) and registered the saved `valera-mathematician v0.1.0` run (`03-simulation.png`).
4. Replay loaded the recorded Play round: the rendered panel identifies it as a full captured artifact with `valera-mathematician v0.1.0` (`04-replay.png`).
5. Build/Export generated 1,024 exact base outcomes, then rendered confirmation of the four-file Stake Engine export (`05-delivery.png`).

Generated project/output trees are deliberately not committed. Their post-run SHA-256 checksums are retained here as bounded identity proof:

| Item | SHA-256 |
| --- | --- |
| Studio project registry | `ac82813a07a7a0b55b12dc186aa34e9847108d0898496696e56a404fe5fe4a48` |
| Saved blueprint | `7d587f4fdda7ac4d3d82140c122e021a2a419cb90e46965e8459950bef50e71c` |
| Outcome-library registry | `4c9507923e0072b23b06cba308cfabaa7c14ca99ad72e6f89d5f2b631f535f3b` |
| Outcome-library manifest | `4b7f82d07f1fc4ae16a596aac5842e6e7bfedb8118002fb9fb07c56e1476978f` |
| Stake Engine manifest | `0b1ae73bba4de95e0855319c85fd2cc00e0efa5de9dec6a72b4376dd2d044003` |
| Stake Engine index | `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5` |
