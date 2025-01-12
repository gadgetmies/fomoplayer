UPDATE track_details
SET track_details         = (SELECT ROW_TO_JSON(track_details(ARRAY_AGG($TRACK_ID))))
  , track_details_updated = NOW()
WHERE track_id = $TRACK_ID
;