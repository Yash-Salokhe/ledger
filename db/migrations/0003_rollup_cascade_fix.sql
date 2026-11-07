-- Fix: deleting an account cascades to its trades; their AFTER DELETE trigger must not
-- re-insert a roll-up row for the account being removed. Empty days are deleted, not zeroed.
CREATE OR REPLACE FUNCTION refresh_daily_stat(p_account uuid, p_user text, p_opened timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tz   text;
  v_day  date;
  v_from timestamptz;
  v_to   timestamptz;
  v_n    int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trading_account WHERE id = p_account) THEN
    RETURN; -- account is being deleted; its roll-up rows go with it (ON DELETE CASCADE)
  END IF;
  v_tz   := ledger_user_tz(p_user);
  v_day  := (p_opened AT TIME ZONE v_tz)::date;
  v_from := (v_day::timestamp AT TIME ZONE v_tz);
  v_to   := ((v_day + 1)::timestamp AT TIME ZONE v_tz);

  SELECT count(*) INTO v_n FROM trade
   WHERE account_id = p_account AND user_id = p_user AND deleted_at IS NULL
     AND opened_at >= v_from AND opened_at < v_to;

  IF v_n = 0 THEN
    DELETE FROM daily_account_stat WHERE account_id = p_account AND day = v_day;
    RETURN;
  END IF;

  INSERT INTO daily_account_stat AS d (account_id, user_id, day, trades_count, wins, losses, pnl, r_sum, on_plan_count)
  SELECT p_account, p_user, v_day,
         count(*),
         count(*) FILTER (WHERE pnl > 0),
         count(*) FILTER (WHERE pnl < 0),
         coalesce(sum(pnl), 0),
         coalesce(sum(r_multiple), 0),
         count(*) FILTER (WHERE followed_plan)
    FROM trade
   WHERE account_id = p_account AND user_id = p_user AND deleted_at IS NULL
     AND opened_at >= v_from AND opened_at < v_to
  ON CONFLICT (account_id, day) DO UPDATE SET
     trades_count = excluded.trades_count, wins = excluded.wins, losses = excluded.losses,
     pnl = excluded.pnl, r_sum = excluded.r_sum, on_plan_count = excluded.on_plan_count;
END $$;
