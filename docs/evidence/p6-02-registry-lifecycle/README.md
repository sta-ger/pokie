# P6-02 registry lifecycle

Independent browser verification of candidate
`2472e2614ca75f5a2ebc12e75976814c3d3a7edc` passed the managed-project
relocation lifecycle. A clean Studio/Chrome run created a managed Blueprint,
the host moved that exact artifact unchanged, and the rendered Projects UI
showed `(missing)` and **Relocate**. The visible Relocate action restored one
canonical managed row, which remained usable after a fresh Studio restart.

- `browser-workflow-transcript.txt` is a condensed final browser-observation
  transcript of the successful UI workflow.
- `managed-save.png`, `missing-relocate.png`, `relocated-canonical.png`, and
  `restarted-canonical.png` are representative rendered states.
- `relocation-integrity.txt` and `registry-after-relocation.json` preserve the
  artifact hash/inode check and the final single canonical registry record.
- `CHECKSUMS.sha256` verifies the retained evidence payload.
