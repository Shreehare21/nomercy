import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import next from 'next'
import { Server } from 'socket.io'
import { attachRooms } from './rooms.js'

const dev = !process.argv.includes('--production')
if (!dev) process.env.NODE_ENV = 'production'
const port = Number(process.env.PORT || 3000)
const app = next({ dev, hostname: 'localhost', port })
await app.prepare()
const http = createServer(app.getRequestHandler())
attachRooms(new Server(http))
http.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log('No Mercy is running at http://localhost:' + port)
  if (!process.env.HOST) {
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) console.log('LAN: http://' + address.address + ':' + port)
      }
    }
  }
})

