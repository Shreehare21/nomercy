import { randomInt } from 'node:crypto'

export const colors = ['red', 'yellow', 'green', 'blue']
export const penalties = { draw2: 2, draw4: 4, reverse4: 4, draw6: 6, draw10: 10 }
export const labels = { draw2: '+2', draw4: '+4', skip: 'Skip', skipAll: 'Skip All', reverse: 'Reverse', discard: 'Discard All', reverse4: 'Reverse +4', draw6: '+6', draw10: '+10', roulette: 'Roulette' }

export function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export function makeDeck() {
  const cards = []
  function add(color, kind, count) {
    for (let i = 0; i < count; i++) cards.push({ id: cards.length, color, kind })
  }
  for (const color of colors) {
    for (let n = 0; n < 10; n++) add(color, String(n), 2)
    for (const [kind, count] of Object.entries({ draw2: 3, draw4: 2, skip: 3, skipAll: 2, reverse: 3, discard: 3 })) add(color, kind, count)
  }
  for (const [kind, count] of Object.entries({ reverse4: 8, draw6: 4, draw10: 4, roulette: 8 })) add(null, kind, count)
  return shuffle(cards)
}

function check(condition, message) {
  if (!condition) throw new Error(message)
}

const active = room => room.players.filter(player => !player.out)
const top = room => room.discard.at(-1)
const cardName = card => labels[card.kind] ?? card.kind

export function nextPlayer(room, from) {
  const count = room.players.length
  const index = room.players.indexOf(from)
  for (let step = 1; step <= count; step++) {
    const candidate = room.players[(index + room.direction * step + count) % count]
    if (!candidate.out) return candidate
  }
}

function pull(room) {
  if (!room.deck.length && room.discard.length > 1) {
    const visible = room.discard.pop()
    room.deck = shuffle(room.discard)
    room.discard = [visible]
  }
  return room.deck.pop()
}

function resetUno(player) {
  player.uno = false
}

function take(room, player, count, stop = () => false) {
  resetUno(player)
  let drawn = 0
  while (drawn < count) {
    const card = pull(room)
    if (!card) break
    player.hand.push(card)
    drawn++
    if (player.hand.length >= 25) {
      player.out = true
      room.deck.push(...player.hand)
      shuffle(room.deck)
      player.hand = []
      break
    }
    if (stop(card)) break
  }
  return drawn
}

function beginTurn(room, player) {
  room.turn = player.id
  room.drawnCard = null
}

function finish(room, winner) {
  room.phase = 'finished'
  room.winner = winner?.id ?? null
  room.notice = winner ? winner.name + ' wins the round!' : 'Round over.'
}

export function start(room) {
  check(room.players.length >= 2, 'Add a player or a bot to start.')
  const deck = makeDeck()
  const first = deck.splice(deck.findIndex(card => /^\d$/.test(card.kind)), 1)[0]
  for (const player of room.players) {
    player.out = false
    resetUno(player)
    player.hand = deck.splice(-7)
  }
  Object.assign(room, {
    phase: 'playing', deck, discard: [first], color: first.color,
    direction: 1, stack: 0, minimum: 0, winner: null, notice: 'Round started.'
  })
  beginTurn(room, room.players[0])
}

export function legal(room, card) {
  if (room.drawnCard !== null && room.drawnCard !== card.id) return false
  if (room.stack) return (penalties[card.kind] ?? 0) >= room.minimum
  return !card.color || card.color === room.color || card.kind === top(room).kind
}

