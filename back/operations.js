const pg = require('./db/pg.js')
const sql =require('sql-template-strings')

module.exports.createOperation = async (name, username, data, f) => {
    const [{ meta_operation_uuid: uuid }] = await pg.queryRowsAsync(sql`
INSERT INTO meta_operation (meta_operation_name, meta_account_user_id, meta_operation_data)
SELECT ${name}, meta_account_user_id, ${JSON.stringify(data)} :: JSONB
FROM meta_account WHERE meta_account_username = ${username}
RETURNING meta_operation_uuid
`)
    f().then(data => pg.queryAsync(sql`
    UPDATE meta_operation SET
        meta_operation_finished = NOW(),
        meta_operation_error = false,
        meta_operation_data = ${JSON.stringify(data)} :: JSONB
    WHERE meta_operation_uuid = ${uuid}
    `))
    .catch(data => pg.queryAsync(sql`
    UPDATE meta_operation SET
        meta_operation_finished = NOW(),
        meta_operation_error = true,
        meta_operation_data = ${JSON.stringify(data)} :: JSONB
    WHERE meta_operation_uuid = ${uuid}
    `))

    return uuid
}

module.exports.getOperation = (username, uuid) => pg.queryRowsAsync(sql`
SELECT
    meta_operation_uuid as uuid,
    meta_operation_name as name,
    meta_operation_data as data,
    meta_operation_created as created,
    meta_operation_finished as finished,
    meta_operation_error as error
FROM meta_operation NATURAL JOIN meta_account
WHERE meta_operation_uuid = ${uuid} AND meta_account_username = ${username}
`)
    .then(([data]) => data)
