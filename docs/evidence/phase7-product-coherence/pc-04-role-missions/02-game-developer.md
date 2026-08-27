# Game-developer mission

**Starting goal only:** “Create a small game, make it runnable, and try it
locally.”

**Fresh context:** `/tmp/pc04-game-developer-A4mK/`. The role began at `pokie
--help`, followed displayed commands only, and did not inspect source, tests,
or another role’s output.

| # | Natural action | Observation, obstacle, recovery | Created or read |
| --- | --- | --- | --- |
| 1 | Read root and `create --help`. | `--random` was advertised as a valid non-interactive design; `--seed` as reproducible. | Read: public help. |
| 2 | `pokie create Lantern Falls --random --seed 44 --out 'designs/Lantern Falls.blueprint.json'` | Exit 0; created an editable Blueprint and printed a next build command. | Created: `designs/Lantern Falls.blueprint.json`. |
| 3 | Copied the printed next command. | **PC04-GAME-01:** it did not quote the valid spaced Blueprint path; shell splitting failed. The role inferred quoting from the shell error, not private context. | Read: create output; failed command created no product file. |
| 4 | `pokie build 'designs/Lantern Falls.blueprint.json' --target tsPackage --out 'local/Lantern Falls'` | Exit 0; package output could be validated. | Read: Blueprint. Created: `local/Lantern Falls/`. |
| 5 | `pokie validate 'local/Lantern Falls' --format json`; `pokie dev 'local/Lantern Falls' --port 0 --client-port 0 --no-open` | Validation exit 0. Dev printed distinct API/player URLs; normal interrupt was clean. | Read: package. Created: ephemeral local endpoints. |
| 6 | Opened the announced browser-player URL and spun. | Player rendered and completed a real round. | Read: served package/player. |

The creation → package → local-play path worked with real files. PC04-GAME-01
is retained because product-provided copy/paste output breaks a valid spaced
path.

`SOURCE INSPECTION: not performed before completion.`
