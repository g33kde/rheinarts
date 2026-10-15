import { describe, expect, it } from 'vitest';
import { DedicatedLobby } from '../src/systems/DedicatedLobby';

const lobby = (max = 4) => new DedicatedLobby(max, 'cooperative');
const slots = (result: ReturnType<DedicatedLobby['join']>) => (result.ok ? [...result.slots] : result.reason);

describe('DedicatedLobby joining', () => {
  it('seats owners in the lowest free slots', () => {
    const l = lobby();
    expect(slots(l.join(10, 1))).toEqual([0]);
    expect(slots(l.join(11, 1))).toEqual([1]);
    l.leave(10);
    expect(slots(l.join(12, 1))).toEqual([0]);
  });

  it('seats a two-player PC in two slots, taking gaps first', () => {
    const l = lobby();
    l.join(10, 1);
    l.join(11, 1);
    l.leave(10);
    expect(slots(l.join(12, 2))).toEqual([0, 2]);
    expect(l.slotsOf(12)).toEqual([0, 2]);
  });

  it('is all-or-nothing: a two-player PC is turned away when only one slot is free', () => {
    const l = lobby();
    l.join(10, 1);
    l.join(11, 1);
    l.join(12, 1);
    expect(slots(l.join(13, 2))).toBe('full');
    expect(l.playerCount).toBe(3);
    expect(slots(l.join(13, 1))).toEqual([3]);
  });

  it('turns away a fifth player', () => {
    const l = lobby();
    for (let i = 0; i < 4; i += 1) l.join(i, 1);
    expect(slots(l.join(99, 1))).toBe('full');
  });

  it('respects a smaller maxPlayers', () => {
    const l = lobby(2);
    l.join(1, 1);
    l.join(2, 1);
    expect(slots(l.join(3, 1))).toBe('full');
  });

  it('turns joiners away while a match is running, and takes them again after', () => {
    const l = lobby();
    l.join(1, 1);
    l.command(1, { action: 'start' });
    expect(slots(l.join(2, 1))).toBe('matchInProgress');
    l.endMatch();
    expect(slots(l.join(2, 1))).toEqual([1]);
  });

  it('treats a repeat join by a seated owner as a no-op', () => {
    const l = lobby();
    l.join(1, 2);
    expect(slots(l.join(1, 1))).toEqual([0, 1]);
    expect(l.playerCount).toBe(2);
  });
});

describe('DedicatedLobby leadership', () => {
  it('makes the first joiner leader, by owner and by slot', () => {
    const l = lobby();
    l.join(5, 2);
    l.join(6, 1);
    expect(l.leaderOwner).toBe(5);
    expect(l.leaderSlot).toBe(0);
  });

  it('has no leader when empty', () => {
    const l = lobby();
    expect(l.leaderOwner).toBe(-1);
    expect(l.leaderSlot).toBe(-1);
  });

  it('passes leadership to the earliest remaining joiner, not the lowest slot', () => {
    const l = lobby();
    l.join(1, 1); // slot 0, leader
    l.join(2, 1); // slot 1
    l.join(3, 1); // slot 2
    l.leave(1);
    expect(l.leaderOwner).toBe(2);
    expect(slots(l.join(4, 1))).toEqual([0]); // reuses slot 0, but joined last
    l.leave(2);
    expect(l.leaderOwner).toBe(3);
  });

  it('does not change the leader when a non-leader leaves', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    l.leave(2);
    expect(l.leaderOwner).toBe(1);
  });

  it('gives a leaving two-player PC\'s both slots up at once', () => {
    const l = lobby();
    l.join(1, 2);
    l.join(2, 1);
    l.leave(1);
    expect(l.memberSlots).toEqual([2]);
    expect(l.leaderOwner).toBe(2);
  });
});

