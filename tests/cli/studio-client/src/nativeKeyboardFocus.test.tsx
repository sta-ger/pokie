import {Button, MantineProvider, Tabs} from "@mantine/core";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {runInNewContext} from "node:vm";
import {StatusBadge} from "../../../../cli/studio-client/src/components/common/StatusBadge";
import {BLUEPRINT_SECTIONS} from "../../../../cli/studio-client/src/domain/interpret/BlueprintSections";
import {observeKeyboardTarget, reachKeyboardTarget, type KeyboardTargetState} from "./nativeKeyboardFocus";

// jsdom supplies keyboard order, not layout. Rectangles exercise rejection and
// scheduling only; the complete production-browser journey remains required.
const contained = {x: 276, y: 228, width: 139, height: 36, left: 276, top: 228, right: 415, bottom: 264,
    toJSON: () => ({x: 276, y: 228, width: 139, height: 36})};

beforeEach(() => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(contained);
});

afterEach(() => jest.restoreAllMocks());

it('waits for both frames even when seeking, then reads the current target and focus', async () => {
    const user = userEvent.setup();
    render(<button id="blueprint-create-game">Create game</button>);
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
    });
    // Execute the exact serialized expression used by DevTools, without any
    // module closure or a replacement observer/production browser.
    const pending = runInNewContext(`(${observeKeyboardTarget.toString()})(() => document.getElementById('blueprint-create-game'))`, {
        document, Node, innerWidth: 900, innerHeight: 700, requestAnimationFrame: window.requestAnimationFrame,
    }) as Promise<KeyboardTargetState>;
    const resolved = jest.fn();
    pending.then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    await user.tab();
    frames.shift()!(16);
    await expect(pending).resolves.toEqual({state: 'ready', backward: false});
});

it('natively returns from all six validated sections to enabled Create game and activates it', async () => {
    const user = userEvent.setup();
    const create = jest.fn();
    render(<MantineProvider>
        <Button id="blueprint-create-game" onClick={create}>Create game</Button>
        <Tabs defaultValue="basics">
            <Tabs.List aria-label="Game design sections">
                {BLUEPRINT_SECTIONS.map(section => <Tabs.Tab key={section.id} value={section.id}
                    rightSection={<StatusBadge status={{tone: 'success', errorCount: 0, warningCount: 0}} />}>
                    {section.label}
                </Tabs.Tab>)}
            </Tabs.List>
        </Tabs>
        <input aria-label="Game id" />
    </MantineProvider>);
    const action = screen.getByRole('button', {name: 'Create game'});
    const list = screen.getByRole('tablist', {name: 'Game design sections'});
    expect(within(list).getAllByRole('tab').map(tab => tab.querySelector('.mantine-Tabs-tabLabel')?.textContent))
        .toEqual(['Game basics', 'Layout', 'Symbols', 'Reels', 'Paytable', 'Bets']);
    await user.tab();
    expect(action).toHaveFocus();
    await user.tab();
    for (const label of ['Layout', 'Symbols', 'Reels', 'Paytable', 'Bets', 'Game basics']) {
        await user.keyboard('{ArrowRight}');
        expect(within(list).getByRole('tab', {name: `${label} valid`})).toHaveFocus();
    }
    const directions: boolean[] = [];
    await reachKeyboardTarget(() => observeKeyboardTarget(() => action), async backward => {
        directions.push(backward);
        await user.tab({shift: backward});
    }, 'Create game');
    expect(directions).toEqual([true]);
    expect(action).toBeEnabled();
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(create).toHaveBeenCalledTimes(1);
    expect(within(list).getByRole('tab', {name: 'Bets valid'})).toHaveAccessibleName('Bets valid');
});

it('settles native leave and re-entry when resize clips the already focused control', async () => {
    const user = userEvent.setup();
    render(<><button>Create game</button><input aria-label="Game id" /></>);
    const action = screen.getByRole('button', {name: 'Create game'});
    await user.tab();
    let reentered = false;
    jest.spyOn(action, 'getBoundingClientRect').mockImplementation(() => reentered ? contained
        : {...contained, y: -50, top: -50, bottom: -14});
    const directions: boolean[] = [];
    const states: string[] = [];
    await reachKeyboardTarget(async () => {
        const result = await observeKeyboardTarget(() => action);
        states.push(result.state);
        return result;
    }, async backward => {
        directions.push(backward);
        await user.tab({shift: backward});
        if (backward) reentered = true;
    }, 'resized Create game');
    expect(directions).toEqual([false, true]);
    expect(states).toEqual(['clipped', 'seek', 'ready']);
    expect(action).toHaveFocus();
});

it.each([
    {...contained, left: -10}, {...contained, right: window.innerWidth + 10},
    {...contained, top: -10}, {...contained, bottom: window.innerHeight + 10},
    {...contained, width: 0}, {...contained, height: 0},
])('retains rejection of truly clipped or unpainted focused controls %#', async rect => {
    const user = userEvent.setup();
    render(<button>Create game</button>);
    const action = screen.getByRole('button', {name: 'Create game'});
    jest.spyOn(action, 'getBoundingClientRect').mockReturnValue(rect);
    await user.tab();
    await expect(observeKeyboardTarget(() => action)).resolves.toEqual({state: 'clipped', backward: false});
});

it('keeps missing and disabled targets unreached and preserves the bounded failure', async () => {
    const user = userEvent.setup();
    const create = jest.fn();
    render(<><button disabled onClick={create}>Create game</button><input aria-label="Game id" /></>);
    const action = screen.getByRole('button', {name: 'Create game'});
    await user.tab();
    expect(action).not.toHaveFocus();
    expect((await observeKeyboardTarget(() => action)).state).toBe('seek');
    expect((await observeKeyboardTarget(() => undefined)).state).toBe('seek');
    const seek = jest.fn((): Promise<KeyboardTargetState> => Promise.resolve({state: 'seek', backward: false}));
    const tab = jest.fn(() => Promise.resolve());
    await expect(reachKeyboardTarget(seek, tab, 'disabled Create game')).rejects.toThrow('Keyboard cannot reach');
    expect(seek).toHaveBeenCalledTimes(100);
    expect(tab).toHaveBeenCalledTimes(100);
    expect(create).not.toHaveBeenCalled();
});
