# P6V-05 host verification — inconclusive

Candidate product SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
Read-only companion SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both checkout status checks were clean before the attempt.

The candidate was built before verification. Two permitted fresh Studio launches then used exactly
`node ./dist/cli/pokie.js --no-open`, each with a separate Chrome profile and isolated XDG registry.
The first stopped before any rendered Studio action because the verifier attached CDP to Chrome's
browser endpoint rather than its visible page. The harness was repaired in place for the second launch.

On the second launch, the rendered Studio UI reached Design Game and its Recommended model, then received
the visible `Create Project` action. The harness incorrectly treated the instructional sentence mentioning
"Workspace" as completion, then could not find a rendered Home control. Studio displayed no product error.
The launch limit forbids a third Studio run, so the required native-picker XLSX round trip and Player
parity matrix were not reached. This is driver inconclusive, not a product finding. No screenshots,
workbooks, profiles, logs, automation files, or generated project/output trees are retained in this repo.