describe('DedicatedLobby commands', () => {
  it('lets only the leader start', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    expect(l.command(2, { action: 'start' })).toBe('ignored');
    expect(l.isInMatch).toBe(false);
    expect(l.command(1, { action: 'start' })).toBe('started');
    expect(l.isInMatch).toBe(true);
  });

  it('ignores a command from an owner that is not in the lobby', () => {
    const l = lobby();
    l.join(1, 1);
    expect(l.command(77, { action: 'start' })).toBe('ignored');
  });

  it('lets only the leader change the mode, and only to a different one', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    expect(l.command(2, { action: 'setMode', mode: 'competitive' })).toBe('ignored');
    expect(l.currentMode).toBe('cooperative');
    expect(l.command(1, { action: 'setMode', mode: 'cooperative' })).toBe('ignored');
    expect(l.command(1, { action: 'setMode', mode: 'competitive' })).toBe('modeChanged');
    expect(l.currentMode).toBe('competitive');
  });

  it('ignores every command once the match has started', () => {
    const l = lobby();
    l.join(1, 1);
    l.command(1, { action: 'start' });
    expect(l.command(1, { action: 'start' })).toBe('ignored');
    expect(l.command(1, { action: 'setMode', mode: 'competitive' })).toBe('ignored');
    expect(l.currentMode).toBe('cooperative');
  });

  it('will not start Competitive with a single player, but will once a second joins', () => {
    const l = lobby();
    l.join(1, 1);
    l.command(1, { action: 'setMode', mode: 'competitive' });
    expect(l.command(1, { action: 'start' })).toBe('ignored');
    expect(l.isInMatch).toBe(false);
    l.join(2, 1);
    expect(l.command(1, { action: 'start' })).toBe('started');
  });

  it('counts two local players on one PC as two for Competitive', () => {
    const l = lobby();
    l.join(1, 2);
    l.command(1, { action: 'setMode', mode: 'competitive' });
    expect(l.command(1, { action: 'start' })).toBe('started');
  });

  it('starts Cooperative with a single player', () => {
    const l = lobby();
    l.join(1, 1);
    expect(l.command(1, { action: 'start' })).toBe('started');
  });

  it('gives the new leader the powers when the old one leaves', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    l.leave(1);
    expect(l.command(2, { action: 'start' })).toBe('started');
  });
});

describe('DedicatedLobby match end', () => {
  it('keeps everyone seated and the leader in place', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    l.command(1, { action: 'start' });
    l.endMatch();
    expect(l.isInMatch).toBe(false);
    expect(l.memberSlots).toEqual([0, 1]);
    expect(l.leaderOwner).toBe(1);
  });

  it('hands leadership on when the leader left mid-match', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 1);
    l.command(1, { action: 'start' });
    l.leave(1);
    l.endMatch();
    expect(l.leaderOwner).toBe(2);
  });

  it('keeps the chosen mode while anyone is still seated', () => {
    const l = lobby();
    l.join(1, 1);
    l.command(1, { action: 'setMode', mode: 'competitive' });
    l.join(2, 1);
    l.command(1, { action: 'start' });
    l.endMatch();
    expect(l.currentMode).toBe('competitive');
  });

  it('resets to the default mode once the lobby is empty', () => {
    const l = lobby();
    l.join(1, 1);
    l.command(1, { action: 'setMode', mode: 'competitive' });
    l.join(2, 1);
    l.command(1, { action: 'start' });
    l.leave(1);
    l.leave(2);
    l.endMatch();
    expect(l.currentMode).toBe('cooperative');
    expect(l.leaderSlot).toBe(-1);
  });
});

describe('DedicatedLobby snapshot', () => {
  it('reports everything a client needs to draw the lobby', () => {
    const l = lobby();
    l.join(1, 1);
    l.join(2, 2);
    expect(l.snapshot()).toEqual({
      type: 'debris-lobby',
      status: 'lobby',
      mode: 'cooperative',
      maxPlayers: 4,
      leaderSlot: 0,
      slots: [0, 1, 2],
      heldSlots: [],
    });
  });

  it('includes the held slots it is given', () => {
    const l = lobby();
    l.join(1, 1);
    expect(l.snapshot([0]).heldSlots).toEqual([0]);
  });

  it('returns a copy, not the live member list', () => {
    const l = lobby();
    l.join(1, 1);
    const snap = l.snapshot();
    l.join(2, 1);
    expect(snap.slots).toEqual([0]);
  });
});

describe('DedicatedLobby demoteLeader', () => {
  it('passes leadership to the next joiner and keeps everyone seated', () => {
    const l = lobby();
    l.join(10, 1);
    l.join(11, 2);
    expect(l.leaderOwner).toBe(10);
    expect(l.demoteLeader()).toBe(true);
    expect(l.leaderOwner).toBe(11);
    expect(l.slotsOf(10)).toEqual([0]);
    expect(l.playerCount).toBe(3);
    expect(l.demoteLeader()).toBe(true); // and back: they take turns
    expect(l.leaderOwner).toBe(10);
  });

  it('does nothing for a lone player or during a match', () => {
    const l = lobby();
    l.join(10, 1);
    expect(l.demoteLeader()).toBe(false);
    l.join(11, 1);
    l.command(10, { action: 'start' });
    expect(l.demoteLeader()).toBe(false);
    expect(l.leaderOwner).toBe(10);
  });
});
