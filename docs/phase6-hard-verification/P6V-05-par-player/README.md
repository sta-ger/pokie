# P6V-05 host verification — inconclusive

Candidate product SHA: `bdbe36151ddaf2b37807fc099d6fe9245251e059`.
Read-only companion SHA: `1e2c8c00457f3af389c0168432c08e63ca441465`.
Both checkouts were clean before this retry and remain unmodified.

This focused harness-recovery attempt used the persistent controller-provided harness, repaired in
place before launch. It rebuilt neither product nor companion: the existing candidate `dist/cli`
build was used. Each of the two permitted fresh Studio launches used exactly
`node ./dist/cli/pokie.js --no-open`, a new XDG registry, and a new Chrome profile.

In both launches, the rendered Studio page reached **Design Game**, the visible **Show advanced
options (JSON mode, load/save by path)** action, and the rendered PAR import control. The harness
then clicked that control and waited for a real native picker while using the controller display
contract (search visible dialog, activate it, verify active-window focus before typing). No native
picker window appeared in either bounded wait, so no path was typed and no Import request was
accepted. Studio rendered no product error. The second launch retained the first launch's CDP
page-target repair and additionally used title-independent visible-dialog discovery; it reproduced
the same driver symptom.

Consequently the native-picker import/export round trip was never begun, and the same launch budget
could not safely reach the companion Studio Play/Replay or the separate public Player surfaces.
No product defect was observed. No generated project, workbook, browser profile, log, screenshot,
automation source, or output tree is retained here; this transcript is the bounded evidence.
