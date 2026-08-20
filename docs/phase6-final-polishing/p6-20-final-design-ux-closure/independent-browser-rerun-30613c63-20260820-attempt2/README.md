# P6-20 independent browser rerun — passed

Candidate source: `30613c63af2085d6bcd9e6546847769a1da63d50`. This checkout is
a documentation-only descendant of that commit (`git diff 30613c63..HEAD --
':!docs/**'` was empty), so the built executable source was exactly the
candidate. The supplied read-only `pokie-examples` checkout was clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b`.

`npm run build-cli` completed, then one fresh Studio process was started with
exactly `node ./dist/cli/pokie.js --no-open`. A fresh headed Chrome profile
drove only rendered Studio controls at a 1050px rendered viewport: entered
`p6-recovery-candidate` / `P6 Recovery Candidate`, selected **Create Project**,
then **Close project** -> **Projects**. The saved row's rendered **Open** button
was fully within the viewport at center `(554, 725)` and was clicked by mouse;
Studio returned to the named Project Workspace. No private API or DOM/state
injection was used.

| Rendered proof | SHA-256 |
| --- | --- |
| `projects-1050-open-reachable.png` | `a262d998ddf68888a1268a5ecb457848d12c28e500d8b4d178a633be50830eac` |
| `reopened-workspace.png` | `62c3dd525702c36c5fe49248f896d1dd62627be2a45bb2e5a9f6617133681509` |

The temporary project, browser profile, Studio process, browser process, and
raw logs were removed after capture. These two screenshots and this concise
transcript are the complete retained evidence.
