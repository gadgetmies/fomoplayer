const { spawn } = require('child_process')
const net = require('net')
const path = require('path')

const BACKEND_ROOT = path.resolve(__dirname, '../..')

const reserveRandomPort = async () =>
  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not reserve random test port')))
        return
      }
      const { port } = address
      server.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(port)
      })
    })
    server.on('error', reject)
  })

// Resolves once something accepts connections on 127.0.0.1:port.
const waitForPort = (port, deadline) =>
  new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) reject(new Error(`Nothing listening on port ${port}`))
        else setTimeout(attempt, 50)
      })
    }
    attempt()
  })

// Starts the backend on a free port. Resolves only when the port accepts
// connections: the backend logs "Listening" right after calling listen(), and
// a server that dies after that line (for example EADDRINUSE because another
// process took the reserved port) would otherwise surface as ECONNREFUSED in
// the first request. If the server exits before the test kills it, its exit
// code and last output are written to stderr so that failure names its cause.
module.exports.startServer = async ({ env: envOverrides = {} } = {}) => {
  const port = await reserveRandomPort()
  const baseUrl = `http://localhost:${port}`
  const deadline = Date.now() + 30000

  return new Promise((resolve, reject) => {
    const server = spawn('node', ['index.js'], {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: String(port),
        // The backend serves the built SPA from the same origin in tests, so
        // browser requests carry Origin=<this port>. Pin FRONTEND_URL so the
        // CORS allowlist accepts it instead of denying with the default 4004.
        FRONTEND_URL: baseUrl,
        API_URL: baseUrl,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let settled = false
    const remember = (data) => {
      output = (output + data.toString()).slice(-4000)
    }
    const fail = (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      server.kill()
      reject(err)
    }

    const timeout = setTimeout(() => fail(new Error('Server startup timed out after 30s')), 30000)

    server.stdout.on('data', (data) => {
      remember(data)
      if (!settled && data.toString().includes('Listening')) {
        waitForPort(port, deadline).then(() => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          server.stdout.unref()
          server.stderr.unref()
          server.unref()
          resolve({ server, port })
        }, fail)
      }
    })

    server.stderr.on('data', (data) => {
      remember(data)
      process.stderr.write(data)
    })

    server.on('error', fail)

    server.on('exit', (code, signal) => {
      // A kill by the test (SIGTERM) is the normal end.
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return
      const message = `Test server on port ${port} exited (code ${code}, signal ${signal}). Last output:\n${output}`
      if (!settled) fail(new Error(message))
      else process.stderr.write(`${message}\n`)
    })
  })
}
