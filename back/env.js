const envs = {
  dev: {
    dbUrl: 'postgres://localhost/multi-store-player',
    statementTimeout: '60s',
    sessionKey: 'multi player secret',
    port: 4000
  },
  test: {
    dbUrl: 'postgres://localhost/multi-store-player-test',
    statementTimeout: '60s',
    sessionKey: 'multi player secret',
    port: 4000
  }
}
module.exports = envs[process.env.NODE_ENV || 'dev']
