# P6-06 bounded Studio browser evidence

Reviewed candidate: `b11ecb25d23057fb53692b2bd401468718f071cf`.

These rendered screenshots are the representative successful paths from the
fresh Studio browser rerun. They intentionally exclude browser drivers,
process/Chrome logs, workspace fixtures, failed attempts, and duplicate
transcripts.

- `02-literal-preview.png` — literal reel preview.
- `04-counts-and-stack-draft.png` — count-derived length and authored stack
  rule.
- `05b-common-save-complete.png` and `06-after-fresh-studio-restart.png` — the
  completed per-reel model reaches the shared save surface and its count/stack
  model remains available after a fresh Studio restart.
- `07b-existing-per-reel-symbolweights-config.png` and
  `07-existing-per-reel-symbolweights-preview.png` — existing per-reel weights
  can be configured and previewed.
- `09-shared-weights-saved-sample-seed-default.png` — saved shared weights use
  the disclosed reproducible sample (seed 1).
- `10-shared-weights-resampled-seed-2.png` — deterministic resampling changes
  that sample to seed 2.
- `10b-shared-weights-conversion-analysis.png` and
  `11-converted-sample-generated-reels-draft.png` — the seed-2 sample exposes
  its weight-to-count conversion and can be converted into an unsaved generated
  reel draft.
- `12-after-fresh-studio-restart-shared-weights.png` — the saved shared-weight
  source is rendered again after a fresh Studio restart.

`CHECKSUMS.sha256` is the sole integrity record and covers every retained
screenshot.
