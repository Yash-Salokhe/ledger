/**
 * Ledger database schema (PostgreSQL 16+).
 *
 * Conventions
 * - Every user-owned table carries `user_id` and is protected by row-level
 *   security (see db/sql/0001_rls.sql). The app sets `app.user_id` per transaction.
 * - Money is `numeric`, never float. Prices use numeric(28,10) so crypto,
 *   FX pips and index points all fit.
 * - Times are `timestamptz` (UTC); the user's timezone lives on the profile.
 * - Rows are soft-deleted (`deleted_at`) so "Undo" works and imports are auditable.
 */
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, text, uuid, timestamp, boolean, numeric, integer, jsonb,
  date, char, index, uniqueIndex, bigserial, smallint, primaryKey,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = ts("created_at").notNull().defaultNow();
const updatedAt = ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());
const userId = () => text("user_id").notNull().references(() => user.id, { onDelete: "cascade" });
const money = (name: string) => numeric(name, { precision: 20, scale: 4 });
const price = (name: string) => numeric(name, { precision: 28, scale: 10 });

/* ───────────────────────── Enums ───────────────────────── */

export const accountKind = pgEnum("account_kind", ["live", "demo", "prop_evaluation", "paper"]);
export const assetClass = pgEnum("asset_class", ["equity", "index", "future", "option", "forex", "crypto", "commodity", "cfd", "bond"]);
export const tradeSide = pgEnum("trade_side", ["long", "short"]);
export const tradeStatus = pgEnum("trade_status", ["open", "closed"]);
export const tradeSource = pgEnum("trade_source", ["manual", "import", "broker"]);
/** Process grade: did the outcome come from following the plan? */
export const processGrade = pgEnum("process_grade", ["earned", "good_loss", "lucky", "deserved"]);
export const ruleKind = pgEnum("rule_kind", ["max_trades_per_day", "max_daily_loss", "trading_window", "max_risk_per_trade"]);
export const ruleEnforcement = pgEnum("rule_enforcement", ["block", "warn"]);
export const attachmentKind = pgEnum("attachment_kind", ["screenshot", "tradingview_link"]);
export const importStatus = pgEnum("import_status", ["pending", "processing", "completed", "failed"]);
export const brokerStatus = pgEnum("broker_status", ["connected", "expired", "revoked", "error"]);
export const auditActor = pgEnum("audit_actor", ["user", "mcp", "coach", "system"]);
export const coachRole = pgEnum("coach_role", ["user", "assistant", "tool"]);

/* ───────────────────────── Profile ───────────────────────── */

export const profile = pgTable("profile", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("USD"),
  timezone: text("timezone").notNull().default("UTC"),
  locale: text("locale").notNull().default("en"),
  defaultRiskPct: numeric("default_risk_pct", { precision: 6, scale: 3 }).notNull().default("1"),
  /** Demo data shows until the user creates a real account or logs a real trade. */
  demoMode: boolean("demo_mode").notNull().default(true),
  tourCompletedAt: ts("tour_completed_at"),
  createdAt,
  updatedAt,
});

/* ───────────────────────── Reference: instruments (global, not user-owned) ───────────────────────── */

export const instrument = pgTable("instrument", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** ISO 10383 market identifier: XNSE (NSE India), XNAS, XNYS, XLON… "FX" for spot forex, "CRYPTO" for crypto. */
  exchange: text("exchange").notNull(),
  symbol: text("symbol").notNull(),
  displayName: text("display_name").notNull(),
  assetClass: assetClass("asset_class").notNull(),
  quoteCurrency: char("quote_currency", { length: 3 }).notNull(),
  /** Units per lot/contract: 100,000 for FX standard lot, 75 for a NIFTY lot, 1 for a share. */
  contractSize: numeric("contract_size", { precision: 20, scale: 6 }).notNull().default("1"),
  tickSize: price("tick_size"),
  /** Exchange session in its own timezone, for the Market hours widget. */
  sessionTz: text("session_tz"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt,
}, (t) => [
  uniqueIndex("instrument_exchange_symbol_uq").on(t.exchange, t.symbol),
  index("instrument_symbol_search_idx").using("gin", sql`${t.symbol} gin_trgm_ops`),
]);

/* ───────────────────────── Trading accounts ───────────────────────── */

export const tradingAccount = pgTable("trading_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  name: text("name").notNull(),
  broker: text("broker"),
  kind: accountKind("kind").notNull().default("live"),
  currency: char("currency", { length: 3 }).notNull(),
  openingBalance: money("opening_balance").notNull().default("0"),
  openedOn: date("opened_on"),
  isDemoData: boolean("is_demo_data").notNull().default(false),
  archivedAt: ts("archived_at"),
  createdAt,
  updatedAt,
}, (t) => [index("trading_account_user_idx").on(t.userId)]);

