import { useEffect, useRef, useState } from 'react'

const colors = ['red', 'yellow', 'green', 'blue']
const labels = { draw2: '+2', draw4: '+4', reverse4: '↻ +4', draw6: '+6', draw10: '+10', roulette: 'Roulette', skip: 'Skip', skipAll: 'Skip All', reverse: 'Reverse', discard: 'Discard All' }

function Card({ card, enabled, onClick }) {
  const label = labels[card.kind] ?? card.kind
  const inner = <><span className="corner">{label}</span><span className="card-face">{label}</span><span className="corner bottom">{label}</span></>
  const style = 'playing-card card-' + (card.color ?? 'wild')
  return onClick
    ? <button className={style} onClick={onClick} disabled={!enabled} aria-label={(card.color || 'Wild') + ' ' + label}>{inner}</button>
    : <div className={style} aria-label={(card.color || 'Wild') + ' ' + label}>{inner}</div>
}

function Seats({ room }) {
  return <div className="seats">{room.players.map(player =>
    <div className={'seat' + (room.turn === player.id && room.phase === 'playing' ? ' current' : '')} key={player.id}>
      <div className="avatar" aria-hidden="true">{player.bot ? 'AI' : player.name.slice(0, 2).toUpperCase()}</div>
      <div><strong>{player.name}{player.id === room.you ? ' (you)' : ''}</strong>
        <small>{room.phase === 'lobby' ? (player.id === room.host ? 'Host' : player.bot ? 'Bot' : player.connected ? 'Ready' : 'Offline')
          : player.out ? 'Eliminated' : player.count + (player.count === 1 ? ' card' : ' cards') + (player.uno ? ' · UNO!' : '') + (!player.bot && !player.connected ? ' · Auto-play' : '')}</small>
      </div>
    </div>
  )}</div>
}

export function Lobby({ room, send, connected }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  if (room) {
    const ready = room.players.filter(player => player.connected || player.bot).length
    return <section className="lobby panel">
      <p className="eyebrow">Private room</p>
      <h1 className="room-code">{room.code}</h1>
      <p>Share this code with the players you want at your table.</p>
      <Seats room={room} />
      {room.host === room.you ? <div className="flex flex-wrap gap-3">
        <button disabled={!connected || room.players.length >= 8} onClick={() => send('room:bot', {})}>Add bot</button>
        <button className="primary" disabled={!connected || ready < 2} onClick={() => send('room:start', {})}>Start round</button>
      </div> : <p>Waiting for the host to start.</p>}
    </section>
  }
  return <section className="landing">
    <div className="hero">
      <div className="cover-cards" aria-hidden="true">
        <Card card={{ color: 'red', kind: 'skipAll' }} /><Card card={{ color: null, kind: 'draw10' }} /><Card card={{ color: 'yellow', kind: '7' }} />
      </div>
      <h1>NO<br /><span>MERCY.</span></h1>
      <p>Play a private card table with friends or bots.</p>
    </div>
    <form className="panel entry" onSubmit={event => { event.preventDefault(); send('room:join', { name, code }) }}>
      <h2>Take a seat</h2>
      <label>Display name<input value={name} maxLength={20} placeholder="Player" onChange={event => setName(event.target.value)} /></label>
      <button className="primary" type="button" disabled={!connected} onClick={() => send('room:create', { name })}>Create private room</button>
      <hr />
      <label>Room code<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" autoComplete="off" /></label>
      <button disabled={!connected || code.length !== 6}>Join room</button>
    </form>
  </section>
}

