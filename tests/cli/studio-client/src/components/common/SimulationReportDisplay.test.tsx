import {describeSimulationReport, type SimulationReportView} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";
import type {SimulationReport} from "../../../../../../cli/studio-client/src/api/types";
import {MantineProvider} from "@mantine/core";
import {render, within} from "@testing-library/react";
import {SimulationReportDisplay} from "../../../../../../cli/studio-client/src/components/common/SimulationReportDisplay";

it("renders weighted configuration, actual counts and distinct uncovered/zero-weight states", () => {
    const view: SimulationReportView = {
        game: {id: "tiny", name: "Tiny", version: "1"}, rounds: 1, requestedRounds: 1, seed: "1", totalBet: 1, totalWin: 4,
        rtp: 4, hitFrequency: 1, maxWin: 4, durationMs: 1, spinsPerSecond: 1, workers: 1, warnings: [], recommendations: [],
        reelSequences: [{reelIndex: 0, context: "logical-round", model: "tiny", selections: 1, variants: [
            {id: "a", weight: 1, probability: 0.25, count: 1, frequency: 1, uncovered: false},
            {id: "b", weight: 3, probability: 0.75, count: 0, frequency: 0, uncovered: true},
            {id: "zero", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false},
        ]}],
    };
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    expect(result.getByText("Observed frequency = count / selections.")).toBeInTheDocument();
    expect(result.getByText("logical-round: 1 selections")).toBeInTheDocument();
    const row = result.getByText("b").closest("tr")!;
    expect(within(row).getByText("0.75")).toBeInTheDocument();
    expect(within(row).getByText("uncovered")).toBeInTheDocument();
    expect(result.getByText("zero weight")).toBeInTheDocument();
});


it("renders zero denominators and the exact ratio of a positive underflowed probability", () => {
    const view: SimulationReportView = {game: {id: "empty", name: "Empty", version: "1"}, rounds: 0, requestedRounds: 0, seed: null, totalBet: 0, totalWin: 0, rtp: 0, hitFrequency: 0, maxWin: 0, durationMs: 0, spinsPerSecond: 0, workers: 1, warnings: [], recommendations: [], reelSequences: [{reelIndex: 0, context: "logical-round", model: "tiny", selections: 0, variants: [{id: "tiny", weight: Number.MIN_VALUE, probability: 0, probabilityRatio: {numerator: "1", denominator: "12345678901234567890"}, count: 0, frequency: 0, uncovered: true}]}]};
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    expect(result.getByText("logical-round: 0 selections")).toBeInTheDocument();
    expect(result.getByText("1/12345678901234567890")).toBeInTheDocument();
    expect(result.getByText("uncovered")).toBeInTheDocument();
    expect(result.container.textContent).not.toContain("NaN");
});

it("renders each mode's actual stake and jackpot pool observations without blended metrics", () => {
    const report: SimulationReport = {game: {id: "jackpot", name: "Jackpot", version: "1"}, rounds: 2, requestedRounds: 2, seed: "ante", totalBet: 0.15, totalWin: 10, rtp: 10 / 0.15, hitFrequency: 0.5, maxWin: 10, durationMs: 1, spinsPerSecond: 2000, betMode: "ante", targetRtp: 0.95, rtpDeviation: 10 / 0.15 - 0.95, jackpot: {awardCount: 1, totalAwarded: 10, totalContributed: 0.015, contribution: 10 / 0.15, pools: {mini: {awardCount: 1, totalAwarded: 10, totalContributed: 0.015, contribution: 10 / 0.15}}}, reproducibility: {game: {id: "jackpot", name: "Jackpot", version: "1"}, seed: "ante", requestedRounds: 2, actualRounds: 2, command: "pokie sim jackpot --mode ante --seed ante"}};
    const view = describeSimulationReport({game: report.game, requestedRounds: 2, seed: "ante", modes: {ante: report, base: {...report, betMode: "base", totalBet: 0.1}}});
    const result = render(<MantineProvider><SimulationReportDisplay view={view} /></MantineProvider>);
    expect(result.getByText("All modes — independent results per mode")).toBeInTheDocument();
    expect(result.getByText("Mode: ante")).toBeInTheDocument();
    expect(result.getByText("Mode: base")).toBeInTheDocument();
    expect(result.getAllByText("mini")).toHaveLength(2);
    expect(result.getAllByText("0.015")).toHaveLength(2);
    expect(result.getByText(/actual stake 0.15/)).toBeInTheDocument();
    expect(result.getByText(/Bet mode: ante/)).toBeInTheDocument();
    expect(result.getAllByText("pokie sim jackpot --mode ante --seed ante")).toHaveLength(2);
});
