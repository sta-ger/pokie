import type {CascadeResultProviding} from "../../../session/videoslot/cascade/CascadeResultProviding.js";
import type {VideoSlotSessionHandling} from "../../../session/videoslot/VideoSlotSessionHandling.js";
import {MultiStageRoundSessionSerializer} from "../../MultiStageRoundSessionSerializer.js";
import {VideoSlotSessionSerializer} from "../VideoSlotSessionSerializer.js";
import type {VideoSlotSessionSerializing} from "../VideoSlotSessionSerializing.js";
import type {VideoSlotInitialNetworkData, VideoSlotRoundNetworkData} from "../VideoSlotNetworkData.js";
import {serializeWinEvaluationResult} from "../serializeWinEvaluationResult.js";
import type {CascadeInitialNetworkData, CascadeRoundNetworkData} from "./CascadeNetworkData.js";
import type {CascadeStepNetworkData} from "./CascadeStepNetworkData.js";
import type {CascadeSessionSerializing} from "./CascadeSessionSerializing.js";

type CascadeCapableSession<T extends string | number | symbol = string> = VideoSlotSessionHandling<T> &
    CascadeResultProviding<T>;

// The ready-made serializer for cascading games (requirement: a serializer for cascade mechanics
// that ships with the framework, built on the generic MultiStageRoundSessionSerializer base). Works
// against any session implementing VideoSlotSessionHandling & CascadeResultProviding — there is no
// built-in "cascade session" class this depends on; a custom game only needs to implement
// getCascadeResult() (see CascadeResultProviding's own doc comment).
export class CascadeSessionSerializer<T extends string | number | symbol = string>
    extends MultiStageRoundSessionSerializer<
        CascadeCapableSession<T>,
        CascadeStepNetworkData<T>,
        VideoSlotRoundNetworkData<T>,
        VideoSlotInitialNetworkData<T>
    >
    implements CascadeSessionSerializing<T> {
    constructor(videoSlotSerializer: VideoSlotSessionSerializing<T> = new VideoSlotSessionSerializer<T>()) {
        super(videoSlotSerializer);
    }

    public override getRoundData(session: CascadeCapableSession<T>): CascadeRoundNetworkData<T> {
        const cascadeResult = session.getCascadeResult();
        return {
            ...super.getRoundData(session),
            initialScreen: cascadeResult.getInitialScreen(),
            finalScreen: cascadeResult.getFinalScreen(),
            totalCascadeWin: cascadeResult.getTotalCascadeWin(),
            cascadeMetadata: cascadeResult.getMetadata(),
            cascadeRngInfo: cascadeResult.getRngInfo(),
            cascadeDebugInfo: cascadeResult.getDebugInfo(),
        };
    }

    public override getInitialData(session: CascadeCapableSession<T>): CascadeInitialNetworkData<T> {
        return {...super.getInitialData(session), ...this.getRoundData(session)};
    }

    protected getStages(session: CascadeCapableSession<T>): CascadeStepNetworkData<T>[] {
        return session
            .getCascadeResult()
            .getCascadeSteps()
            .map((step) => ({
                screen: step.getScreen(),
                winEvaluationResult: serializeWinEvaluationResult(step.getWinEvaluationResult()),
                removedPositions: step.getRemovedPositions(),
                refillSymbols: step.getRefillSymbols(),
                metadata: step.getMetadata(),
                rngInfo: step.getRngInfo(),
                debugInfo: step.getDebugInfo(),
            }));
    }
}
