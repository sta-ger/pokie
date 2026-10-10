export type KeyboardTargetState = {state: 'seek' | 'ready' | 'clipped'; backward: boolean};

// Serialized into DevTools: observe after rendering on EVERY attempt, including
// seeks. An acknowledged key event is not a settled focus/scroll/layout receipt.
export function observeKeyboardTarget(target: () => Element | undefined): Promise<KeyboardTargetState> {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const element = target();
            const active = document.activeElement;
            if (!element || active !== element) {
                resolve({state: 'seek', backward: Boolean(element && active && active !== document.body
                    && (active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING))});
                return;
            }
            const rect = element.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= innerWidth + 1
                && rect.top >= -1 && rect.bottom <= innerHeight + 1;
            resolve({state: visible ? 'ready' : 'clipped', backward: false});
        }));
    });
}

export async function reachKeyboardTarget(
    observe: () => Promise<KeyboardTargetState>,
    tab: (backward: boolean) => Promise<void>,
    label: string,
): Promise<void> {
    for (let attempts = 0; attempts < 100; attempts++) {
        const current = await observe();
        if (current.state === 'ready') return;
        if (current.state === 'clipped') {
            // Resizing can leave an already focused control outside the viewport.
            // Leave and re-enter through native tab order, observing the intervening
            // render before reversing. No DOM focus/scroll or forced activation.
            await tab(false);
            if ((await observe()).state === 'ready') return;
            await tab(true);
        } else {
            // In particular, Create game precedes Game basics after the 900px
            // arrow-key traversal. Do not race through the rest of the page first.
            await tab(current.backward);
        }
    }
    throw new Error(`Keyboard cannot reach focused control inside viewport: ${label}`);
}
