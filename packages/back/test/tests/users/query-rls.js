'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createApiKey } = require('../../../db/api-key')
const { resolveTestUserId } = require('../../lib/test-user')
const account = require('../../../db/account')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { randomUUID } = require('crypto')

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const userAId = await resolveTestUserId()
    const userB = await account.findOrCreateByIdentifier('test.rls', `rls-user-b-${randomUUID()}`)
    const userBId = userB.id
    const keyA = `fp_${randomUUID()}`
    const keyB = `fp_${randomUUID()}`
    await createApiKey(userAId, keyA, 'rls-a')
    await createApiKey(userBId, keyB, 'rls-b')
    const [{ cart_id: cartId }] = await pg.queryRowsAsync(
      sql`INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('rls-test-cart', ${userAId}) RETURNING cart_id`,
    )
    const [{ user_search_notification_id: notifId }] = await pg.queryRowsAsync(
      sql`INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string) VALUES (${userAId}, 'rls-test-notif') RETURNING user_search_notification_id`,
    )
    const [{ store_id: storeId }] = await pg.queryRowsAsync(sql`SELECT store_id FROM store LIMIT 1`)
    await pg.queryAsync(
      sql`INSERT INTO user_search_notification__store (user_search_notification_id, store_id) VALUES (${notifId}, ${storeId}) ON CONFLICT DO NOTHING`,
    )
    const query = (rawKey, userSql) => fetch(`${baseUrl}/api/me/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ sql: userSql }),
    }).then((r) => r.json())
    return { server, baseUrl, userAId, userBId, keyA, keyB, query, cartId, notifId, storeId }
  },
  teardown: async ({ server, userAId, userBId, notifId }) => {
    server.kill()
    await pg.queryAsync(sql`DELETE FROM user_search_notification__store WHERE user_search_notification_id = ${notifId}`)
    await pg.queryAsync(sql`DELETE FROM user_search_notification WHERE meta_account_user_id = ${userAId} AND user_search_notification_string = 'rls-test-notif'`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE meta_account_user_id = ${userAId} AND cart_name = 'rls-test-cart'`)
    await pg.queryAsync(sql`DELETE FROM api_key WHERE meta_account_user_id = ${userAId} AND api_key_name = 'rls-a'`)
    await pg.queryAsync(sql`DELETE FROM api_key WHERE meta_account_user_id = ${userBId}`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE meta_account_user_id = ${userBId}`)
    await pg.queryAsync(sql`DELETE FROM user_track_score_weight WHERE meta_account_user_id = ${userBId}`)
    await pg.queryAsync(sql`DELETE FROM meta_account__authentication_method_details WHERE meta_account_user_id = ${userBId}`)
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userBId}`)
  },
  'user sees own cart': async ({ query, keyA }) => {
    const body = await query(keyA, "SELECT cart_id FROM cart WHERE cart_name='rls-test-cart'")
    expect(body.rows).to.have.length.above(0)
  },
  'user does not see another user cart': async ({ query, keyB }) => {
    const body = await query(keyB, "SELECT cart_id FROM cart WHERE cart_name='rls-test-cart'")
    expect(body.rows).to.have.length(0)
  },
  'user cannot read track__cart for another user cart': async ({ query, keyB, userAId }) => {
    const [{ cart_id }] = await pg.queryRowsAsync(sql`
      SELECT cart_id FROM cart WHERE cart_name='rls-test-cart' AND meta_account_user_id=${userAId}
    `)
    const body = await query(keyB, `SELECT * FROM track__cart WHERE cart_id=${cart_id}`)
    expect(body.rows).to.have.length(0)
  },
  'user does not see another user search_notification__store': async ({ query, keyB, notifId }) => {
    const body = await query(keyB, `SELECT * FROM user_search_notification__store WHERE user_search_notification_id=${notifId}`)
    expect(body.rows).to.have.length(0)
  },
  'user does not see another user cart__store': async ({ query, keyB, cartId }) => {
    const body = await query(keyB, `SELECT * FROM cart__store WHERE cart_id=${cartId}`)
    expect(body.rows).to.have.length(0)
  },
  'cannot access meta_account': async ({ baseUrl, keyA }) => {
    const r = await fetch(`${baseUrl}/api/me/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ sql: 'SELECT * FROM meta_account LIMIT 1' }),
    })
    expect(r.status).to.equal(400)
  },
})
