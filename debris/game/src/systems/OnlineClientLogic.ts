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
