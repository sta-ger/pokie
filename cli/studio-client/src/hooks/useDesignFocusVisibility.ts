import {useEffect, type RefObject} from "react";

/** Native focus can precede the end of Home's two advanced-option collapses.
 * Keep that same control visible when the layout moves; never move focus. */
export function useDesignFocusVisibility(ref: RefObject<HTMLDivElement | null>, enabled: boolean): void {
    useEffect(() => {
        const region = ref.current;
        if (!enabled || region === null) return undefined;
        let frame: number | undefined;
        const keepVisible = () => {
            frame = undefined;
            const control = document.activeElement;
            if (!(control instanceof HTMLElement) || !region.contains(control) || !control.isConnected) return;
            const bounds = control.getBoundingClientRect();
            if (bounds.width === 0 || bounds.height === 0) return;
            const top = Math.max(0, document.querySelector(".mantine-AppShell-header")?.getBoundingClientRect().bottom ?? 0) + 8;
            if (bounds.top < top || bounds.bottom > window.innerHeight - 8 || bounds.left < 8 || bounds.right > window.innerWidth - 8) {
                control.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
            }
        };
        const schedule = () => {
            if (frame === undefined) frame = requestAnimationFrame(keepVisible);
        };
        const observer = new ResizeObserver(schedule);
        // Both the editor's collapses and late Home content above it can shift
        // an unchanged input after the browser has scrolled for native Tab.
        for (let ancestor: HTMLElement | null = region; ancestor !== null; ancestor = ancestor.parentElement) observer.observe(ancestor);
        region.addEventListener("focusin", schedule);
        window.addEventListener("resize", schedule);
        return () => {
            observer.disconnect();
            region.removeEventListener("focusin", schedule);
            window.removeEventListener("resize", schedule);
            if (frame !== undefined) cancelAnimationFrame(frame);
        };
    }, [ref, enabled]);
}
