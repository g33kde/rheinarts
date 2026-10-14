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
