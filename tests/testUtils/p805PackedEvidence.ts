import {createHash} from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {constants, runInThisContext} from "node:vm";

export const loadLogEvidence = () => {
    const url = pathToFileURL(path.join(process.cwd(), "scripts/p8-05-packed-output-evidence.mjs")).href;
    return runInThisContext(`import(${JSON.stringify(url)})`, {importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
};

type CapturedLogEvidence = {evidenceId: string; kind: string; path: string; sha256: string; sizeBytes: number; observationIds: string[]};

export const readCapturedApiLog = async (evidence: CapturedLogEvidence[], readArtifact: (file: string) => Promise<Buffer>): Promise<Array<{browserRequestId?: string; transaction?: {pointerActivations: PointerDelivery[]; confirmation?: {activation?: PointerDelivery}}}>> => {
    const {readP805Log, P805_MAX_EVIDENCE_BYTES} = await loadLogEvidence();
    const entries = new Map<string, {item: CapturedLogEvidence; contents: Buffer}>();
    for (const item of evidence.filter((item) => ["api-log", "api-log-chunk"].includes(item.kind))) {
        const contents = await readArtifact(item.path);
        expect(contents.length).toBe(item.sizeBytes);
        expect(contents.length).toBeLessThanOrEqual(P805_MAX_EVIDENCE_BYTES);
        expect(createHash("sha256").update(contents).digest("hex")).toBe(item.sha256);
        expect(entries.has(item.evidenceId)).toBe(false);
        entries.set(item.evidenceId, {item, contents});
    }
    return readP805Log("api-log", entries);
};

export type PointerDelivery = {
    kind: string;
    controlId: string;
    capturedControlId: string;
    count: number;
    captureKey: string;
    preDispatchFocus: {controlId: string; native: boolean};
    hitTest: {region: unknown};
    dispatch: {
        pointerDownCount: number; pointerUpCount: number; clickCount: number;
        eventBindings: Array<{
            eventType: string; trusted: boolean; captureKey: string; capturedControlId: string;
            pathContainsCapturedControl: boolean; capturedControlConnected: boolean;
            identityPreserved: boolean; hitMatchesCapturedControl: boolean;
            region: unknown;
            reflow?: {kind: string; measuredRegion: unknown; deliveredRegion: unknown};
        }>;
    };
};

// The complete packed proof consumes the producer's unchanged pointer records,
// including delivery-time diagnostics, rather than substituting keyboard claims.
export const assertPointerDeliveries = (pointers: PointerDelivery[]) => {
    for (const pointer of pointers) {
        expect(pointer.kind).toBe("pointer");
        expect(pointer.count).toBe(1);
        expect(pointer.preDispatchFocus).toEqual({controlId: pointer.controlId, native: true});
        expect(pointer.dispatch.pointerDownCount).toBe(1);
        expect(pointer.dispatch.pointerUpCount).toBe(1);
        expect(pointer.dispatch.clickCount).toBe(1);
        expect(pointer.dispatch.eventBindings.map((event) => event.eventType)).toEqual(["pointerdown", "pointerup", "click"]);
        const reflowed = pointer.dispatch.eventBindings.some((event) => event.reflow !== undefined);
        for (const event of pointer.dispatch.eventBindings) {
            expect(event).toEqual(expect.objectContaining({trusted: true, captureKey: pointer.captureKey, capturedControlId: pointer.capturedControlId, capturedControlConnected: true, identityPreserved: true, hitMatchesCapturedControl: true}));
            if (reflowed) expect(event.pathContainsCapturedControl).toBe(true);
            if (event.reflow !== undefined) {
                expect(event.reflow).toEqual({kind: "same-node-delivery-reflow", measuredRegion: pointer.hitTest.region, deliveredRegion: event.region});
                expect(event.region).not.toEqual(pointer.hitTest.region);
            }
        }
    }
};

