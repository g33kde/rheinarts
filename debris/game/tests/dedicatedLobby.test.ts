import { describe, expect, it } from 'vitest';
import { DedicatedLobby } from '../src/systems/DedicatedLobby';

const lobby = (max = 4) => new DedicatedLobby(max, 'cooperative');

describe('DedicatedLobby joining', () => {
  it('seats players in the lowest free slot', () => {
    const l = lobby();
    expect(l.join()).toEqual({ ok: true, slotIndex: 0 });
    expect(l.join()).toEqual({ ok: true, slotIndex: 1 });
    l.leave(0);
    expect(l.join()).toEqual({ ok: true, slotIndex: 0 });
  });

  it('turns away a fifth player', () => {
    const l = lobby();
    for (let i = 0; i < 4; i += 1) l.join();
    expect(l.join()).toEqual({ ok: false, reason: 'full' });
  });

  it('respects a smaller maxPlayers', () => {
    const l = lobby(2);
    l.join();
    l.join();
    expect(l.join()).toEqual({ ok: false, reason: 'full' });
  });

  it('turns joiners away while a match is running, and takes them again after', () => {
    const l = lobby();
    l.join();
    l.command(0, { action: 'start' });
    expect(l.join()).toEqual({ ok: false, reason: 'matchInProgress' });
    l.endMatch();
    expect(l.join()).toEqual({ ok: true, slotIndex: 1 });
  });
});

describe('DedicatedLobby leadership', () => {
  it('makes the first joiner leader', () => {
    const l = lobby();
    l.join();
    l.join();
    expect(l.leaderSlot).toBe(0);
  });

  it('has no leader when empty', () => {
    expect(lobby().leaderSlot).toBe(-1);
  });

  it('passes leadership to the earliest remaining joiner, not the lowest slot', () => {
    const l = lobby();
    l.join(); // slot 0, leader
    l.join(); // slot 1
    l.join(); // slot 2
    l.leave(0);
    expect(l.leaderSlot).toBe(1);
    expect(l.join()).toEqual({ ok: true, slotIndex: 0 }); // reuses slot 0, but joined last
    l.leave(1);
    expect(l.leaderSlot).toBe(2);
  });

  it('does not change the leader when a non-leader leaves', () => {
    const l = lobby();
    l.join();
    l.join();
    l.leave(1);
    expect(l.leaderSlot).toBe(0);
  });
});

describe('DedicatedLobby commands', () => {
  it('lets only the leader start', () => {
    const l = lobby();
    l.join();
    l.join();
    expect(l.command(1, { action: 'start' })).toBe('ignored');
    expect(l.isInMatch).toBe(false);
    expect(l.command(0, { action: 'start' })).toBe('started');
    expect(l.isInMatch).toBe(true);
  });

  it('ignores a command from a slot that is not in the lobby', () => {
    const l = lobby();
    l.join();
    expect(l.command(3, { action: 'start' })).toBe('ignored');
  });

  it('lets only the leader change the mode, and only to a different one', () => {
    const l = lobby();
    l.join();
    l.join();
    expect(l.command(1, { action: 'setMode', mode: 'competitive' })).toBe('ignored');
    expect(l.currentMode).toBe('cooperative');
    expect(l.command(0, { action: 'setMode', mode: 'cooperative' })).toBe('ignored');
    expect(l.command(0, { action: 'setMode', mode: 'competitive' })).toBe('modeChanged');
    expect(l.currentMode).toBe('competitive');
  });

  it('ignores every command once the match has started', () => {
    const l = lobby();
    l.join();
    l.command(0, { action: 'start' });
    expect(l.command(0, { action: 'start' })).toBe('ignored');
    expect(l.command(0, { action: 'setMode', mode: 'competitive' })).toBe('ignored');
    expect(l.currentMode).toBe('cooperative');
  });

  it('will not start Competitive with a single player, but will once a second joins', () => {
    const l = lobby();
    l.join();
    l.command(0, { action: 'setMode', mode: 'competitive' });
    expect(l.command(0, { action: 'start' })).toBe('ignored');
    expect(l.isInMatch).toBe(false);
    l.join();
    expect(l.command(0, { action: 'start' })).toBe('started');
  });

  it('starts Cooperative with a single player', () => {
    const l = lobby();
    l.join();
    expect(l.command(0, { action: 'start' })).toBe('started');
  });

  it('gives the new leader the powers when the old one leaves', () => {
    const l = lobby();
    l.join();
    l.join();
    l.leave(0);
    expect(l.command(1, { action: 'start' })).toBe('started');
  });
});

describe('DedicatedLobby match end', () => {
  it('keeps everyone seated and the leader in place', () => {
    const l = lobby();
    l.join();
    l.join();
    l.command(0, { action: 'start' });
    l.endMatch();
    expect(l.isInMatch).toBe(false);
    expect(l.memberSlots).toEqual([0, 1]);
    expect(l.leaderSlot).toBe(0);
  });

  it('hands leadership on when the leader left mid-match', () => {
    const l = lobby();
    l.join();
    l.join();
    l.command(0, { action: 'start' });
    l.leave(0);
    l.endMatch();
    expect(l.leaderSlot).toBe(1);
  });

  it('keeps the chosen mode while anyone is still seated', () => {
    const l = lobby();
    l.join();
    l.command(0, { action: 'setMode', mode: 'competitive' });
    l.command(0, { action: 'start' });
    l.endMatch();
    expect(l.currentMode).toBe('competitive');
  });

  it('resets to the default mode once the lobby is empty', () => {
    const l = lobby();
    l.join();
    l.command(0, { action: 'setMode', mode: 'competitive' });
    l.command(0, { action: 'start' });
    l.leave(0);
    l.endMatch();
    expect(l.currentMode).toBe('cooperative');
    expect(l.leaderSlot).toBe(-1);
  });
});

describe('DedicatedLobby snapshot', () => {
  it('reports everything a client needs to draw the lobby', () => {
    const l = lobby();
    l.join();
    l.join();
    expect(l.snapshot()).toEqual({
      type: 'debris-lobby',
      status: 'lobby',
      mode: 'cooperative',
      maxPlayers: 4,
      leaderSlot: 0,
      slots: [0, 1],
    });
  });

  it('returns a copy, not the live member list', () => {
    const l = lobby();
    l.join();
    const snap = l.snapshot();
    l.join();
    expect(snap.slots).toEqual([0]);
  });
});
