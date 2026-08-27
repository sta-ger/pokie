# P8-07 clean-room Studio journey — inconclusive host record

Candidate: `379579246dc4b07da3499ae8187202475c6e016c`  
Verifier date: 2026-08-27 (UTC)  
Launch command: `node ./dist/cli/pokie.js --no-open`

## Bounded public-UI record

The candidate was built successfully before verification.  Two isolated-profile
launch attempts were made against the locally served public Studio; no private
API or product-state injection was used.

1. The first attempt announced `POKIE Studio listening on http://127.0.0.1:3200`,
   then the host CDP harness failed before its first rendered-page read because
   it dereferenced the CDP evaluation result at the wrong nesting level.
2. After that harness-only repair, the second attempt rendered the Studio start
   page at `#/home/design`, titled **Start a game · POKIE Studio**. Visible UI
   included “Create game”, “Choose a different start”, editable game basics,
   automatic validation, and public documentation links. No rendered error was
   present. The harness then failed saving its initial screenshot because its
   temporary `screenshots` directory had not been created.

The two permitted launches were consumed before the required create/edit/
validate/runtime/artifact journey could be driven. This is a **driver**
inconclusive result, not a product finding: the only observed failure was in
host-side evidence capture, and no action-level product symptom was observed.

No screenshots, browser profiles, generated output, raw logs, or automation
scripts are retained here. The source-workspace harness was kept outside this
evidence directory as required.