export function act(room, player, type, data = {}) {
  check(room.phase === 'playing' && !player.out, 'The round is inactive for you.')
  if (type === 'uno') {
    check(player.hand.length === 1, 'Call UNO when you have one card.')
    player.uno = true
    room.notice = player.name + ' calls UNO!'
    return
  }
  check(room.turn === player.id, 'Wait for your turn.')
  if (type === 'draw') {
    check(room.drawnCard === null, 'Play the card you drew.')
    const stacked = room.stack
    let playable = null
    const drawn = stacked ? take(room, player, stacked) : take(room, player, Infinity, card => {
      if (!legal(room, card)) return false
      playable = card
      return true
    })
    room.notice = player.out ? player.name + ' hit the Mercy limit.' : player.name + ' drew ' + drawn + '.'
    if (active(room).length === 1) return finish(room, active(room)[0])
    if (stacked || player.out || !playable) {
      room.stack = room.minimum = 0
      beginTurn(room, nextPlayer(room, player))
    } else {
      room.drawnCard = playable.id
    }
    return
  }
  check(type === 'play', 'Unknown move.')
  const index = player.hand.findIndex(card => card.id === data.cardId)
  const card = player.hand[index]
  check(card && legal(room, card), 'That card cannot be played now.')
  check(card.color || colors.includes(data.color), 'Choose a color.')
  const target = active(room).find(other => other !== player && other.id === data.target)
  check(card.kind !== '7' || target, 'Choose a player to swap with.')
  check(player.hand.length !== 1 || player.uno, 'Call UNO before playing your final card.')
  player.hand.splice(index, 1)
  resetUno(player)
  room.color = card.color || data.color
  room.notice = player.name + ' played ' + cardName(card) + '.'
  if (card.kind === 'discard') {
    room.discard.push(...player.hand.filter(held => held.color === card.color))
    player.hand = player.hand.filter(held => held.color !== card.color)
  }
  room.discard.push(card)
  if (card.kind === '7') {
    ;[player.hand, target.hand] = [target.hand, player.hand]
    resetUno(target)
  }
  if (card.kind === '0') {
    const transfers = active(room).map(holder => [nextPlayer(room, holder), holder.hand])
    for (const [receiver, hand] of transfers) {
      receiver.hand = hand
      resetUno(receiver)
    }
  }
  const empty = active(room).find(holder => holder.hand.length === 0)
  if (empty) return finish(room, empty)

  if (card.kind === 'reverse' || card.kind === 'reverse4') room.direction *= -1
  let next = nextPlayer(room, player)
  if (card.kind === 'skipAll' || (card.kind === 'reverse' && active(room).length === 2)) next = player
  if (card.kind === 'skip') next = nextPlayer(room, next)
  const penalty = penalties[card.kind]
  if (penalty) {
    room.stack += penalty
    room.minimum = penalty
  }
  if (card.kind === 'roulette') {
    const victim = next
    const drawn = take(room, victim, Infinity, card => card.color === room.color)
    room.notice = victim.name + (victim.out ? ' hit the Mercy limit.' : ' drew ' + drawn + ' in roulette.')
    if (active(room).length === 1) return finish(room, active(room)[0])
    next = nextPlayer(room, victim)
  }
  beginTurn(room, next)
}

export function botMove(room, player) {
  if (player.hand.length === 1 && !player.uno) act(room, player, 'uno')
  const card = player.hand.filter(held => legal(room, held))
    .sort((a, b) => (penalties[b.kind] ?? (b.kind === 'discard' ? 3 : 0)) - (penalties[a.kind] ?? (a.kind === 'discard' ? 3 : 0)))[0]
  if (!card) return act(room, player, 'draw')
  const target = active(room).filter(other => other !== player).sort((a, b) => a.hand.length - b.hand.length)[0]
  const count = color => player.hand.filter(held => held.color === color).length
  const color = [...colors].sort((a, b) => count(b) - count(a))[0]
  act(room, player, 'play', { cardId: card.id, color, target: target.id })
}

export function view(room, you) {
  return {
    code: room.code, phase: room.phase, host: room.host, you: you.id,
    players: room.players.map(({ id, name, bot, connected, out, hand, uno }) => ({ id, name, bot, connected, out, count: hand.length, uno })),
    hand: you.hand, turn: room.turn, direction: room.direction, color: room.color,
    top: room.discard?.at(-1), deckCount: room.deck?.length, stack: room.stack, minimum: room.minimum,
    drawing: room.drawnCard != null, winner: room.winner, notice: room.notice,
    legal: room.phase === 'playing' && room.turn === you.id ? you.hand.filter(card => legal(room, card)).map(card => card.id) : []
  }
}

