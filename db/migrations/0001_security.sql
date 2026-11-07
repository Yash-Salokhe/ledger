-- ════════════════════════════════════════════════════════════════════
-- Ledger security layer: roles, row-level security, read-only views for
-- Ledger Coach / MCP, and the daily roll-up that keeps rule checks O(1).
-- Runs as the migration owner (ledger_owner). The app never connects as owner.
-- ════════════════════════════════════════════════════════════════════

-- ── Roles ───────────────────────────────────────────────────────────
-- ledger_app        : the web app. Read/write, but RLS always applies (no BYPASSRLS).
-- ledger_coach_ro   : Ledger Coach + MCP server. SELECT on the `coach` schema only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_app') THEN CREATE ROLE ledger_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_coach_ro') THEN CREATE ROLE ledger_coach_ro NOLOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ledger_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledger_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledger_app;
--> statement-breakpoint
-- Reference data is read-only for the app; it is loaded by migrations/jobs.
REVOKE INSERT, UPDATE, DELETE ON instrument, fx_rate FROM ledger_app;
--> statement-breakpoint
-- Audit log is append-only for the app.
REVOKE UPDATE, DELETE ON audit_log FROM ledger_app;
--> statement-breakpoint

-- ── Current user helper ─────────────────────────────────────────────
-- The app runs `select set_config('app.user_id', $1, true)` at the start of
-- every transaction (see withUser() in src/lib/db/index.ts). Missing → no rows.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint

-- ── Row-level security on every user-owned table ────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profile','trading_account','account_instrument_setting','strategy','trade',
    'trade_attachment','daily_account_stat','trading_rule','rule_override',
    'rule_violation','weekly_review','trade_import','broker_connection',
    'coach_thread','coach_message','api_token'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY owner_all ON %I FOR ALL TO ledger_app, ledger_coach_ro
         USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ── Daily roll-up (rule checks + calendar read one row) ─────────────
CREATE OR REPLACE FUNCTION ledger_user_tz(p_user text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT timezone FROM profile WHERE user_id = p_user), 'UTC') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_daily_stat(p_account uuid, p_user text, p_opened timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tz  text := ledger_user_tz(p_user);
  v_day date := (p_opened AT TIME ZONE v_tz)::date;
  v_from timestamptz := (v_day::timestamp AT TIME ZONE v_tz);
  v_to   timestamptz := ((v_day + 1)::timestamp AT TIME ZONE v_tz);
BEGIN
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION trade_rollup_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM refresh_daily_stat(OLD.account_id, OLD.user_id, OLD.opened_at); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM refresh_daily_stat(NEW.account_id, NEW.user_id, NEW.opened_at); END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trade_rollup ON trade;
--> statement-breakpoint
CREATE TRIGGER trade_rollup AFTER INSERT OR UPDATE OR DELETE ON trade
  FOR EACH ROW EXECUTE FUNCTION trade_rollup_trigger();
--> statement-breakpoint

-- ── Optimistic concurrency: bump version on every trade update ──────
CREATE OR REPLACE FUNCTION bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version := OLD.version + 1; RETURN NEW; END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trade_version ON trade;
--> statement-breakpoint
CREATE TRIGGER trade_version BEFORE UPDATE ON trade FOR EACH ROW EXECUTE FUNCTION bump_version();
--> statement-breakpoint

-- ── Read-only surface for Ledger Coach and MCP ──────────────────────
-- Coach/MCP never touch base tables. They read these views, which:
--  • run as the caller (security_invoker) so RLS still limits rows to one user
--  • leave out secrets (broker tokens, API token hashes, auth tables, audit log)
-- Writes from MCP go through the app's API, so the same rules engine applies.
CREATE SCHEMA IF NOT EXISTS coach;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.trades WITH (security_invoker = true) AS
  SELECT t.id, t.user_id, t.account_id, a.name AS account_name, a.currency,
         i.exchange, i.symbol, i.asset_class, s.name AS strategy,
         t.side, t.status, t.opened_at, t.closed_at, t.quantity, t.entry_price, t.exit_price,
         t.stop_price, t.target_price, t.fees, t.pnl, t.r_multiple, t.followed_plan,
         t.grade, t.emotions, t.notes, t.checklist_met
    FROM trade t
    JOIN trading_account a ON a.id = t.account_id
    JOIN instrument i ON i.id = t.instrument_id
    LEFT JOIN strategy s ON s.id = t.strategy_id
   WHERE t.deleted_at IS NULL AND t.is_demo_data = false;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.daily_stats WITH (security_invoker = true) AS
  SELECT d.*, a.name AS account_name, a.currency FROM daily_account_stat d JOIN trading_account a ON a.id = d.account_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.strategies WITH (security_invoker = true) AS
  SELECT id, user_id, name, description, checklist FROM strategy WHERE archived_at IS NULL;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.rules WITH (security_invoker = true) AS
  SELECT r.id, r.user_id, r.account_id, r.kind, r.config, r.enforcement, r.enabled FROM trading_rule r;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.violations WITH (security_invoker = true) AS
  SELECT v.id, v.user_id, v.rule_id, r.kind, v.trade_id, v.occurred_at, v.details
    FROM rule_violation v JOIN trading_rule r ON r.id = v.rule_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW coach.weekly_reviews WITH (security_invoker = true) AS
  SELECT id, user_id, account_id, week_start, went_well, to_improve, focus_next FROM weekly_review;
--> statement-breakpoint
GRANT USAGE ON SCHEMA coach TO ledger_coach_ro;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA coach TO ledger_coach_ro;
--> statement-breakpoint
-- security_invoker views need the caller to read the underlying tables; RLS still filters rows.
GRANT SELECT ON trade, trading_account, instrument, strategy, daily_account_stat,
  trading_rule, rule_violation, weekly_review, profile TO ledger_coach_ro;
--> statement-breakpoint
ALTER ROLE ledger_coach_ro SET default_transaction_read_only = on;
--> statement-breakpoint
ALTER ROLE ledger_coach_ro SET statement_timeout = '5s';
