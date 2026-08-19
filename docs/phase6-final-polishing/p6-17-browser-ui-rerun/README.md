# P6-17 independent browser UI finding

Candidate: `4e6b8635640f979462b27f52459e0cadfd987af1`
Finding: `p6-17-independent-design-ux-audit` (P2)

Using a fresh local Studio/client from this candidate with isolated Studio storage, the natural Projects workflow reached Detect and Register for `tests/cli/fixtures/playable-game`. The next rendered action, **Open**, failed instead of opening the Workspace. The visible recovery message says: “The project directory could not be completed. Try again. If it continues, choose the location again and retry.”

This makes the required Import → Register → Open workflow a dead end and prevents the remaining project-dashboard UX review. No product code or tests were modified.

Representative rendered proof: `07-registered-project-open-failure.png` (SHA-256 `ddd72ce47d15cf743564ed424352e6bfb283e3680f78795a5688dc0de75409a9`).
