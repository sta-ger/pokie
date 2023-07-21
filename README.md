# POKIE

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

### Examples

See the [examples](https://github.com/sta-ger/pokie-examples) of various video slot game mechanics implemented with
**POKIE**.

[Simple video slot game](https://github.com/sta-ger/pokie-examples)

[Video slot with free spins](https://github.com/sta-ger/pokie-examples)

[Video slot with sticky re-spin](https://github.com/sta-ger/pokie-examples)

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
