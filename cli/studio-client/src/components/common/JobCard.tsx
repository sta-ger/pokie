import {useLayoutEffect, useRef, type ComponentProps} from "react";
import {JobProgressCard} from "./JobProgressCard";
import {JobResultCard} from "./JobResultCard";

/** Keep one focus owner when an active card becomes its retained result. */
export function JobCard(props: ComponentProps<typeof JobResultCard> & {
    onCancel?: (id: string) => void;
    cancellationPending?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const ownsFocus = useRef(false);
    useLayoutEffect(() => {
        if (ownsFocus.current && document.activeElement === document.body) ref.current?.focus({preventScroll: true});
    });
    return (
        <div ref={ref} tabIndex={-1} role="region" aria-label={`${props.job.operation} job ${props.job.id}`} onFocusCapture={() => {
            ownsFocus.current = true;
        }} onBlurCapture={(event) => {
            if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) ownsFocus.current = false;
        }}>
            {props.job.status === "queued" || props.job.status === "running" || props.job.status === "cancelling"
                ? <JobProgressCard job={props.job} onCancel={props.onCancel} cancellationPending={props.cancellationPending} />
                : <JobResultCard {...props} />}
        </div>
    );
}
