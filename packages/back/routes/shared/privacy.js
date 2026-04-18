const net = require('net')
const { createHash } = require('crypto')

const expandIPv6 = (ip) => {
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  const middle = Array(missing).fill('0000')
  return [...left, ...middle, ...right].map((g) => g.padStart(4, '0')).join(':')
}

const maskIp = (ip) => {
  if (!ip || typeof ip !== 'string') return 'unknown'
  // IPv4-mapped IPv6
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+)\.\d+$/i)
  if (mapped) return `::ffff:${mapped[1]}.0`
  if (net.isIPv4(ip)) {
    return ip.replace(/\.\d+$/, '.0')
  }
  if (net.isIPv6(ip)) {
    const expanded = expandIPv6(ip)
    if (!expanded) return 'unknown'
    const groups = expanded.split(':')
    return groups.slice(0, 3).join(':') + '::'
  }
  return 'unknown'
}

const hashSub = (sub) => {
  if (!sub || typeof sub !== 'string') return 'unknown'
  return createHash('sha256').update(sub).digest('hex').slice(0, 16)
}

module.exports = { maskIp, hashSub }
