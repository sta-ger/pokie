# P6-02 host browser verification — candidate `8e43fb6`

Status: **finding** (`p6-02-browser-runtime-isolation`, P1).

This is an independent run on candidate `8e43fb69ce1a50202859c52f2a6be6a88bf8d451`. It rebuilt the candidate with Node 24.18.0, started a fresh Studio server with Project A (the real two-mode outcome-library bundle), and used a separate fresh headless Chrome profile. The driver discovers rendered controls, sends physical pointer/keyboard events, captures screenshots and visible text, and never calls Studio APIs or changes browser DOM/application state.

The visible workflow began at Project A's public legacy route `#/project/play`, selected A's `buyFeature` outcome mode, created and spun a session, then used the visible Projects UI to detect, register, and open Project B. Project B correctly started without A's mode or round state (`06-*`, `07-*`).

However, `05-project-a-play-state-url.txt` records the initial A entry still as the unscoped `#/project/play`. Four physical browser Back-button actions returned to that same unscoped URL (`08-browser-back-historical-a-route-url.txt`), while the screenshot and visible text render Project B, **Playable Game With Bonus Round**, rather than Project A, **Browser Multi-mode Library**. Browser Forward subsequently returns B's scoped route and B UI (`09-*`). Therefore Back does not restore A from a project-scoped history route, and B remains rendered/actionable on A's historical entry.

`04-browser-driver-final.log` and `09-browser-action-transcript.txt` provide the complete visible-input transcript. `01-build-cli.log`, `02-*`, `03-*`, and `10-shutdown.log` provide build, runtime, browser, and clean-shutdown evidence. `04-browser-driver.log` records an earlier failed startup attempt before the fresh Studio process was detached correctly; it contains no fabricated screenshots or workflow result.
