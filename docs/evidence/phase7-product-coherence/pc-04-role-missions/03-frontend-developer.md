# Frontend-developer mission

**Starting goal only:** “I was handed a POKIE game package. Get the browser
player working against it and tell me what I can hand to a frontend teammate.”

**Fresh context:** `/tmp/pc04-frontend-developer-H2qP/`, with real
`handoff-package/` as the only domain artifact. The role used root/client/dev
help, rendered URLs, and visible player controls, never source or a private
service contract.

| # | Natural action | Observation and recovery | Created or read |
| --- | --- | --- | --- |
| 1 | `pokie validate handoff-package --format json`; read `client --help` and `dev --help`. | Validation exit 0; help explains `dev` combines server and browser client. | Read: `handoff-package/`, help. |
| 2 | `pokie dev handoff-package --port 0 --client-port 0 --no-open` | Product printed an API URL and browser-player URL. | Read: package. Created: ephemeral local endpoints. |
| 3 | Opened announced browser URL in a fresh profile. | Player showed game, stake, spin, and result; one spin returned a round result. | Read: rendered player/API through product UI. |
| 4 | Stopped server then selected Spin; restarted same public command. | UI rendered a recoverable connection failure rather than stale success; new announced client URL restored play. | Read: visible recovery. Created: replacement endpoints. |
| 5 | Identified handoff material from product output. | Runnable package plus public command and announced browser URL are sufficient for the stock player; no API schema was guessed. | Read: package/controls. |

The package-to-browser player path and stopped-server recovery are coherent.
The two URL labels could more directly say which one a person opens, but
“browser client” was sufficient.

`SOURCE INSPECTION: not performed before completion.`
