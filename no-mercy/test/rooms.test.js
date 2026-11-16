import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { attachRooms } from '../server/rooms.js'

test('two sockets join, receive private state, reject an out-of-turn move and relay voice', { timeout: 6000 }, async t => {
  const http = createServer()
  const server = new Server(http)
  attachRooms(server)
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const url = 'http://127.0.0.1:' + http.address().port
  const a = io(url, { forceNew: true })
  const b = io(url, { forceNew: true })
  t.after(async () => {
    a.disconnect()
    b.disconnect()
    await server.close()
  })
  await Promise.all([once(a, 'connect'), once(b, 'connect')])
  const send = (client, event, data = {}) => client.timeout(1500).emitWithAck(event, data)
  const made = once(a, 'room:state')
  assert.deepEqual(await send(a, 'room:create', { name: 'A' }), { ok: true })
  const [{ code }] = await made
  const joined = Promise.all([once(a, 'room:state'), once(b, 'room:state')])
  assert.deepEqual(await send(b, 'room:join', { code, name: 'B' }), { ok: true })
  await joined
  const started = Promise.all([once(a, 'room:state'), once(b, 'room:state')])
  assert.deepEqual(await send(a, 'room:start'), { ok: true })
  const [[stateA], [stateB]] = await started
  assert.equal(stateA.turn, stateA.you)
  assert.equal(stateB.turn, stateA.you)
  assert.equal(stateB.hand.length, 7)
  assert.ok(stateB.hand.every(held => !stateA.hand.some(other => held.id === other.id)))
  assert.match((await send(b, 'game:action', { type: 'draw' })).error, /Wait for your turn/)
  await send(a, 'voice:ready', { enabled: true })
  await send(b, 'voice:ready', { enabled: true })
  const signal = once(b, 'voice:signal')
  await send(a, 'voice:signal', { to: stateB.you, signal: { description: { type: 'offer', sdp: 'test' } } })
  assert.equal((await signal)[0].from, stateA.you)
  const synced = Promise.all([once(a, 'room:state'), once(b, 'room:state')])
  assert.deepEqual(await send(a, 'game:action', { type: 'draw' }), { ok: true })
  const [[nextA], [nextB]] = await synced
  assert.equal(nextA.notice, nextB.notice)
  assert.equal(nextA.turn, nextB.turn)
})