/** Per-account contract size overrides (Settings → Trading defaults). */
export const accountInstrumentSetting = pgTable("account_instrument_setting", {
  accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
  instrumentId: uuid("instrument_id").notNull().references(() => instrument.id),
  userId: userId(),
  contractSize: numeric("contract_size", { precision: 20, scale: 6 }).notNull(),
}, (t) => [primaryKey({ columns: [t.accountId, t.instrumentId] })]);

/* ───────────────────────── Playbook ───────────────────────── */

export const strategy = pgTable("strategy", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  name: text("name").notNull(),
  description: text("description"),
  /** Ordered checklist: [{ id, label }]. Each trade stores which items were met. */
  checklist: jsonb("checklist").$type<{ id: string; label: string }[]>().notNull().default([]),
  isDemoData: boolean("is_demo_data").notNull().default(false),
  archivedAt: ts("archived_at"),
  createdAt,
  updatedAt,
}, (t) => [index("strategy_user_idx").on(t.userId)]);

/* ───────────────────────── Trades (the hot table) ───────────────────────── */

export const trade = pgTable("trade", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
  instrumentId: uuid("instrument_id").notNull().references(() => instrument.id),
  strategyId: uuid("strategy_id").references(() => strategy.id, { onDelete: "set null" }),
  side: tradeSide("side").notNull(),
  status: tradeStatus("status").notNull().default("closed"),
  openedAt: ts("opened_at").notNull(),
  closedAt: ts("closed_at"),
  quantity: numeric("quantity", { precision: 24, scale: 8 }).notNull(),
  entryPrice: price("entry_price").notNull(),
  exitPrice: price("exit_price"),
  stopPrice: price("stop_price"),
  targetPrice: price("target_price"),
  fees: money("fees").notNull().default("0"),
  /** Net P&L in the account's currency, after fees. */
  pnl: money("pnl"),
  riskAmount: money("risk_amount"),
  rMultiple: numeric("r_multiple", { precision: 10, scale: 4 }),
  followedPlan: boolean("followed_plan"),
  checklistMet: jsonb("checklist_met").$type<string[]>().notNull().default([]),
  grade: processGrade("grade"),
  emotions: text("emotions").array().notNull().default(sql`'{}'::text[]`),
  notes: text("notes"),
  source: tradeSource("source").notNull().default("manual"),
  /** Broker/import id — makes re-imports idempotent. */
  externalId: text("external_id"),
  importId: uuid("import_id"),
  /** Set when this trade was logged while a rule was overridden. */
  ruleOverrideId: uuid("rule_override_id"),
  isDemoData: boolean("is_demo_data").notNull().default(false),
  /** Optimistic concurrency: clients send the version they edited. */
  version: integer("version").notNull().default(1),
  deletedAt: ts("deleted_at"),
  createdAt,
  updatedAt,
}, (t) => [
  index("trade_user_account_opened_idx").on(t.userId, t.accountId, t.openedAt.desc()).where(sql`${t.deletedAt} is null`),
  index("trade_account_closed_idx").on(t.accountId, t.closedAt).where(sql`${t.deletedAt} is null`),
  index("trade_user_strategy_idx").on(t.userId, t.strategyId),
  uniqueIndex("trade_external_uq").on(t.accountId, t.source, t.externalId).where(sql`${t.externalId} is not null`),
  index("trade_notes_fts_idx").using("gin", sql`to_tsvector('simple', coalesce(${t.notes}, ''))`),
]);

export const tradeAttachment = pgTable("trade_attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  tradeId: uuid("trade_id").notNull().references(() => trade.id, { onDelete: "cascade" }),
  kind: attachmentKind("kind").notNull(),
  /** Object-storage key (screenshots) or a TradingView chart URL. */
  storageKey: text("storage_key"),
  url: text("url"),
  width: smallint("width"),
  height: smallint("height"),
  bytes: integer("bytes"),
  createdAt,
}, (t) => [index("trade_attachment_trade_idx").on(t.tradeId)]);

/**
 * Daily roll-up per account, maintained on every trade write.
 * Rule checks ("2 trades today?") and the calendar read one row instead of scanning trades.
 */
