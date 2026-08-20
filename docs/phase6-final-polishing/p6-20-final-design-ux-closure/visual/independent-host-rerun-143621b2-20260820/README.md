# P6-20 Projects responsive closure — independent host rerun

Candidate `143621b2c524e4ddd56ea7fc2481bf1d516ce629` was built with
`npm run build-cli`, then served once from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`. A fresh Chrome/X11 profile drove only
visible Studio controls. The required read-only `pokie-examples` companion was
clean at `6bb67dee3d2e8e98bab754e1000019701a17266b` before the rerun.

The filtered desktop registry retained its headers and table row. At 405px the
same Projects entry rendered as a readable single-column labelled card, with no
horizontal overflow; its 80x30px Relocate and 77x30px Remove controls remained
visible. A rendered Relocate click opened the relocation controls and was then
cancelled, leaving the registry unchanged. No rendered product error appeared.

| Rendered proof | SHA-256 |
| --- | --- |
| `01-projects-desktop-registry.png` | `4a1ddea38efaa408092aabafc46c0bf138c0a1607bb6d5b5621afa337ca4c275` |
| `02-projects-405-stacked-card.png` | `ac9c3cfba0859cdd2f1aeedeab0fe9cd9380b754295a7c30dc16f6ea53718451` |
| `03-projects-405-relocate-action.png` | `17521c75a73d4a50d9c49cb795ab9e2e58e282fccfc7058b160c58d9dfb1a7f1` |

Only these three screenshots and the concise action transcript are retained.
The browser profile, Studio process, temporary automation, and logs were
removed after the audit.
