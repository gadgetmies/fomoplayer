-- Category drives branding, List-Unsubscribe headers, and suppression
-- behaviour ('verification' | 'invite' | 'notification' | 'admin'). Legacy
-- rows keep a NULL category and are sent unbranded / non-suppressed.
-- skipped_reason records why a queued row was not delivered (e.g. 'suppressed')
-- so it is not retried. provider_message_id stores the Resend message id.
ALTER TABLE email_queue
    ADD COLUMN email_queue_category            text,
    ADD COLUMN email_queue_skipped_reason      text,
    ADD COLUMN email_queue_provider_message_id text;
