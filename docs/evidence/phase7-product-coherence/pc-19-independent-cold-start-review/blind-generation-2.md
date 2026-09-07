# PC-19 independent blind cold-start rerun — generation 2

Candidate product anchor: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`.
The checkout differs from that anchor only in retained evidence commits; the
public Studio launch used `node ./dist/cli/pokie.js --no-open` from this
checkout, with a new registry and browser profile for each launch.

## Blind record before source or prior-evidence inspection

Four fresh visible Studio runs were made before any source or retained-evidence
content was read. They showed: starter creation and workspace opening; a real
Spin (`Spinning…` then `Round complete`); Simulation's own `queued — 0/10000`
state followed by its completed 10,000-round report (RTP 100.56%); and exact
outcome generation's own `Generating outcome library…`/`Cancel generation`
pending state followed by `Generated 1,024 outcomes for mode "base" using
exact (RTP 100.78%) into outcomelibrary.` No rendered product error was seen.

The reviewed local artifacts were not retained in the repository. Checksums of
the isolated final-run records are:

```
5f861494cb52774121852c0b560ab82304a663b1cedea465e50a7da3e9b513bd  transcript.json
4dc2b8de5ef245fee83670e9348555abd3f0043cc7d4f9c8432a43a20361228b  after-spin.png
01e57965ea1467470fb1c30329e8981d42ccdc52f86f7412ec0a803edd000aa8  after-run-simulation.png
ab56e57d019698c7d59b1848ee8942b8e3eb9d6e83e24e175468e6eeeb25f0ae  after-generate-exact-outcome-library.png
```

## Gate result

This is not a PASS. The four-launch recovery cap ended before the full six-role
mission set, artifact interoperability, CLI/Studio parity, Studio/examples
player parity, and finding-register/delta gate could be independently covered.
No defect is claimed from those unreached portions.
