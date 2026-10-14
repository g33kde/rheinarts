import { PROTOCOL_VERSION } from './LanDiscoveryProtocol';
import type { RejectReason } from './NetworkHandshakeProtocol';
import type { StatusReply } from './OnlineProtocol';

/**
 * The decisions behind the client's Online screens, kept pure so they are
 * unit-tested (docs/roadmap.md's "Windows + LAN multiplayer" - online
 * phase 5). The scenes only draw what these return.
 */

/** What to tell a player whose join the server turned away. */
export function describeReject(reason: RejectReason): string {
  switch (reason) {
    case 'full':
      return 'The server is full.';
    case 'matchInProgress':
      return 'A match is in progress - try again when it ends.';
    case 'badPassword':
      return 'Wrong password.';
    case 'wrongVersion':
      return 'This server runs a different version of Debris. Update the game and try again.';
    case 'badRequest':
      return 'The server could not understand the join request.';
  }
}

export interface StatusView {
  /** Lines for the status panel, top to bottom. */
  readonly lines: readonly string[];
  /** Whether the JOIN button should be offered. */
  readonly joinable: boolean;
  /** Why not, when it isn't. */
  readonly blocker: string | undefined;
}

/** `null` = the server did not answer (down, wrong address, firewalled) or answered with something unreadable. */
export function describeStatus(reply: StatusReply | null, clientVersion = PROTOCOL_VERSION): StatusView {
  if (reply === null) {
    return { lines: ['Cannot reach the server.'], joinable: false, blocker: 'Cannot reach the server.' };
  }
  const lines = [
    reply.name,
    ...(reply.motd !== '' ? [reply.motd] : []),
    '',
    `Players: ${reply.players.current}/${reply.players.max}`,
    `Mode: ${reply.mode === 'cooperative' ? 'Cooperative' : 'Competitive'}`,
    reply.status === 'inMatch' ? 'A match is in progress' : 'Waiting in the lobby',
    ...(reply.passwordRequired ? ['Password required'] : []),
  ];
  if (reply.protocolVersion !== clientVersion) {
    return {
      lines: [...lines, '', 'Different game version - update to join.'],
      joinable: false,
      blocker: 'Different game version - update to join.',
    };
  }
  if (reply.status === 'inMatch') return { lines, joinable: false, blocker: 'A match is in progress.' };
  if (reply.players.current >= reply.players.max) return { lines, joinable: false, blocker: 'The server is full.' };
  return { lines, joinable: true, blocker: undefined };
}

/**
 * How long to wait before the next reconnect attempt, or `undefined` to
 * give up. Tries at once, then every second for a bit, then every two
 * seconds, and stops when the server's own grace period would have run out
 * (an attempt after that could only be turned away).
 */
export function reconnectDelay(attempt: number, elapsedMs: number, graceMs: number): number | undefined {
  const delay = attempt === 0 ? 0 : attempt < 4 ? 1000 : 2000;
  return elapsedMs + delay < graceMs ? delay : undefined;
}

export const MAX_PASSWORD_LENGTH = 64;

export interface TextEntryResult {
  readonly text: string;
  readonly submitted: boolean;
}

/** Applies one key press to the password being typed. Printable single characters append, Backspace removes the last, Enter submits; everything else (arrows, modifiers, F-keys) is ignored. */
export function applyTextKey(text: string, key: string, maxLength = MAX_PASSWORD_LENGTH): TextEntryResult {
  if (key === 'Enter') return { text, submitted: true };
  if (key === 'Backspace') return { text: text.slice(0, -1), submitted: false };
  if (key.length === 1 && text.length < maxLength && key >= ' ' && key !== '\u007f') {
    return { text: text + key, submitted: false };
  }
  return { text, submitted: false };
}

// ---------------------------------------------------------------
// The join form: initials for each local player, and the password
// ---------------------------------------------------------------

export type FieldKind = 'initials' | 'password';
export type FieldId = 'initials1' | 'initials2' | 'password';

export const INITIALS_LENGTH = 3;

/** Applies a key to one field. Initials accept letters only (stored capitalised, at most three); the password takes any printable character. */
export function applyFieldKey(text: string, kind: FieldKind, key: string): TextEntryResult {
  if (kind === 'password') return applyTextKey(text, key, MAX_PASSWORD_LENGTH);
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
    return { text: text.length < INITIALS_LENGTH ? text + key.toUpperCase() : text, submitted: false };
  }
  // Backspace, Enter and everything else behave as in any text field - but a stray character that is
  // not a letter must not be typed into initials.
  return key.length === 1 ? { text, submitted: false } : applyTextKey(text, key, INITIALS_LENGTH);
}

/** Which field has focus after `key`: Tab/ArrowDown move forward (wrapping), ArrowUp back. `undefined` for any other key. */
export function nextFocus(ids: readonly FieldId[], current: FieldId, key: string): FieldId | undefined {
  if (ids.length === 0) return undefined;
  const index = Math.max(0, ids.indexOf(current));
  if (key === 'Tab' || key === 'ArrowDown') return ids[(index + 1) % ids.length];
  if (key === 'ArrowUp') return ids[(index - 1 + ids.length) % ids.length];
  return undefined;
}

/** Whether every local player has a full set of initials. */
export function initialsReady(initials: readonly string[], players: 1 | 2): boolean {
  return initials.slice(0, players).length === players && initials.slice(0, players).every((i) => /^[A-Z]{3}$/.test(i));
}

/** Initials remembered from a previous visit (`localStorage` text). Anything malformed becomes empty. */
export function parseStoredInitials(raw: string | null): [string, string] {
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const pick = (v: unknown): string => (typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : '');
      return [pick(parsed[0]), pick(parsed[1])];
    }
  } catch {
    // fall through to empty
  }
  return ['', ''];
}
