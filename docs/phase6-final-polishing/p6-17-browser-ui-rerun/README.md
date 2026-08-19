# P6-17 independent browser UI finding

Candidate: `4e6b8635640f979462b27f52459e0cadfd987af1`  
Finding: `p6-17-independent-design-ux-audit` (P2)

Using a fresh local Studio/client from this candidate with isolated Studio storage, the natural Projects workflow reached Detect and Register for `tests/cli/fixtures/playable-game`. The next rendered action, **Open**, failed instead of opening the Workspace. The visible recovery message says: “The project directory could not be completed. Try again. If it continues, choose the location again and retry.”

This makes the required Import → Register → Open workflow a dead end and prevents the remaining project-dashboard UX review. No product code or tests were modified.

| Screenshot | Rendered state | SHA-256 |
| --- | --- | --- |
| `03-project-import-disabled-guidance.png` | Blank input safely disables Detect with next-step guidance | `15e1e6c8425ce5c0520748bd64c48a529069b4f4c7b9de376f94ff3c0142d299` |
| `04-nonempty-location-detect-enabled.png` | Typed location enables Detect | `42053c1a30a6862dfaab248da7a69f96547931c624ee5ebfae76ff2405fb04ca` |
| `05-project-import-detected-success.png` | Detect recognizes the fixture | `49304b082507985cd7a3428a6d036b586908094f10cfab5869b96252a69ca6a9` |
| `06-project-import-registered-success.png` | Register succeeds and exposes Open | `9fadf2868ba8aa90fcd8713747bb6324a5dc10fdfc370451d094582abb396d2e` |
| `07-registered-project-open-failure.png` | Open failure and recovery message | `ddd72ce47d15cf743564ed424352e6bfb283e3680f78795a5688dc0de75409a9` |
