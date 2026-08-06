import path from "node:path";

// "pokie/client/player" isn't published under the installed "pokie" npm dependency yet -- this
// resolves it straight to the sibling pokie checkout's own source (same container, see that repo's
// own companion_workspace wiring for this task) so this example project renders every game with the
// exact same canonical player/runtime adapter pokie's own cli/client/main.ts renders with, not a
// fork of it. Swap for a real "pokie/client/player" package resolution once that subpath ships in a
// published pokie release.
const pokieClientPlayerPath = path.resolve("/workspace/cli/client/player/index.ts");

export default {
  resolve: {
    alias: {
      "pokie/client/player": pokieClientPlayerPath,
    },
  },
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        page1: 'index.html',
        page2: 'simple-slot.html',
        page3: 'slot-with-free-games.html',
        page4: 'slot-with-sticky-respin.html',
        page5: 'cascading-cluster.html',
        page6: 'megaways-style.html',
        page7: 'growing-grid.html',
        page8: 'value-pay-multiplier.html',
        page9: 'verifiable-spin.html',
        page10: 'mixed-evaluators.html',
      },
    },
  },
  base: "./"
};