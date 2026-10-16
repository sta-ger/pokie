import {useEffect, useRef, useState} from "react";
import {previewMathDefinitionDiff} from "../../api/apiClient";
import type {MathDefinitionDiff} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";

type PreviewState =
    | {status: "idle" | "loading" | "cancelled"}
    | {status: "error"; message: string}
    | {status: "loaded"; diff: MathDefinitionDiff};

/** Renders server results; owns only request lifecycle, never definition comparison logic. */
export function MathDefinitionDiffPreview({
    sourcePath,
    projectRoot,
    draft,
    revision = 0,
}: {
    sourcePath?: string;
    projectRoot?: string;
    draft?: unknown;
    revision?: number;
}) {
    const fetchImpl = useStudioApi();
    const [rightPath, setRightPath] = useState("");
    const [state, setState] = useState<PreviewState>({status: "idle"});
    const lifecycle = useRef({generation: 0, active: undefined as AbortController | undefined});
    // Revision and source identity invalidate even transports which ignore AbortSignal.
    useEffect(() => {
        const requests = lifecycle.current;
        requests.generation++;
        requests.active?.abort();
        setState({status: "idle"});
        return () => {
            requests.generation++;
            requests.active?.abort();
        };
    }, [sourcePath, projectRoot, draft, revision, rightPath]);

    const cancel = (): void => {
        lifecycle.current.generation++;
        lifecycle.current.active?.abort();
        setState({status: "cancelled"});
    };
    const compare = async (): Promise<void> => {
        if (!sourcePath || (draft === undefined && !rightPath.trim())) return;
        lifecycle.current.active?.abort();
        const controller = new AbortController();
        lifecycle.current.active = controller;
        const requestGeneration = ++lifecycle.current.generation;
        setState({status: "loading"});
        try {
            const diff = await previewMathDefinitionDiff(
                fetchImpl,
                {leftPath: sourcePath, projectRoot, revision, ...(draft === undefined ? {rightPath} : {draft})},
                controller.signal,
            );
            if (lifecycle.current.generation !== requestGeneration || controller.signal.aborted) return;
            setState({status: "loaded", diff});
        } catch (error) {
            if (lifecycle.current.generation !== requestGeneration || controller.signal.aborted) return;
            setState({status: "error", message: error instanceof Error ? error.message : String(error)});
        }
    };
    return (
        <section aria-label="Mathematical definition comparison">
            <h3>Mathematical definition comparison</h3>
            {!sourcePath && <p>Load or save a source to compare its saved definition with this draft.</p>}
            {draft === undefined && (
                <label>
                    Compare with saved source{" "}
                    <input
                        aria-label="Compare with saved source"
                        value={rightPath}
                        onChange={(event) => setRightPath(event.target.value)}
                    />
                </label>
            )}
            <button
                type="button"
                disabled={!sourcePath || (draft === undefined && !rightPath.trim())}
                onClick={() => {
                    compare().catch(() => undefined);
                }}
            >
                {draft === undefined ? "Compare definitions" : "Compare saved versus draft"}
            </button>
            {state.status === "loading" && (
                <>
                    <p role="status">Comparing definitions…</p>
                    <button type="button" onClick={cancel}>
                        Cancel comparison
                    </button>
                </>
            )}
            {state.status === "cancelled" && <p role="status">Comparison cancelled. Run it again when ready.</p>}
            {state.status === "error" && (
                <p role="alert">Comparison failed: {state.message} Check the source paths and retry.</p>
            )}
            {state.status === "loaded" && (
                <div>
                    <p role="status">Definition comparison: {state.diff.status}</p>
                    <p>{state.diff.scope}</p>
                    <pre>
                        {JSON.stringify({left: state.diff.left.identity, right: state.diff.right.identity}, null, 2)}
                    </pre>
                    {["left", "right"].map((side) => {
                        const source = state.diff[side as "left" | "right"];
                        return (
                            <div key={side}>
                                <p>
                                    {side}: {source.support}
                                </p>
                                {source.limits.map((limit, i) => (
                                    <p key={i}>Limit: {limit}</p>
                                ))}
                                {source.diagnostics.map((issue, i) => (
                                    <p key={i}>
                                        {issue.severity} {issue.code} {issue.path}: {issue.message}
                                    </p>
                                ))}
                            </div>
                        );
                    })}
                    {state.diff.status === "identical" && <p>No definition changes.</p>}
                    {state.diff.changes.map((change, i) => (
                        <div key={i}>
                            <strong>
                                {change.path} [{change.classification}]
                            </strong>
                            {change.seededTraceImpact && <p>Seeded trace may be affected.</p>}
                            <pre>
                                {JSON.stringify(
                                    {context: change.context, before: change.before, after: change.after},
                                    null,
                                    2,
                                )}
                            </pre>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
