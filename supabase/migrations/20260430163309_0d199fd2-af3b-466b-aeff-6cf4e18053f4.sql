
ALTER TABLE public.reservation_installment_history
  DROP CONSTRAINT reservation_installment_history_action_check;

ALTER TABLE public.reservation_installment_history
  ADD CONSTRAINT reservation_installment_history_action_check
  CHECK (action = ANY (ARRAY['created','updated','condoned','rescheduled','reactivated','payment_applied','payment_removed','reassigned','deactivated','payment_reassigned']));
