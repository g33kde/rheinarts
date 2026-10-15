'use strict';

const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

// A WebRTC offer with its candidates is a few KB; this is generous headroom
// without letting anyone push megabytes through the signaling socket.
const MAX_MESSAGE_BYTES = 64 * 1024;

/** Abuse limits; the server's `limits` config section overrides these. */
const DEFAULT_LIMITS = Object.freeze({
  maxConnections: 64, // signaling sockets at once, all addresses together
  maxConnectionsPerIp: 8, // ... and from one address (a household shares one)
  messagesPerSecond: 30, // sustained rate per socket; a handshake is ~30 messages in a burst, which the bucket absorbs
  burstMessages: 80,
  idleTimeoutMs: 30000, // a socket that sends nothing for this long is closed (0 = never)
});

/** Cheap pre-check first, so the common case (an offer or ICE candidate) is not parsed twice. */
function isStatusRequest(text) {
  if (!text.includes('debris-status')) return false;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && parsed.type === 'debris-status';
  } catch {
    return false;
  }
}

/**
 * The WebSocket signaling endpoint. It is deliberately dumb transport: it
 * hands every text message to `onMessage(peerId, data)` and sends replies
 * back on the matching socket. All WebRTC logic - and all validation of
 * what a message means - lives in the game page (`RtcSignalingHost`), the
 * same code a LAN host runs.
 *
 * `peerId` is a random per-socket id, never reused, and it is the only
 * handle the page ever sees (no addresses cross into game code).
 *
 * Resolves once the socket is actually listening, so callers can log the
 * bound port (useful with `port: 0` in tests) and fail fast on EADDRINUSE.
 */
function createSignalingServer({ port, bindAddress = '0.0.0.0', onMessage, onPeerClosed = () => {}, getStatusReply = () => undefined, limits = {}, logger }) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  return new Promise((resolve, reject) => {
    const sockets = new Map();
    const perIp = new Map();
    let lastRefusalLog = 0;
    const wss = new WebSocketServer({ port, host: bindAddress, maxPayload: MAX_MESSAGE_BYTES });

    wss.once('error', reject);
    wss.on('connection', (socket, request) => {
      const ip = request.socket.remoteAddress ?? 'unknown';
      if (sockets.size >= lim.maxConnections || (perIp.get(ip) ?? 0) >= lim.maxConnectionsPerIp) {
        // Logged at most once a minute: a flood must not also flood the log.
        if (Date.now() - lastRefusalLog > 60000) {
          lastRefusalLog = Date.now();
          logger?.warn(`signaling: refusing connections (limit reached; latest from ${ip})`);
        }
        socket.close(1013, 'too many connections');
        return;
      }
      const peerId = crypto.randomUUID();
      sockets.set(peerId, socket);
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);

      // Token bucket: refills at messagesPerSecond up to burstMessages.
      let tokens = lim.burstMessages;
      let refilledAt = Date.now();
      let idleTimer;
      let cutOff = false;
      const armIdle = () => {
        if (lim.idleTimeoutMs <= 0) return;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          logger?.debug(`signaling: peer ${peerId.slice(0, 8)} idle - closing`);
          socket.close(1000, 'idle');
        }, lim.idleTimeoutMs);
      };
      armIdle();
      logger?.debug(`signaling: peer ${peerId.slice(0, 8)} connected from ${request.socket.remoteAddress}`);

      socket.on('message', (data, isBinary) => {
        if (cutOff) return; // messages already queued when the limit hit
        const now = Date.now();
        tokens = Math.min(lim.burstMessages, tokens + ((now - refilledAt) / 1000) * lim.messagesPerSecond);
        refilledAt = now;
        if (tokens < 1) {
          logger?.warn(`signaling: peer ${peerId.slice(0, 8)} (${ip}) sent too many messages - closing`);
          cutOff = true;
          socket.close(1008, 'rate limit');
          return;
        }
        tokens -= 1;
        armIdle();
        if (isBinary) return; // signaling is JSON text only
        const text = data.toString();
        // A status query (the Online screen asking who is on) is answered
        // right here: it needs no WebRTC and nothing from the game page
        // beyond the status it last reported.
        if (isStatusRequest(text)) {
          const reply = getStatusReply();
          if (reply !== undefined && socket.readyState === socket.OPEN) socket.send(JSON.stringify(reply));
          return;
        }
        onMessage(peerId, text);
      });
      socket.on('close', () => {
        clearTimeout(idleTimer);
        sockets.delete(peerId);
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left <= 0) perIp.delete(ip);
        else perIp.set(ip, left);
        logger?.debug(`signaling: peer ${peerId.slice(0, 8)} closed`);
        onPeerClosed(peerId);
      });
      socket.on('error', (error) => logger?.warn(`signaling: peer ${peerId.slice(0, 8)} error: ${error.message}`));
    });

    wss.once('listening', () => {
      wss.off('error', reject);
      wss.on('error', (error) => logger?.error(`signaling server error: ${error.message}`));
      resolve({
        port: wss.address().port,
        send(peerId, data) {
          const socket = sockets.get(peerId);
          if (socket && socket.readyState === socket.OPEN) socket.send(data);
        },
        close() {
          sockets.forEach((socket) => socket.terminate());
          sockets.clear();
          return new Promise((done) => wss.close(() => done()));
        },
      });
    });
  });
}

module.exports = { createSignalingServer, DEFAULT_LIMITS, isStatusRequest, MAX_MESSAGE_BYTES };
