import {act} from "@testing-library/react";

/** Deliver real layout-observer callbacks with explicit jsdom geometry.
 * This tests delayed displacement/ownership; Chromium remains the geometry authority. */
export function jobFocusLayout() {
    const observers = new Map<ResizeObserver, {notify: ResizeObserverCallback; targets: Set<Element>}>();
    const resize = jest.spyOn(globalThis, "ResizeObserver").mockImplementation(notify => {
        const targets = new Set<Element>();
        const observer: ResizeObserver = {
            observe: target => {
                targets.add(target);
            },
            unobserve: target => {
                targets.delete(target);
            },
            disconnect: () => {
                targets.clear();
            },
        };
        observers.set(observer, {notify, targets});
        return observer;
    });
    const scroll = jest.spyOn(Element.prototype, "scrollIntoView");
    return {
        scroll,
        place(region: HTMLElement, top: number) {
            const bounds = jest.spyOn(region, "getBoundingClientRect").mockImplementation(() => ({
                x: 20, y: top, left: 20, right: 320, top, bottom: top + 232,
                width: 300, height: 232, toJSON: () => ({}),
            }));
            return {
                moveTo(nextTop: number) {
                    top = nextTop;
                },
                restore: () => bounds.mockRestore(),
            };
        },
        async expand(ancestor: Element, beforeFrame?: () => void) {
            await act(async () => {
                for (const [observer, {notify, targets}] of observers) {
                    if (targets.has(ancestor)) notify([], observer);
                }
                beforeFrame?.();
                await new Promise(resolve => {
                    requestAnimationFrame(resolve);
                });
            });
        },
        observing(ancestor: Element) {
            return [...observers.values()].some(({targets}) => targets.has(ancestor));
        },
        restore() {
            resize.mockRestore();
            scroll.mockRestore();
        },
    };
}
