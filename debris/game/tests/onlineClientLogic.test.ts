import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/systems/LanDiscoveryProtocol';
import type { RejectReason } from '../src/systems/NetworkHandshakeProtocol';
import {
  applyFieldKey,
  applyTextKey,
  describeReject,
  describeStatus,
  initialsReady,
  nextFocus,
  parseStoredInitials,
  reconnectDelay,
  type FieldId,
} from '../src/systems/OnlineClientLogic';
import type { StatusReply } from '../src/systems/OnlineProtocol';

const REPLY: StatusReply = {
  type: 'debris-status-reply',
  protocolVersion: PROTOCOL_VERSION,
  name: 'Debris Server',
  motd: 'Have fun',
  passwordRequired: false,
  status: 'lobby',
  mode: 'cooperative',
  players: { current: 1, max: 4 },
};

describe('describeReject', () => {
  it('has a distinct, non-empty message for every reason', () => {
    const reasons: RejectReason[] = ['full', 'matchInProgress', 'badPassword', 'wrongVersion', 'badRequest'];
    const messages = reasons.map(describeReject);
    expect(messages.every((m) => m.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(reasons.length);
  });
});

describe('describeStatus', () => {
  it('is joinable for an open lobby and shows the basics', () => {
    const view = describeStatus(REPLY);
    expect(view.joinable).toBe(true);
    expect(view.blocker).toBeUndefined();
    expect(view.lines).toContain('Debris Server');
    expect(view.lines).toContain('Have fun');
    expect(view.lines).toContain('Players: 1/4');
    expect(view.lines).toContain('Mode: Cooperative');
    expect(view.lines).not.toContain('Password required');
  });

  it('omits an empty message of the day', () => {
    // name, then the blank spacer, then the facts - no extra empty line where the motd would be
    expect(describeStatus({ ...REPLY, motd: '' }).lines.slice(0, 3)).toEqual(['Debris Server', '', 'Players: 1/4']);
    expect(describeStatus(REPLY).lines.slice(0, 4)).toEqual(['Debris Server', 'Have fun', '', 'Players: 1/4']);
  });

  it('flags a password but stays joinable', () => {
    const view = describeStatus({ ...REPLY, passwordRequired: true });
    expect(view.lines).toContain('Password required');
    expect(view.joinable).toBe(true);
  });

  it('is not joinable when unreachable', () => {
    const view = describeStatus(null);
    expect(view.joinable).toBe(false);
    expect(view.blocker).toMatch(/reach/i);
  });

  it('is not joinable during a match', () => {
    const view = describeStatus({ ...REPLY, status: 'inMatch' });
    expect(view.joinable).toBe(false);
    expect(view.lines).toContain('A match is in progress');
  });

  it('is not joinable when full', () => {
    const view = describeStatus({ ...REPLY, players: { current: 4, max: 4 } });
    expect(view.joinable).toBe(false);
    expect(view.blocker).toMatch(/full/i);
  });

  it('is not joinable on a version mismatch, and says so before anything else', () => {
    const view = describeStatus({ ...REPLY, protocolVersion: PROTOCOL_VERSION + 1, status: 'inMatch' });
    expect(view.joinable).toBe(false);
    expect(view.blocker).toMatch(/version/i);
  });

  it('labels Competitive', () => {
    expect(describeStatus({ ...REPLY, mode: 'competitive' }).lines).toContain('Mode: Competitive');
  });
});

describe('reconnectDelay', () => {
  it('tries at once, then every second, then every two', () => {
    expect(reconnectDelay(0, 0, 30000)).toBe(0);
    expect(reconnectDelay(1, 100, 30000)).toBe(1000);
    expect(reconnectDelay(3, 3000, 30000)).toBe(1000);
    expect(reconnectDelay(4, 4000, 30000)).toBe(2000);
    expect(reconnectDelay(20, 20000, 30000)).toBe(2000);
  });

  it('gives up once the next attempt could not land inside the grace period', () => {
    expect(reconnectDelay(10, 27999, 30000)).toBe(2000);
    expect(reconnectDelay(10, 28000, 30000)).toBeUndefined();
    expect(reconnectDelay(10, 29999, 30000)).toBeUndefined();
    expect(reconnectDelay(10, 40000, 30000)).toBeUndefined();
  });

  it('never retries at all when the server holds seats for no time', () => {
    expect(reconnectDelay(0, 0, 0)).toBeUndefined();
  });
});

describe('applyTextKey', () => {
  it('appends printable characters', () => {
    expect(applyTextKey('ab', 'c')).toEqual({ text: 'abc', submitted: false });
    expect(applyTextKey('', ' ')).toEqual({ text: ' ', submitted: false });
    expect(applyTextKey('', 'Ä')).toEqual({ text: 'Ä', submitted: false });
  });

  it('removes the last character on Backspace, and tolerates an empty field', () => {
    expect(applyTextKey('abc', 'Backspace')).toEqual({ text: 'ab', submitted: false });
    expect(applyTextKey('', 'Backspace')).toEqual({ text: '', submitted: false });
  });

  it('submits on Enter without changing the text', () => {
    expect(applyTextKey('secret', 'Enter')).toEqual({ text: 'secret', submitted: true });
  });

  it('ignores named keys such as arrows, modifiers and function keys', () => {
    for (const key of ['ArrowLeft', 'Shift', 'Control', 'F5', 'Tab', 'Escape']) {
      expect(applyTextKey('abc', key)).toEqual({ text: 'abc', submitted: false });
    }
  });

  it('stops at the maximum length', () => {
    expect(applyTextKey('abc', 'd', 3)).toEqual({ text: 'abc', submitted: false });
    expect(applyTextKey('ab', 'c', 3).text).toBe('abc');
  });
});

describe('applyFieldKey', () => {
  it('types capital letters into initials, whatever case was pressed', () => {
    expect(applyFieldKey('', 'initials', 'm').text).toBe('M');
    expect(applyFieldKey('M', 'initials', 'A').text).toBe('MA');
    expect(applyFieldKey('MA', 'initials', 's').text).toBe('MAS');
  });

  it('stops at three letters', () => {
    expect(applyFieldKey('MAS', 'initials', 'x').text).toBe('MAS');
  });

  it('refuses digits, spaces and punctuation in initials', () => {
    for (const key of ['1', ' ', '-', '_', '.', 'ä']) expect(applyFieldKey('MA', 'initials', key).text).toBe('MA');
  });

  it('still lets Backspace edit initials, and ignores navigation keys', () => {
    expect(applyFieldKey('MAS', 'initials', 'Backspace').text).toBe('MA');
    expect(applyFieldKey('', 'initials', 'Backspace').text).toBe('');
    expect(applyFieldKey('MA', 'initials', 'ArrowLeft').text).toBe('MA');
    expect(applyFieldKey('MA', 'initials', 'Shift').text).toBe('MA');
  });

  it('submits on Enter without changing the text', () => {
    expect(applyFieldKey('MAS', 'initials', 'Enter')).toEqual({ text: 'MAS', submitted: true });
    expect(applyFieldKey('pw', 'password', 'Enter')).toEqual({ text: 'pw', submitted: true });
  });

  it('lets the password take any printable character, case kept', () => {
    expect(applyFieldKey('a', 'password', 'B').text).toBe('aB');
    expect(applyFieldKey('a', 'password', '1').text).toBe('a1');
    expect(applyFieldKey('a', 'password', ' ').text).toBe('a ');
  });
});

describe('nextFocus', () => {
  const ids: FieldId[] = ['initials1', 'initials2', 'password'];

  it('moves forward on Tab and ArrowDown, wrapping', () => {
    expect(nextFocus(ids, 'initials1', 'Tab')).toBe('initials2');
    expect(nextFocus(ids, 'initials2', 'ArrowDown')).toBe('password');
    expect(nextFocus(ids, 'password', 'Tab')).toBe('initials1');
  });

  it('moves back on ArrowUp, wrapping', () => {
    expect(nextFocus(ids, 'initials2', 'ArrowUp')).toBe('initials1');
    expect(nextFocus(ids, 'initials1', 'ArrowUp')).toBe('password');
  });

  it('ignores every other key', () => {
    expect(nextFocus(ids, 'initials1', 'a')).toBeUndefined();
    expect(nextFocus(ids, 'initials1', 'Enter')).toBeUndefined();
  });

  it('copes with a single field, an empty list, and a focus that is no longer shown', () => {
    expect(nextFocus(['initials1'], 'initials1', 'Tab')).toBe('initials1');
    expect(nextFocus([], 'initials1', 'Tab')).toBeUndefined();
    expect(nextFocus(['initials1', 'password'], 'initials2', 'Tab')).toBe('password');
  });
});

describe('initialsReady', () => {
  it('needs three letters for each local player', () => {
    expect(initialsReady(['MAS', ''], 1)).toBe(true);
    expect(initialsReady(['MA', ''], 1)).toBe(false);
    expect(initialsReady(['', ''], 1)).toBe(false);
  });

  it('needs both sets when two players are on the PC', () => {
    expect(initialsReady(['MAS', 'ZED'], 2)).toBe(true);
    expect(initialsReady(['MAS', ''], 2)).toBe(false);
    expect(initialsReady(['MAS'], 2)).toBe(false);
  });

  it('ignores a second set that is not needed', () => {
    expect(initialsReady(['MAS', 'junk'], 1)).toBe(true);
  });
});

describe('parseStoredInitials', () => {
  it('reads what was saved', () => {
    expect(parseStoredInitials('["MAS","ZED"]')).toEqual(['MAS', 'ZED']);
    expect(parseStoredInitials('["MAS"]')).toEqual(['MAS', '']);
  });

  it('turns anything malformed into empty fields', () => {
    for (const bad of [null, '', 'nope', '{}', '[1,2]', '["mas","Z"]', '"MAS"']) {
      expect(parseStoredInitials(bad)).toEqual(['', '']);
    }
  });

  it('keeps the valid half of a half-valid entry', () => {
    expect(parseStoredInitials('["MAS","z"]')).toEqual(['MAS', '']);
  });
});
