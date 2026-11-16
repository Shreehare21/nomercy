import test from 'node:test'
import assert from 'node:assert/strict'
import { act, makeDeck, start, view } from '../server/game.js'

const card = (id, kind, color = 'red') => ({ id, kind, color })
function fixture() {
  const players = ['A', 'B', 'C'].map(id => ({ id, name: id }))
  const room = { players }
  start(room)
  room.color = 'red'
  room.discard = [card(200, '3')]
  return [room, ...players]
}

test('deck has 168 unique cards and deals private hands', () => {
  const deck = makeDeck()
  assert.equal(new Set(deck.map(held => held.id)).size, 168)
  assert.equal(deck.filter(held => held.kind === 'reverse4').length, 8)
  const [room, a] = fixture()
  const state = view(room, a)
  assert.equal(state.hand.length, 7)
  assert.ok(state.players.every(player => player.count === 7 && !('hand' in player)))
})

test('draw stacking rejects smaller penalties, then eliminates at 25', () => {
  const [room, a, b, c] = fixture()
  a.hand = [card(201, 'draw4'), card(202, '5')]
  b.hand = [card(203, 'draw2'), card(204, 'draw6', null)]
  c.hand = makeDeck().slice(0, 24)
  act(room, a, 'play', { cardId: 201 })
  assert.throws(() => act(room, b, 'play', { cardId: 203 }), /cannot be played/)
  act(room, b, 'play', { cardId: 204, color: 'yellow' })
  assert.equal(room.stack, 10)
  act(room, c, 'draw')
  assert.equal(c.out, true)
  assert.equal(room.stack, 0)
  assert.equal(room.turn, a.id)
})

test('roulette keeps wild cards and stops on the chosen color', () => {
  const [room, a, b, c] = fixture()
  a.hand = [card(201, 'roulette', null), card(202, '5')]
  room.deck = [card(203, '9'), card(204, '4', 'blue'), card(205, 'draw10', null)]
  act(room, a, 'play', { cardId: 201, color: 'blue' })
  assert.deepEqual(b.hand.slice(-2).map(held => held.id), [205, 204])
  assert.equal(room.turn, c.id)
})

test('7 swaps and 0 passes hands in the current direction', () => {
  const [room, a, b, c] = fixture()
  a.hand = [card(201, '7'), card(202, '5')]
  b.hand = [card(203, '0'), card(204, '6')]
  c.hand = [card(205, '4')]
  room.direction = -1
  act(room, a, 'play', { cardId: 201, target: c.id })
  assert.deepEqual(a.hand.map(held => held.id), [205])
  assert.deepEqual(c.hand.map(held => held.id), [202])
  assert.equal(room.turn, c.id)
  // Isolate the rotation from B's seat.
  room.turn = b.id
  act(room, b, 'play', { cardId: 203 })
  assert.deepEqual(a.hand.map(held => held.id), [204])
  assert.deepEqual(b.hand.map(held => held.id), [202])
  assert.deepEqual(c.hand.map(held => held.id), [205])
})

test('UNO is required before the final card', () => {
  const [room, a] = fixture()
  a.hand = [card(201, '5')]
  assert.throws(() => act(room, a, 'play', { cardId: 201 }), /Call UNO/)
  act(room, a, 'uno')
  act(room, a, 'play', { cardId: 201 })
  assert.equal(room.winner, a.id)
})

test('an ordinary draw stops at the first playable card', () => {
  const [room, a] = fixture()
  a.hand = [card(201, '5')]
  room.deck = [card(202, '8'), card(203, '7', 'blue')]
  act(room, a, 'draw')
  assert.deepEqual(view(room, a).legal, [202])
  assert.equal(a.hand.length, 3)
})

test('Discard All empties matching cards, and Skip Everyone retains the turn', () => {
  const [room, a] = fixture()
  a.hand = [card(201, 'skipAll'), card(202, 'discard'), card(203, '4')]
  act(room, a, 'play', { cardId: 201 })
  assert.equal(room.turn, a.id)
  act(room, a, 'play', { cardId: 202 })
  assert.equal(room.winner, a.id)
})