export function Board({ room, send, connected }) {
  const [choice, setChoice] = useState(null)
  const self = room.players.find(player => player.id === room.you)
  const current = room.players.find(player => player.id === room.turn)
  const yourTurn = connected && room.phase === 'playing' && room.turn === room.you && !self.out
  const activeChoice = yourTurn && choice && room.legal.includes(choice.id) ? choice : null
  const act = (type, data = {}, success) => send('game:action', { type, ...data }, success)
  function play(card) {
    if (!card.color || card.kind === '7') setChoice(card)
    else act('play', { cardId: card.id })
  }
  return <section className="board">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div><p className="eyebrow">Room {room.code}</p>
        <h1>{room.phase === 'finished' ? 'Round complete' : room.turn === room.you ? 'Your turn' : current?.name + '’s turn'}</h1>
      </div>
      <span>{room.direction === 1 ? '↻ Clockwise' : '↺ Counterclockwise'}</span>
    </div>
    <Seats room={room} />
    <div className="felt">
      <div className="pile">
        <button className="playing-card card-back" disabled={!yourTurn || room.drawing} onClick={() => act('draw')}>{room.stack ? '+' + room.stack : 'Draw'}</button>
        <small>{room.deckCount} in draw pile</small>
      </div>
      <div className="pile"><Card card={room.top} /><small className="capitalize"><i className={'dot card-' + room.color} /> {room.color} in play</small></div>
    </div>
    <div className="turntools">
      <p role="status">{room.notice}{room.phase === 'playing' && room.stack > 0 && ' Stack +' + room.minimum + ' or higher, or draw ' + room.stack + '.'}</p>
      <div className="flex flex-wrap gap-2">
        {room.phase === 'playing' && !self.out && <button className="primary" disabled={!connected || room.hand.length !== 1 || self.uno} onClick={() => act('uno')}>{self.uno ? 'UNO called' : 'UNO!'}</button>}
        {room.phase === 'finished' && room.host === room.you && <button className="primary" disabled={!connected} onClick={() => send('room:start', {})}>Play again</button>}
        {room.phase === 'finished' && room.host === room.you && <button disabled={!connected || room.players.length >= 8} onClick={() => send('room:bot', {})}>Add bot</button>}
      </div>
    </div>
    <div className="hand" aria-label="Your hand">{room.hand.map(card => <Card key={card.id} card={card} onClick={() => play(card)} enabled={yourTurn && room.legal.includes(card.id) && (room.hand.length > 1 || self.uno)} />)}</div>
    {activeChoice && <Dialog title={activeChoice.kind === '7' ? 'Swap hands with' : 'Choose a color'} close={() => setChoice(null)}>
      <div className="settings">
        {activeChoice.kind === '7'
          ? room.players.filter(player => !player.out && player.id !== room.you).map(player => <button key={player.id} onClick={() => act('play', { cardId: activeChoice.id, target: player.id }, () => setChoice(null))}>{player.name} · {player.count} cards</button>)
          : colors.map(color => <button key={color} className="capitalize" onClick={() => act('play', { cardId: activeChoice.id, color }, () => setChoice(null))}><i className={'dot card-' + color} /> {color}</button>)}
      </div>
    </Dialog>}
  </section>
}

export function Dialog({ title, close, children }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={dialog} aria-label={title} onCancel={event => { event.preventDefault(); close() }}>
    <div className="flex items-center justify-between gap-4 mb-4"><h2>{title}</h2><button onClick={close}>Close</button></div>
    {children}
  </dialog>
}

export function Rules() {
  return <ul className="rules">
    <li>Start with seven cards. Match the active color or the top card’s number or action. Wild cards can choose any color. If you draw, keep drawing until you find a playable card, then play that card.</li>
    <li>Click <strong>UNO!</strong> at one card before playing your last card. Empty your hand or be the last player standing to win. Swaps, passes, and Discard All can also leave a player with an empty hand.</li>
    <li>Hit 25 cards and you’re out immediately.</li>
    <li>Stack a draw card equal to or higher than the last draw card. Only draw cards can stack. If you take the total, you lose your turn.</li>
    <li>A 7 swaps hands with a player you choose. A 0 passes all hands one seat in the current direction.</li>
    <li>Discard All clears your cards of the same color. Skip Everyone gives you another turn. Wild Reverse +4 reverses direction before passing the draw penalty.</li>
    <li>On Color Roulette, choose a color. The next player draws until they hit that color, hit 25 cards, or run out of cards. Wilds are kept and do not match the chosen color. The victim loses their turn.</li>
  </ul>
}

