import { randomBytes, randomUUID } from 'node:crypto'
import { act, botMove, start, view } from './game.js'

const MAX_PLAYERS = 8
const ROOM_IDLE_MS = 30 * 60_000
const nameOf = value => typeof value === 'string' ? value.trim().slice(0, 20) || 'Player' : 'Player'

export function attachRooms(io) {
  const rooms = new Map()

  function publish(room) {
    for (const player of room.players) {
      if (player.connected) io.to(player.socket).emit('room:state', view(room, player))
    }
    if (room.timer) return
    const current = room.players.find(player => player.id === room.turn)
    if (room.phase !== 'playing' || !current || (!current.bot && current.connected)) return
    room.timer = setTimeout(() => {
      room.timer = null
      if (rooms.get(room.code) !== room) return
      if (room.phase === 'playing' && room.turn === current.id && (current.bot || !current.connected)) botMove(room, current)
      publish(room)
    }, 1000)
    room.timer.unref()
  }

  function voiceRoster(room) {
    const list = room.players.filter(player => player.connected && player.voice).map(player => player.id)
    for (const player of room.players) {
      if (player.connected) io.to(player.socket).emit('voice:roster', list)
    }
  }

  function bind(socket, room, player) {
    clearTimeout(room.cleanup)
    player.connected = true
    player.voice = false
    player.socket = socket.id
    socket.data.room = room.code
    socket.data.player = player.id
    if (!room.players.some(member => member.id === room.host && member.connected)) room.host = player.id
    socket.emit('room:session', { code: room.code, token: player.token })
    publish(room)
    voiceRoster(room)
  }

  function detach(socket, leave = false) {
    const room = rooms.get(socket.data.room)
    const player = room?.players.find(member => member.socket === socket.id)
    socket.data.room = null
    if (!player) return
    player.connected = player.voice = false
    player.socket = null
    if (leave) player.token = null
    if (leave && room.phase !== 'playing') room.players = room.players.filter(member => member !== player)
    if (player.id === room.host) room.host = room.players.find(member => member.connected)?.id ?? null
    if (!room.players.some(member => member.connected)) {
      room.cleanup = setTimeout(() => rooms.delete(room.code), ROOM_IDLE_MS)
      room.cleanup.unref()
    }
    publish(room)
    voiceRoster(room)
  }

  function member(name, bot = false) {
    return { id: randomUUID(), token: bot ? null : randomUUID(), name, bot, connected: false, hand: [] }
  }

  io.on('connection', socket => {
    function on(event, handler) {
      socket.on(event, (payload, reply) => {
        const ack = typeof reply === 'function' ? reply : () => {}
        try {
          handler(payload && typeof payload === 'object' ? payload : {})
          ack({ ok: true })
        } catch (error) {
          ack({ error: error.message })
        }
      })
    }

    function current() {
      const room = rooms.get(socket.data.room)
      const player = room?.players.find(member => member.socket === socket.id)
      if (!player) throw new Error('Join a room first.')
      return [room, player]
    }

    on('room:create', ({ name }) => {
      if (socket.data.room) throw new Error('Leave your current room first.')
      let code
      do { code = randomBytes(3).toString('hex').toUpperCase() } while (rooms.has(code))
      const player = member(nameOf(name))
      const room = { code, phase: 'lobby', host: player.id, players: [player] }
      rooms.set(code, room)
      bind(socket, room, player)
    })
    on('room:join', ({ code, name, token }) => {
      if (socket.data.room) throw new Error('Leave your current room first.')
      const room = rooms.get(typeof code === 'string' ? code.trim().toUpperCase() : '')
      if (!room) throw new Error('Room code not found.')
      const returning = typeof token === 'string' && room.players.find(player => player.token === token)
      if (returning) {
        if (returning.connected) throw new Error('This seat is already connected.')
        return bind(socket, room, returning)
      }
      if (token) throw new Error('Your room session expired.')
      if (room.phase !== 'lobby') throw new Error('This round has already started.')
      if (room.players.length >= MAX_PLAYERS) throw new Error('The room is full.')
      const player = member(nameOf(name))
      room.players.push(player)
      bind(socket, room, player)
    })
    on('room:leave', () => detach(socket, true))
    on('room:bot', () => {
      const [room, player] = current()
      if (room.host !== player.id || room.phase === 'playing') throw new Error('Only the host can add a bot between rounds.')
      if (room.players.length >= MAX_PLAYERS) throw new Error('The room is full.')
      const bot = member('Bot ' + (room.players.filter(other => other.bot).length + 1), true)
      room.players.push(bot)
      publish(room)
    })
    on('room:start', () => {
      const [room, player] = current()
      if (room.host !== player.id || room.phase === 'playing') throw new Error('Only the host can start a round.')
      const ready = room.players.filter(other => other.bot || other.connected)
      if (ready.length < 2) throw new Error('Add a player or a bot to start.')
      room.players = ready
      start(room)
      publish(room)
    })
    on('game:action', ({ type, ...data }) => {
      const [room, player] = current()
      act(room, player, type, data)
      publish(room)
    })
    on('voice:ready', ({ enabled }) => {
      const [room, player] = current()
      player.voice = enabled === true
      voiceRoster(room)
    })
    on('voice:signal', ({ to, signal }) => {
      const [room, player] = current()
      if (!player.voice) return
      const peer = room.players.find(other => other.id === to && other.connected && other.voice)
      if (peer && signal && typeof signal === 'object') io.to(peer.socket).emit('voice:signal', { from: player.id, signal })
    })
    socket.on('disconnect', () => detach(socket))
  })

  return rooms
}

