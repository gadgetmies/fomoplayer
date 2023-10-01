CREATE TABLE IF NOT EXISTS track_details
(
    track_id              INT REFERENCES track (track_id) ON DELETE CASCADE UNIQUE NOT NULL ,
    track_details         JSON                            NOT NULL,
    track_details_updated TIMESTAMPTZ                     NOT NULL DEFAULT NOW()
);