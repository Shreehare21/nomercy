import { useCallback, useEffect, useRef, useState } from 'react'

function iceServers() {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]')
  } catch {
    return []
  }
}

export function useVoice(socket, self, connected, report) {
  const [mode, setMode] = useState('off')
  const stream = useRef(null)
  const generation = useRef(0)
  const peers = useRef(new Map())

  const stop = useCallback(() => {
    generation.current++
    if (socket.connected) socket.emit('voice:ready', { enabled: false })
    for (const track of stream.current?.getTracks() ?? []) track.stop()
    stream.current = null
    for (const peer of peers.current.values()) {
      peer.connection.close()
      peer.audio.srcObject = null
    }
    peers.current.clear()
    setMode('off')
  }, [socket])

  useEffect(() => {
    if (!self || !connected) return
    const send = (to, signal) => socket.emit('voice:signal', { to, signal })
    function getPeer(id) {
      if (peers.current.has(id)) return peers.current.get(id)
      const connection = new RTCPeerConnection({ iceServers: iceServers() })
      const audio = new Audio()
      audio.autoplay = true
      const peer = { connection, audio, candidates: [], queue: Promise.resolve() }
      peers.current.set(id, peer)
      for (const track of stream.current.getTracks()) connection.addTrack(track, stream.current)
      connection.onicecandidate = event => { if (event.candidate) send(id, { candidate: event.candidate.toJSON() }) }
      connection.ontrack = event => {
        audio.srcObject = event.streams[0]
        audio.play().catch(() => report('Voice playback needs a browser interaction.'))
      }
      return peer
    }

    async function roster(ids) {
      if (!stream.current || !ids.includes(self)) return
      for (const [id, peer] of peers.current) {
        if (ids.includes(id)) continue
        peer.connection.close()
        peer.audio.srcObject = null
        peers.current.delete(id)
      }
      for (const id of ids) {
        if (self >= id || peers.current.has(id)) continue
        try {
          const { connection } = getPeer(id)
          await connection.setLocalDescription(await connection.createOffer())
          if (stream.current) send(id, { description: connection.localDescription })
        } catch {
          if (stream.current) report('Could not connect voice to a player.')
        }
      }
    }

    function receive({ from, signal }) {
      if (!stream.current) return
      const peer = getPeer(from)
      const { connection, candidates } = peer
      peer.queue = peer.queue.then(async () => {
        if (connection.signalingState === 'closed') return
        if (signal.description) {
          await connection.setRemoteDescription(signal.description)
          for (const candidate of candidates.splice(0)) await connection.addIceCandidate(candidate)
          if (signal.description.type === 'offer') {
            await connection.setLocalDescription(await connection.createAnswer())
            send(from, { description: connection.localDescription })
          }
        } else if (signal.candidate) {
          if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate)
          else candidates.push(signal.candidate)
        }
      }).catch(() => {
        if (connection.signalingState !== 'closed') report('Could not connect voice to a player.')
      })
    }
    socket.on('voice:roster', roster).on('voice:signal', receive)
    return () => {
      socket.off('voice:roster', roster).off('voice:signal', receive)
      stop()
    }
  }, [socket, self, connected, report, stop])

  async function toggle() {
    if (mode === 'starting' || !connected || !self) return
    if (stream.current) {
      const enabled = mode === 'muted'
      for (const track of stream.current.getAudioTracks()) track.enabled = enabled
      setMode(enabled ? 'live' : 'muted')
      for (const peer of peers.current.values()) peer.audio.play().catch(() => {})
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      report('Voice needs a supported browser on localhost or HTTPS.')
      return
    }
    const attempt = ++generation.current
    setMode('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (attempt !== generation.current) {
        for (const track of media.getTracks()) track.stop()
        return
      }
      stream.current = media
      setMode('live')
      socket.emit('voice:ready', { enabled: true })
    } catch {
      if (attempt !== generation.current) return
      setMode('off')
      report('Microphone access was unavailable.')
    }
  }

  return { mode, toggle, stop }
}

