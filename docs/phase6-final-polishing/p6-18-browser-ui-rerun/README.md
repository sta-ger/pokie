# P6-18 independent cold-start Studio rerun — passed

Candidate: `edf8d0482df0974e6defc1275ef983fd994cab78`
Date: 2026-08-19 (Europe/Warsaw)

## Result

The public command `npm run dev-studio-client` built and started Studio at
`http://127.0.0.1:3200` when run with the host's installed Node 24.18.0 (the
host's default Node 18 cannot load Vite 8's `node:util.styleText`; this is a
host runtime mismatch, not a Studio interaction failure). This verifies the
corrected public launcher that replaced the prior candidate's missing `studio`
CLI command. A fresh Chromium profile then completed the visible workflow,
without consulting project docs, source, roadmap, or internal terminology.

## Cold-start transcript

1. Studio asked to create a Blueprint Project and exposed **New Blueprint**.
2. Its visible choice question was **Recommended**, **Blank**, **Random**, or
   **Load existing**. I selected the UI-recommended option.
3. Studio reported that it would automatically check the model and offered
   **Create Project**. Creation saved and opened valid, managed `Starter Slot`.
4. The Overview asked the operator to start by playing a round; **Open Play**
   led to **New Play session**, then a visible **Spin** completed a real 6.00
   win (screenshot 1).
5. Simulation's only required input was **Rounds***. I typed `25` through the
   browser keyboard and used **Run Simulation**. The UI reviewed a completed
   `25/25` report (RTP 24.00%; screenshot 2). Its no-seed and low-round
   warnings are rendered guidance, not an execution failure.

No material finding appeared, so no further remediation/rerun was required.
The prior P1 startup finding concerned a different candidate and is remediated
by this successful public-startup and affected Play/Simulation rerun.

## Screenshots and checksums

| File | SHA-256 |
| --- | --- |
| `01-play-spin-settled.png` | `600f582e624fc1d43cf10ca4eb73c777a2ac1104693c460ed5d5d4a05e9a88ea` |
| `02-simulation-report.png` | `ef70e4f531e41c5544693e4c3b1ef2af93acef29b68111b34175273c6498b161` |
