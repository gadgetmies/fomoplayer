ALTER TABLE email_queue
    DROP COLUMN IF EXISTS email_queue_provider_message_id,
    DROP COLUMN IF EXISTS email_queue_skipped_reason,
    DROP COLUMN IF EXISTS email_queue_category;
