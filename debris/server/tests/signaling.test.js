'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createSignalingServer, isStatusRequest, MAX_MESSAGE_BYTES } = require('../src/signaling');

const open = (port) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
const next = (socket) => new Promise((resolve) => socket.once('message', (d) => resolve(d.toString())));
const closed = (socket) => new Promise((resolve) => socket.once('close', (code) => resolve(code)));

async function withServer(fn) {
  const received = [];
  const gone = [];
  const server = await createSignalingServer({
    port: 0,
    bindAddress: '127.0.0.1',
    onMessage: (peerId, data) => received.push({ peerId, data }),
    onPeerClosed: (peerId) => gone.push(peerId),
  });
  try {
    await fn({ server, received, gone });
  } finally {
    await server.close();
  }
}

test('forwards a message with a peer id and routes the reply back to that socket', async () => {
  await withServer(async ({ server, received }) => {
    const a = await open(server.port);
    const b = await open(server.port);
    a.send('from-a');
    b.send('from-b');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(received.length, 2);
    const peerA = received.find((m) => m.data === 'from-a').peerId;
    const peerB = received.find((m) => m.data === 'from-b').peerId;
    assert.notEqual(peerA, peerB);

    const replyA = next(a);
    server.send(peerA, 'to-a');
    assert.equal(await replyA, 'to-a');
    a.close();
    b.close();
  });
});

test('reports a closed peer and stops delivering to it', async () => {
  await withServer(async ({ server, received, gone }) => {
    const socket = await open(server.port);
    socket.send('hello');
    await new Promise((r) => setTimeout(r, 50));
    const { peerId } = received[0];
    socket.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(gone, [peerId]);
    assert.doesNotThrow(() => server.send(peerId, 'too late'));
  });
});

test('ignores binary frames', async () => {
  await withServer(async ({ server, received }) => {
    const socket = await open(server.port);
    socket.send(Buffer.from([1, 2, 3]));
    socket.send('text');
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(received.map((m) => m.data), ['text']);
    socket.close();
  });
});

test('drops a connection that sends an oversized message', async () => {
  await withServer(async ({ server, received }) => {
    const socket = await open(server.port);
    const closing = closed(socket);
    socket.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    assert.equal(await closing, 1009); // "message too big"
    assert.equal(received.length, 0);
  });
});

test('rejects with the underlying error when the port is taken', async () => {
  await withServer(async ({ server }) => {
    await assert.rejects(
      createSignalingServer({ port: server.port, bindAddress: '127.0.0.1', onMessage: () => {} }),
      /EADDRINUSE/,
    );
  });
});

test('isStatusRequest only matches a well-formed status query', () => {
  assert.equal(isStatusRequest('{"type":"debris-status"}'), true);
  assert.equal(isStatusRequest('{"type":"debris-signal","payload":"debris-status"}'), false);
  assert.equal(isStatusRequest('debris-status'), false);
  assert.equal(isStatusRequest('[]'), false);
  assert.equal(isStatusRequest('{"type":"debris-status"'), false);
});

test('answers a status query itself and never forwards it to the game page', async () => {
  const received = [];
  const server = await createSignalingServer({
    port: 0,
    bindAddress: '127.0.0.1',
    onMessage: (peerId, data) => received.push(data),
    getStatusReply: () => ({ type: 'debris-status-reply', name: 'Test' }),
  });
  try {
    const socket = await open(server.port);
    const reply = next(socket);
    socket.send('{"type":"debris-status"}');
    assert.deepEqual(JSON.parse(await reply), { type: 'debris-status-reply', name: 'Test' });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(received, []);
    socket.close();
  } finally {
    await server.close();
  }
});

test('stays silent on a status query while the page has reported nothing yet', async () => {
  const server = await createSignalingServer({
    port: 0,
    bindAddress: '127.0.0.1',
    onMessage: () => {},
    getStatusReply: () => undefined,
  });
  try {
    const socket = await open(server.port);
    let got = false;
    socket.on('message', () => { got = true; });
    socket.send('{"type":"debris-status"}');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(got, false);
    socket.close();
  } finally {
    await server.close();
  }
});

async function withLimits(limits, fn) {
  const received = [];
  const server = await createSignalingServer({
    port: 0,
    bindAddress: '127.0.0.1',
    limits,
    onMessage: (peerId, data) => received.push(data),
  });
  try {
    await fn({ server, received });
  } finally {
    await server.close();
  }
}

test('limits: connections beyond the per-address cap are refused, and freed again on close', async () => {
  await withLimits({ maxConnectionsPerIp: 2 }, async ({ server }) => {
    const a = await open(server.port);
    const b = await open(server.port);
    const c = await open(server.port); // the TCP/WS handshake succeeds, then the server closes it
    assert.equal(await closed(c), 1013);
    a.close();
    await closed(a);
    await new Promise((r) => setTimeout(r, 50));
    const d = await open(server.port);
    d.send('ok');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(d.readyState, WebSocket.OPEN);
    b.close();
    d.close();
  });
});

test('limits: the total connection cap holds', async () => {
  await withLimits({ maxConnections: 1, maxConnectionsPerIp: 5 }, async ({ server }) => {
    const a = await open(server.port);
    const b = await open(server.port);
    assert.equal(await closed(b), 1013);
    assert.equal(a.readyState, WebSocket.OPEN);
    a.close();
  });
});

test('limits: a flood is cut off after the burst, a steady trickle is not', async () => {
  await withLimits({ burstMessages: 20, messagesPerSecond: 10 }, async ({ server, received }) => {
    const flood = await open(server.port);
    const codePromise = closed(flood);
    for (let i = 0; i < 60; i += 1) flood.send(`m${i}`);
    assert.equal(await codePromise, 1008);
    assert.ok(received.length <= 22, `burst let ${received.length} through`);

    const steady = await open(server.port);
    for (let i = 0; i < 12; i += 1) {
      steady.send(`s${i}`);
      await new Promise((r) => setTimeout(r, 150)); // ~7/s, under the 10/s refill
    }
    assert.equal(steady.readyState, WebSocket.OPEN);
    steady.close();
  });
});

test('limits: a silent socket is closed after the idle timeout; traffic keeps it alive', async () => {
  await withLimits({ idleTimeoutMs: 300 }, async ({ server }) => {
    const silent = await open(server.port);
    const busy = await open(server.port);
    const silentClosed = closed(silent);
    for (let i = 0; i < 6; i += 1) {
      busy.send('ping');
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(await silentClosed, 1000);
    assert.equal(busy.readyState, WebSocket.OPEN);
    busy.close();
  });
});
