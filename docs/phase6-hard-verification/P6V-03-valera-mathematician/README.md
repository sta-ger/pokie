# P6V-03 independent browser rerun — passed

Candidate: `384750860547c312d67d10b913fa642470cbaad1`.

One fresh visible Chrome profile and a separate empty HOME/XDG Studio registry
were used. Studio launched from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`; no installed self-dependency, private
Studio API action, DOM/state injection, or generated project/output tree is
retained.

Rendered controls covered the Recommended, Random, and Blank choices. The
Valera Recommended blueprint saved into Workspace, closed to Home, reopened
from Projects, completed Play, a 25-round Simulation, Session Spin Replay,
exact Outcome Library generation (1,024 outcomes), and Stake Engine Export
(4 files). A seeded `Valera Random` blueprint generated, created Workspace,
and reopened from Projects. Blank rendered its four actionable validation
errors without being saved.

| Proof | SHA-256 |
| --- | --- |
| `recommended-workspace.png` | `864e1a2583ebd65a643260a664a1b865578aacd914ee3090561c97b9ec974bfb` |
| `build-export.png` | `83b394ca97abbb8c33fa38425f853c4910016a545f7a4ec5e5e3aa8aa1b5fc64` |
| `random-reopen.png` | `5d37ffce3708af861b75ff8767a08e1dc3cb8332deb1d080fde58c1b9452a2e6` |
| `blank-validation.png` | `35f7e8c4942613ebfa88608daf701b2b8752363b2fc97aa831d7d0842c381a73` |

`ACTION-TRANSCRIPT.txt` is the concise rendered-control record. Each retained
file is under 0.5 MiB; no temporary browser profile, registry, automation,
raw log, PID file, or generated output is included.
