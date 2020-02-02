# slotify.js

[![npm version](https://badge.fury.io/js/slotify.js.svg)](https://badge.fury.io/js/slotify.js)
[![Build Status](https://travis-ci.org/sta-ger/slotify.js.svg?branch=master)](https://travis-ci.org/sta-ger/slotify.js)

A server-side video slot game logic framework in JavaScript.

`npm install slotify.js`

[slotify4j](https://github.com/sta-ger/slotify4j) - Java version.

## Usage

### Game Session

Simple casino game logic.

```js
import {GameSession, GameSessionConfig} from "slotify.js";

const config = new GameSessionConfig();
config.availableBets = [10, 20, 30];
config.creditsAmount = 5000;

const session = new GameSession(config);
session.getAvailableBets(); //[10, 20, 30]
session.getBet(); //10
session.getCreditsAmount(); //5000

session.setBet(20);
session.getBet(); //20

session.play();
session.getCreditsAmount(); //4980
```

Video slot game logic.

```js
import {ReelGameSession, ReelGameSessionConfig} from "slotify.js";

const config = new ReelGameSessionConfig();
const session = new ReelGameSession(config, new ReelGameSessionReelsController(config), new ReelGameSessionWinCalculator(config));

//specified at config
session.getPaytable(); //paytable
session.getReelsItemsNumber(); //number of reels (columns)
session.getReelsNumber(); //number of items on reels (rows)
session.getReelsItemsSequences(); //distributions of symbols on reels (probabilities)

session.play();

session.getReelsItems(); //combination of symbols on reels after play
session.getWinningAmount(); //if there where a winning combination returns total winning amount
session.getWinningLines(); //returns winning lines data
session.getWinningScatters(); //returns winning scatters data
```

### Simulation

Simple way to run a lot of game rounds and calculate Return To Player percentage.

```js
const sessionConfig = new ReelGameSessionConfig();
sessionConfig.creditsAmount = Infinity;
sessionConfig.reelsItemsSequences = [
    ['J', '9', 'Q', '10', 'A', 'S', 'K'],
    ['K', 'S', '10', 'A', '9', 'Q', 'J'],
    ['J', 'Q', '10', '9', 'S', 'A', 'K'],
    ['Q', '10', '9', 'S', 'K', 'A', 'J'],
    ['Q', 'A', 'J', '10', '9', 'S', 'K']
];
const reelsController = new ReelGameSessionReelsController(sessionConfig);
const winningCalculator = new ReelGameSessionWinCalculator(sessionConfig);
const session = new ReelGameSession(sessionConfig, reelsController, winningCalculator);
const simulationConfig = {
    numberOfRounds: 10000
};
const simulation = new GameSessionSimulation(session, simulationConfig);


simulation.beforePlayCallback = () => {
    console.log("Before play");
};
simulation.afterPlayCallback = () => {
    console.log("After play");
};
simulation.onFinishedCallback = () => {
    console.log("Simulation finished");
};

simulation.run();  //10000 rounds will be played

simulation.getRtp(); //returns rtp for current session (about 50-60% with symbols distributions specified earlier at session config) 
```
