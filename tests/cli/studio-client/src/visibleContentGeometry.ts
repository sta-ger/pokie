// Self-contained so the production-browser audit can execute this exact function
// through DevTools. This measures painted content, not a control's accessible name.
export function visibleContentOverflows(element: Element): boolean {
    const bounds = element.getBoundingClientRect();
    const outside = (rect: DOMRect) => rect.width > 0 && rect.height > 0
        && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1
            || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const child = node as Element;
                const style = getComputedStyle(child);
                // aria-hidden is deliberately not excluded: status icons/counts are
                // decorative for assistive tech but still need visual containment.
                if (child.matches('.mantine-VisuallyHidden-root') || style.display === 'none'
                    || style.visibility === 'hidden' || style.visibility === 'collapse') {
                    return NodeFilter.FILTER_REJECT;
                }
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (Array.from((node as Element).getClientRects()).some(outside)) return true;
        } else if (node.textContent?.trim()) {
            // Separate text ranges exclude nonvisual siblings and preserve each
            // wrapped line's geometry instead of comparing a whole-subtree union.
            range.selectNodeContents(node);
            if (Array.from(range.getClientRects()).some(outside)) return true;
        }
    }
    return false;
}
