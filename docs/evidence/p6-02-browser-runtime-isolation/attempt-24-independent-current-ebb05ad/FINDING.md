# P6-02 independent browser verification finding

Candidate checked: `ebb05ad3def96da58985407b7895eb31df90d8e2`.

The fresh visible Studio workflow began at the formerly unscoped public route
`#/project/play` for Project A. The browser then created and spun an A session,
opened Project B through the visible Home/Projects import and Open controls,
created a B session, and used physical browser Back four times.

Back arrived at the preserved unscoped `#/project/play` URL, rather than a
project-scoped A URL. Its rendered title and visible Play controls were Project
B (`Playable Game With Bonus Round`), as shown in
`08-browser-back-historical-a-route.png` and its visible-text capture. Forward
returned to the scoped Project B Play route, as captured in
`09-browser-forward-project-b-route.png`.

This violates the required Back isolation and makes Project B state/action
surface on the historical Project A entry. See `09-browser-action-transcript.txt`
and `11-browser-driver-passing.log` for the complete pointer/keyboard UI
transcript and terminal log.