export const dailyAccountStat = pgTable("daily_account_stat", {
  accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
  userId: userId(),
  /** Trading day in the user's timezone. */
  day: date("day").notNull(),
  tradesCount: integer("trades_count").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  pnl: money("pnl").notNull().default("0"),
  rSum: numeric("r_sum", { precision: 12, scale: 4 }).notNull().default("0"),
  onPlanCount: integer("on_plan_count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.accountId, t.day] }), index("daily_stat_user_day_idx").on(t.userId, t.day)]);

/* ───────────────────────── Rules & discipline ───────────────────────── */

export const tradingRule = pgTable("trading_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  /** null = applies to every account. */
  accountId: uuid("account_id").references(() => tradingAccount.id, { onDelete: "cascade" }),
  kind: ruleKind("kind").notNull(),
  /** e.g. { max: 2 } · { amount: "300" } · { start: "01:00", end: "10:00" } · { pct: "1" } */
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  enforcement: ruleEnforcement("enforcement").notNull().default("block"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt,
  updatedAt,
}, (t) => [index("trading_rule_user_idx").on(t.userId)]);

/** The user deliberately unlocked a rule for one day. Kept forever: it shows up in Weekly review. */
export const ruleOverride = pgTable("rule_override", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  ruleId: uuid("rule_id").notNull().references(() => tradingRule.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  reason: text("reason"),
  createdAt,
}, (t) => [uniqueIndex("rule_override_rule_day_uq").on(t.ruleId, t.day)]);

export const ruleViolation = pgTable("rule_violation", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  ruleId: uuid("rule_id").notNull().references(() => tradingRule.id, { onDelete: "cascade" }),
  tradeId: uuid("trade_id").references(() => trade.id, { onDelete: "set null" }),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("rule_violation_user_time_idx").on(t.userId, t.occurredAt.desc())]);

/* ───────────────────────── Weekly review ───────────────────────── */

export const weeklyReview = pgTable("weekly_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").references(() => tradingAccount.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  wentWell: text("went_well"),
  toImprove: text("to_improve"),
  focusNext: text("focus_next"),
  createdAt,
  updatedAt,
}, (t) => [uniqueIndex("weekly_review_uq").on(t.userId, t.accountId, t.weekStart)]);

/* ───────────────────────── Imports & brokers ───────────────────────── */

export const tradeImport = pgTable("trade_import", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
  format: text("format").notNull(), // mt5_csv, generic_csv, zerodha_tradebook, ibkr_flex…
  fileName: text("file_name"),
  status: importStatus("status").notNull().default("pending"),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
  errors: jsonb("errors").$type<{ row: number; message: string }[]>().notNull().default([]),
  createdAt,
  completedAt: ts("completed_at"),
});

export const brokerConnection = pgTable("broker_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: "cascade" }),
  broker: text("broker").notNull(), // zerodha, upstox, dhan, angelone, ibkr, alpaca, oanda, mt5_bridge…
  status: brokerStatus("status").notNull().default("connected"),
  /** AES-256-GCM ciphertext (iv:tag:data, base64). Never stored or logged in plain text. */
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  tokenExpiresAt: ts("token_expires_at"),
  lastSyncedAt: ts("last_synced_at"),
  syncCursor: text("sync_cursor"),
  createdAt,
  updatedAt,
}, (t) => [uniqueIndex("broker_connection_account_uq").on(t.accountId, t.broker)]);

/* ───────────────────────── Ledger Coach & MCP ───────────────────────── */

export const coachThread = pgTable("coach_thread", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  title: text("title"),
  createdAt,
  updatedAt,
}, (t) => [index("coach_thread_user_idx").on(t.userId, t.updatedAt.desc())]);

export const coachMessage = pgTable("coach_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  threadId: uuid("thread_id").notNull().references(() => coachThread.id, { onDelete: "cascade" }),
  role: coachRole("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  createdAt,
}, (t) => [index("coach_message_thread_idx").on(t.threadId, t.createdAt)]);

/** Personal access tokens for MCP clients. Only a SHA-256 hash is stored. */
export const apiToken = pgTable("api_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userId(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  /** e.g. ["journal:read"] or ["journal:read","trades:write"] */
  scopes: text("scopes").array().notNull(),
  lastUsedAt: ts("last_used_at"),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  createdAt,
}, (t) => [uniqueIndex("api_token_hash_uq").on(t.tokenHash)]);

/* ───────────────────────── FX & audit ───────────────────────── */

/** Daily reference rates to show cross-account totals in the user's base currency. */
export const fxRate = pgTable("fx_rate", {
  day: date("day").notNull(),
  base: char("base", { length: 3 }).notNull(),
  quote: char("quote", { length: 3 }).notNull(),
  rate: numeric("rate", { precision: 20, scale: 10 }).notNull(),
}, (t) => [primaryKey({ columns: [t.day, t.base, t.quote] })]);

/** Append-only. Partitioned by month in production (see db/sql). */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id"),
  actor: auditActor("actor").notNull(),
  action: text("action").notNull(), // trade.create, rule.override, token.create…
  entity: text("entity"),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  ipHash: text("ip_hash"),
  createdAt,
}, (t) => [index("audit_user_time_idx").on(t.userId, t.createdAt.desc())]);
