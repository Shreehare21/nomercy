# No Mercy

A private real-time card game inspired by UNO Show 'em No Mercy. Built with Next.js, React, Tailwind CSS, Socket.IO and WebRTC.

## Run locally

With Node.js 20.9 or newer, open a terminal in this folder and run:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Create a room and share the six-character code with anyone using the same server. For a solo round, add a bot and start. Use a separate browser profile or window to test another seat.

The server prints its LAN addresses on startup. Players on your local network can open one of those addresses if your firewall permits access. For internet play, deploy the project to a long-running Node.js host, run `npm run build` followed by `npm start`, and put it behind an HTTPS proxy that supports WebSocket upgrades. The server uses port 3000 by default and accepts the `PORT` and `HOST` environment variables. Keep all players on the same running instance. Room state lives in memory and resets on restart. A disconnected seat can resume within the same tab and auto-plays while away.

## Voice

Join a room, open Settings, and select Enable voice in every participating browser. Voice requires HTTPS or localhost and microphone permission. Mute stops sending audio while keeping incoming voice connected. Leave voice releases the microphone. The default STUN server helps peers connect directly. For restrictive networks, configure a TURN service through `NEXT_PUBLIC_ICE_SERVERS` before building, using a JSON array of WebRTC ICE server entries with browser-safe credentials. Socket.IO relays the room's signaling. Media travels over WebRTC.

## Game behavior

The deck uses the supplied 168-card distribution. The host can add bots to a room of up to eight seats. Everyone starts with seven cards and the initial discard is a number. An ordinary draw continues until the player finds a playable card, reaches the Mercy limit, or exhausts the available cards. A player must call UNO before playing their last card. Mandatory swaps, rotations and Discard All resolve before checking for empty hands. With two players, a regular Reverse returns the turn to its player, while Wild Reverse Draw 4 sends the penalty to the other player. Roulette uses the attacker's chosen color and skips the victim. Discarded cards recycle beneath the current top card, and eliminated hands return to the draw pile.

## Source layout

- `app/page.jsx` wires the browser to the room server and hosts sound, voice, and settings.
- `app/table.jsx` contains the lobby, game board, and rules.
- `app/voice.js` manages microphone access, audio peers, and ICE negotiation.
- `server/index.js` runs Next.js and Socket.IO on a shared HTTP server.
- `server/rooms.js` manages rooms, hosts, reconnects, bots, and voice signaling.
- `server/game.js` owns the deck, rules, bot strategy, and per-player state views.
- `test/` exercises game rules and real Socket.IO connections. Run `npm test`.

