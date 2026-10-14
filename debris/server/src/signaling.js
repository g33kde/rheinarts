'use strict';

const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

// A WebRTC offer with its candidates is a few KB; this is generous headroom
// without letting anyone push megabytes through the signaling socket.
const MAX_MESSAGE_BYTES = 64 * 1024;

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
function createSignalingServer({ port, bindAddress = '0.0.0.0', onMessage, onPeerClosed = () => {}, getStatusReply = () => undefined, logger }) {
  return new Promise((resolve, reject) => {
    const sockets = new Map();
    const wss = new WebSocketServer({ port, host: bindAddress, maxPayload: MAX_MESSAGE_BYTES });

    wss.once('error', reject);
    wss.on('connection', (socket, request) => {
      const peerId = crypto.randomUUID();
      sockets.set(peerId, socket);
      logger?.debug(`signaling: peer ${peerId.slice(0, 8)} connected from ${request.socket.remoteAddress}`);

      socket.on('message', (data, isBinary) => {
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
        sockets.delete(peerId);
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

module.exports = { createSignalingServer, isStatusRequest, MAX_MESSAGE_BYTES };
