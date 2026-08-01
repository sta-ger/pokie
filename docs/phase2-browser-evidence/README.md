# P2-POLISH-26 local browser evidence

These PNGs are a reproducible local-browser evidence pass for the final POKIE Studio Phase 2 verification. They
were captured on 2026-08-01 with Google Chrome 138.0.7204.183 after building the task clone (`build-esm`,
`build-cjs`, `build-cli`) and running the built `pokie studio` server against a temporary deterministic package
created with `pokie create phase2-evidence-game --random --seed 42`.

Each route was loaded directly via its stable hash URL, allowed five seconds of virtual time to settle, and then
captured at 1440x1100. This pass establishes real browser rendering, deep-link/refresh behavior, visible
prerequisites and disabled-action explanations. It does not claim to have performed a write action in the sample
package; those route/state/action transitions remain covered by the linked React Testing Library fixtures in the
Phase 2 inventory and workflow-audit matrix.

| Artifact | Route and settled visible state | SHA-256 |
| --- | --- | --- |
| `home-design.png` | `/home/design`: blank Blueprint Workspace with validation/build prerequisites visible | `528a2a3b752dac020a76d75795a31a651b6d7a26932de85182f4ff06bbf830e8` |
| `home-open.png` | `/home/open`: Open Project surface | `d9532626f4bbeb114526614b154a4b4621504fcb29767daf4630da7d33ff27b4` |
| `home-advanced.png` | `/home/advanced`: independent Advanced Tools forms | `bf052b3cba8fda06f49e718a6330eaaae2e18ba3f82afb98d866e9002c13599b` |
| `project-overview.png` | `/project/overview`: loaded generated-package overview and validation next action | `744a91921ae3beceb14b415e24757b97935ba33e9c552ba8d3f0b02821b00407` |
| `project-validate.png` | `/project/validation`: validation surface before a run | `e6a1d4211f079dc0a51191630895bb98c5600c2af1db97492ab23e821166560e` |
| `project-simulation.png` | `/project/simulation`: initial Simulation & Reports surface | `6b6e8589a07b8dd1442ea88e3e03d104c5c18c2d01c31947b305fe9d5e85307d` |
| `project-replay.png` | `/project/replay`: source-choice replay surface | `e98032f885936d5dc6b9df397e4d7f735ac8e62bb208d0b6f66c3c1a76d32f62` |
| `project-runtime.png` | `/project/runtime`: stopped runtime with actionable session/debug prerequisites | `bc92b7ad43e0d3dac8cf8da8f489207c02ef93e382ed2474ddca05f05d6c42ba` |
| `project-export-deploy.png` | `/project/exportDeploy`: target discovery/selection shell | `2d3e154623c2c42a07c4864b0fa104080954d80ccee5adfcd53eaa78fd65117e` |
| `project-deployment.png` | `/project/deployment`: selected local-example target and explicit missing-build preflight blocker | `47dddcd40a68448ca6598476b8cb2fc3cfdecca710222604a4ede6e999a22e30` |
| `project-outcome-libraries.png` | `/project/outcomeLibraries`: registry, generation and provenance prerequisites | `88d072ef52ed9bb33460b8e333643ce280557e11c64d9c410d0a5ab21315fc71` |
| `project-mechanics-editor.png` | `/project/mechanicsEditor`: mechanics workspace | `33b2ae249c8002e531df85d2d72dc699585d11bb493d8ca28984230f53a50714` |
| `project-certification.png` | `/project/certification`: source/mode configuration surface | `81950775119b3832843f5147d98c75072f7aeeb7c1f45f49b65ea4b463c6eb06` |
| `project-provably-fair.png` | `/project/provablyFair`: Configure/Generate/Verify workflow | `b03c826efc7524d5e019b694ecc95cf8dee4cc64e3be66641932336c2cbcfe5b` |
| `project-stake-engine-export.png` | `/project/stakeEngineExport`: canonical-library input and disabled Preview prerequisite | `04b224539c8999b9b1667e27bfe3676d042d84240f84cfc03053287461540769` |

The task/campaign publisher is responsible for post-merge status publication and the Drive round-trip. Those
external confirmations are intentionally not represented by a static browser artifact.
