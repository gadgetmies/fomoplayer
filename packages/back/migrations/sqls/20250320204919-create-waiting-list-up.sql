CREATE TABLE waiting_list
(
  waiting_list_id SERIAL PRIMARY KEY,
  waiting_list_email           TEXT UNIQUE,
  waiting_list_invite_code     TEXT DEFAULT UUID_GENERATE_V4(),
  waiting_list_created_at      TIMESTAMP DEFAULT NOW()
)
;