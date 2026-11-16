'use client'

import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { Lobby, Board, Dialog, Rules } from './table'
import { useVoice } from './voice'
import { useAudio } from './audio'

const sessionKey = 'no-mercy-seat'

export default function Page() {
  const [socket] = useState(() => io({ autoConnect: false }))
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [music, setMusic] = useState(false)
  const [effects, setEffects] = useState(false)
  const voice = useVoice(socket, room?.you, connected, setError)
  const unlockAudio = useAudio(music, effects, room?.notice)

  useEffect(() => {
    function connect() {
      setConnected(true)
      setError('')
      try {
        const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
        if (saved) socket.timeout(5000).emit('room:join', saved, (timeout, result) => {
          if (timeout || result?.error) {
            if (!timeout) sessionStorage.removeItem(sessionKey)
            setRoom(null)
            setError(result?.error ?? 'Reconnection timed out.')
          }
        })
      } catch { sessionStorage.removeItem(sessionKey) }
    }
    function disconnect() { setConnected(false) }
    function save(session) { sessionStorage.setItem(sessionKey, JSON.stringify(session)) }
    socket.on('connect', connect).on('disconnect', disconnect).on('room:session', save).on('room:state', setRoom)
    socket.connect()
    return () => {
      socket.off('connect', connect).off('disconnect', disconnect).off('room:session', save).off('room:state', setRoom)
      socket.disconnect()
    }
  }, [socket])

  function send(event, payload, success) {
    if (!socket.connected) return setError('Waiting for the server connection.')
    setError('')
    socket.timeout(5000).emit(event, payload, (timeout, result) => {
      if (timeout || result?.error) setError(result?.error ?? 'The server did not respond.')
      else success?.()
    })
  }

  function leave() {
    send('room:leave', {}, () => {
      sessionStorage.removeItem(sessionKey)
      voice.stop()
      setRoom(null)
    })
  }

  return (
    <main onPointerDown={unlockAudio} onKeyDown={unlockAudio}>
      <header className="bar">
        <strong className="wordmark">NO<span> MERCY</span></strong>
        <nav className="flex flex-wrap gap-2">
          <button onClick={() => setDialog('rules')}>Rules</button>
          <button onClick={() => setDialog('settings')}>Settings</button>
          {room && <button onClick={leave} disabled={!connected}>Leave room</button>}
        </nav>
      </header>
      {!connected && <p className="status" role="status">Connecting to the table…</p>}
      {error && <div className="status error flex justify-between items-center gap-3" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      <div className="shell">
        {room?.phase === 'playing' || room?.phase === 'finished'
          ? <Board key={room.code} room={room} send={send} connected={connected} />
          : <Lobby room={room} send={send} connected={connected} />}
      </div>
      {dialog && <Dialog title={dialog === 'rules' ? 'Table rules' : 'Settings'} close={() => setDialog(null)}>
        {dialog === 'rules' ? <Rules /> : <div className="settings">
          {error && <p role="alert">{error}</p>}
          <button disabled={!room || !connected || voice.mode === 'starting'} onClick={voice.toggle}>
            {({ off: 'Enable voice', starting: 'Opening microphone…', live: 'Mute microphone', muted: 'Unmute microphone' })[voice.mode]}
          </button>
          {voice.mode === 'live' || voice.mode === 'muted' ? <button onClick={voice.stop}>Leave voice</button> : null}
          {!room && <small>Join a room to use voice chat.</small>}
          <button aria-pressed={music} onClick={() => setMusic(!music)}>Background music · {music ? 'On' : 'Off'}</button>
          <button aria-pressed={effects} onClick={() => setEffects(!effects)}>Sound effects · {effects ? 'On' : 'Off'}</button>
        </div>}
      </Dialog>}
    </main>
  )
}

