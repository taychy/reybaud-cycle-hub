UPDATE public.event_participants
SET time_value = NULL,
    time_result = NULL,
    status = 'registered',
    checked_in_at = NULL,
    results_updated_at = NULL,
    "position" = NULL,
    approved_at = NULL,
    approved_by = NULL
WHERE id = '2b3e0dc1-a5b7-4230-8c59-e90d912c7bd0'
  AND event_id = '62a29493-7c8a-474a-a509-7224a8fb0cd7';