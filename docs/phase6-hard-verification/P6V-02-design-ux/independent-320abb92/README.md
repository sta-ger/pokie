# P6V-02 independent browser rerun — bounded evidence

Candidate SHA: `320abb92e0c918d53379407ebc01d7a9d1295793`.

`npm run build-cli` preceded this rerun. One Studio backend was launched from
this checkout as `node ./dist/cli/pokie.js --no-open`; a fresh, visible Chrome
profile then used the Studio client against that candidate backend. The checks
below are rendered UI observations, not private API calls or injected state.

| Capture | SHA-256 | Rendered state |
| --- | --- | --- |
| `01-design-desktop.png` | `02a971eef9c9d14550ae904bb0ad0c9e173060f1eb158f7724c7eeda6c417808` | Fresh desktop Design Game. |
| `02-workspace-overview.png` | `2012445a17467e98fc3e546d12ae409000eb5c1294c50a2f05ccc4cd302c39c1` | Cold-start created Workspace. |
| `03-game-model-summary.png` | `32c8ee254730fa4bf7dd6330ee8112a841b147862c952146db42712c592986b0` | Game Model controls and summary. |
| `04-play-settled.png` | `3e24abf8cb821160709381fe3baa6ef5f84a584222593af59b381ad8f6d4e2f2` | Settled real Play spin. |
| `05-simulation-result.png` | `8f568c4aecab98583ef1d3a362c1f7a7e8a7f49431b1f8e6ceeaaaaad01f69c1` | One-round Simulation result. |
| `06-replay-session.png` | `09b7878f1c29685ec2133ee4e57645cceaecd0277624011f45540bd51bd43b09` | Replay Session Spin. |
| `07-build-export-success.png` | `152b7e26f86c8cad4057394cbde8162f15d6be993735c594b429a5c3bcb6f629` | Exact library and Stake export success. |
| `08-build-export-mobile-405.png` | `5010057de00cc772682e83c1dbc71d7353ac2c998be2a49d0af86aa31865c766` | 405px Build/Export action in viewport. |
| `09-design-mobile-405.png` | `aa2a521c8ab997ed11dd2e059a406fc20e7936aa07f5ca1af8d45550191ba5ef` | Corrected 405px Design Game width. |
| `10-reel-strip-modeler-mobile-405-recovery.png` | `9f220eb648751b22ccdd6ec5c64444696bd553370dbc413ce179ff354f731c25` | 405px Reel Strip Modeler through Select → Configure. |
| `11-runtime-capability-provably-fair-recovery.png` | `3d342b8124b57f1e83c831d28e923de93b573d5f5e2d1a49fd9664eba37bdc8f` | Candidate-built runtime package’s Provably Fair surface. |
| `12-outcome-library-certification-recovery.png` | `ea5331887ecc0c9d10c0eca3e455041b1a19ceea9f2ebc2d3a228562636a283a` | Candidate-built outcome-library project’s Certification surface. |

The 405px Design Game measurement was `scrollWidth=405`, main bounds `[0,405]`,
and inline padding `16px`; the Build/Export primary action was `[39,287.109375]`
with `scrollWidth=405`. Recovery completed the formerly incomplete inventory:
the Reel Strip Modeler was `scrollWidth=405` with 16px padding at 405px; a
candidate-built TypeScript package exposed Provably Fair; its candidate-built
outcome library exposed Certification. No P0/P1/material-P2 or rendered product
error was observed.
