# POKIE

[![npm version](https://badge.fury.io/js/pokie.svg)](https://badge.fury.io/js/pokie)

_In Australia, they call slot machines "pokies"._

Introducing **POKIE**, a server-side video slot game logic framework for JavaScript and TypeScript.

`npm install pokie`

## Use cases

### Back-End

Utilize **POKIE** to implement the video slot game mechanics on the Back-End. Create and manage game sessions, serialize
them, and transfer the payload to the game client through your API.

### Front-End

When playing for fun, you can implement the standalone game logic on the client-side, relieving the servers from
unnecessary load. Utilize simulations to showcase specific game features for demonstration purposes.

### Math

**POKIE** also serves as an essential tool for balancing the parameters of the slot game's math model, ensuring an immersive
gaming experience. Configure the game session and run Monte Carlo simulations to guarantee that the model meets all
necessary requirements.

## Examples

See the [examples](https://github.com/sta-ger/pokie-examples) of various video slot game mechanics implemented with
**POKIE**.

### Simple video slot game [[Demo](https://sta-ger.github.io/pokie-examples/simple-slot.html)] [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/simple-slot)]

An example of a simple 5x4 video slot game with 8 winning lines.

Features:
- Winning lines are counted from right to left. A line of minimum 3 winning symbols pays out.
- "Wild" is a wild symbol that substitutes any other symbol on a winning line.
- "Scatter1" is a scatter symbol that pays out 10x, 20x, or 30x the bet if 3 or more symbols appear on any positions. Only one "Scatter1" can appear on any reel.
- "Scatter2" is a stacked scatter symbol that can appear on the 3 middle reels. If all 3 middle reels are covered with "Scatter2" symbols, the game pays 100x the bet.

### Video slot with free spins [[Demo](https://sta-ger.github.io/pokie-examples/slot-with-free-games.html)] [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/slot-with-free-games)]

An example of a 5x3 video slot game with free spins.

Features:
- A minimum of 2 winning symbols on a winning line or scattered across all reels pays out.
- During free spins, symbols on a winning line are counted not only from left to right but can also be scattered across the winning line definition.
- During free spins, symbol sequences are different from the base game's ones. Sequences during free spins do not contain scatter symbols, so free spins cannot be re-triggered.
- During free spins, all wins are multiplied by x2.
- This example also demonstrates the usage of Simulation to obtain the desired game outcomes.

### Video slot with sticky re-spin [[Demo](https://sta-ger.github.io/pokie-examples/slot-with-sticky-respin.html)] [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/slot-with-sticky-respin)]

An example of a 5x3 video slot game with sticky re-spin feature. Every winning combination triggers the re-spin during which all the winning symbols are held on their places. The re-spins continue as long as there are new wins.

## Usage

### Session

Video slot game logic.

```js
import {VideoSlotSession} from "pokie";

const session = new VideoSlotSession();

session.play();

session.getSymbolsCombination(); // symbols combination
session.getWinAmount(); // total round win amount
session.getWinningLines(); // winning lines data
session.getWinningScatters(); // winning scatters data
```

### Simulation

Running a certain number of game rounds and calculating RTP.

```js
import {SimulationConfig, Simulation} from "pokie";

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(10000);
const simulation = new Simulation(session, simulationConfig);

// set the callbacks if you want to control the session manually
simulation.beforePlayCallback = () => {
    console.log("Before play");
};
simulation.afterPlayCallback = () => {
    console.log("After play");
};
simulation.onFinishedCallback = () => {
    console.log("Simulation finished");
};

simulation.run(); // 10000 rounds will be played

simulation.getRtp(); // RTP of the current session
```

Capturing specific game features.

```js
const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(Infinity);
simulationConfig.setPlayStrategy(new PlayUntilSymbolWinStrategy("A"));

const simulation = new Simulation(session, simulationConfig);
simulation.run(); // the simulation will be stopped on any winning combination with symbol "A"
```
