# P6-18 cold-start Studio verification — finding

Candidate: `d0e3d7e759931a333a18db8ed23835c7ca750801`
Finding: `p6-18-mathematician-cold-start-workflow` (`P2`)

Two fresh Node 24 Studio/client and Chrome-profile launches were used. The first reached Recommended Blueprint creation and metadata editing; its host-side rendered-control driver clicked the Layout tab before it had been scrolled into the visible viewport. The second corrected that physical visibility issue and reached Layout (including an Add payline edit) and Symbols. It then stalled only because the driver waited for the accessible label `Symbol 1 id`, which is not included in the rendered page's text projection despite the actual Symbols editor being visibly present.

The candidate showed a valid model after the edits (with the expected duplicate-payline warning), and neither pass rendered a Studio error. However, the required complete workflow—save/reopen, Play, Simulation/RTP, selected Replay, Outcome Library, and Stake export—was not completed within the two-launch limit. Therefore there is no passing P6-18 evidence and no claim that the downstream flow works on this candidate.

Stale screenshots from a different candidate (`0fadbd930320539ed6b76308b1728e487c220e6e`) were removed rather than presented as evidence for this SHA.
