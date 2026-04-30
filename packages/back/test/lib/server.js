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

module.exports.startServer = async () => {
  const port = await reserveRandomPort()
  const baseUrl = `http://localhost:${port}`

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
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      server.kill()
      reject(new Error('Server startup timed out after 30s'))
    }, 30000)

    server.stdout.on('data', (data) => {
      if (data.toString().includes('Listening')) {
        clearTimeout(timeout)
        server.stdout.unref()
        server.stderr.unref()
        server.unref()
        resolve({ server, port })
      }
    })

    server.stderr.on('data', (data) => {
      process.stderr.write(data)
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}
