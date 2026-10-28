import {useCallback, useLayoutEffect, useRef, type ComponentProps} from "react";
import {JobProgressCard} from "./JobProgressCard";
import {JobResultCard} from "./JobResultCard";

/** Keep one focus owner when an active card becomes its retained result. */
export function JobCard(props: ComponentProps<typeof JobResultCard> & {
    onCancel?: (id: string) => void;
    cancellationPending?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const focusedControl = useRef<HTMLElement | undefined>(undefined);
    const layoutObserver = useRef<ResizeObserver | undefined>(undefined);
    const visibilityFrame = useRef<number | undefined>(undefined);

    const stopObserving = useCallback(() => {
        layoutObserver.current?.disconnect();
        layoutObserver.current = undefined;
        if (visibilityFrame.current !== undefined) cancelAnimationFrame(visibilityFrame.current);
        visibilityFrame.current = undefined;
    }, []);
    const keepFocusedControlVisible = useCallback(() => {
        const region = ref.current;
        // A later report/history response may arrive after the reader has
        // moved to another control, job or dialog. Never scroll on its behalf.
        const control = document.activeElement;
        if (region === null || !region.isConnected || !(control instanceof HTMLElement) || !region.contains(control)) return;
        const bounds = control.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        const top = Math.max(0, document.querySelector(".mantine-AppShell-header")?.getBoundingClientRect().bottom ?? 0) + 8;
        const bottom = window.innerHeight - 8;
        // Include the 2px outline and 3px offset. For a tall retained result,
        // keep its leading edge visible rather than repeatedly trying to fit it.
        const verticallyVisible = bounds.height > bottom - top
            ? bounds.top >= top && bounds.top < bottom
            : bounds.top >= top && bounds.bottom <= bottom;
        if (!verticallyVisible || bounds.left < 8 || bounds.right > window.innerWidth - 8) {
            control.scrollIntoView({block: bounds.height > bottom - top ? "start" : "nearest", inline: "nearest", behavior: "instant"});
        }
    }, []);
    const scheduleVisibility = useCallback(() => {
        if (!ref.current?.contains(document.activeElement) || visibilityFrame.current !== undefined) return;
        visibilityFrame.current = requestAnimationFrame(() => {
            visibilityFrame.current = undefined;
            keepFocusedControlVisible();
        });
    }, [keepFocusedControlVisible]);
    useLayoutEffect(() => {
        // A height-only viewport change need not resize the card or ancestors.
        window.addEventListener("resize", scheduleVisibility);
        window.visualViewport?.addEventListener("resize", scheduleVisibility);
        return () => {
            window.removeEventListener("resize", scheduleVisibility);
            window.visualViewport?.removeEventListener("resize", scheduleVisibility);
            stopObserving();
        };
    }, [scheduleVisibility, stopObserving]);
    useLayoutEffect(() => {
        if (focusedControl.current !== undefined && !focusedControl.current.isConnected && document.activeElement === document.body) {
            ref.current?.focus({preventScroll: true});
        }
        keepFocusedControlVisible();
    });
    return (
        <div ref={ref} className="studio-job-region" tabIndex={-1} role="region" aria-label={`${props.job.operation} job ${props.job.id}`}
            style={{scrollMarginTop: "calc(var(--app-shell-header-offset, 0px) + 8px)", scrollMarginBottom: 8, scrollMarginInline: 8}}
            onFocusCapture={(event) => {
                focusedControl.current = event.target;
                stopObserving();
                if (!event.currentTarget.contains(event.target)) return;
                keepFocusedControlVisible();
                // Observe the containing layout as well as the card: Review,
                // report and Recent runs can expand above an unchanged card.
                const observer = new ResizeObserver(scheduleVisibility);
                layoutObserver.current = observer;
                for (let ancestor: HTMLElement | null = event.currentTarget; ancestor !== null; ancestor = ancestor.parentElement) {
                    observer.observe(ancestor);
                }
            }} onBlurCapture={(event) => {
                stopObserving();
                if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) focusedControl.current = undefined;
            }}>
            {props.job.status === "queued" || props.job.status === "running" || props.job.status === "cancelling"
                ? <JobProgressCard job={props.job} onCancel={props.onCancel} cancellationPending={props.cancellationPending} />
                : <JobResultCard {...props} />}
        </div>
    );
}
