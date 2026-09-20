import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const nowText = sql`CURRENT_TIMESTAMP`;

export const boats = pgTable("boats", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  registration: text("registration").notNull(),
  owner: text("owner"),
  homePort: text("home_port"),
  storageCapacityKg: doublePrecision("storage_capacity_kg"),
  lengthMeters: doublePrecision("length_meters"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [
  uniqueIndex("idx_boats_owner_registration").on(t.ownerId, t.registration),
  index("idx_boats_owner").on(t.ownerId),
]);

export const species = pgTable("species", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  commonName: text("common_name").notNull(),
  scientificName: text("scientific_name"),
  code: text("code"),
  active: boolean("active").notNull().default(true),
}, (t) => [index("idx_species_owner").on(t.ownerId)]);

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  boatId: integer("boat_id").notNull().references(() => boats.id),
  departureDate: text("departure_date").notNull(),
  expectedReturnDate: text("expected_return_date").notNull(),
  returnDate: text("return_date"),
  departurePort: text("departure_port").notNull(),
  returnPort: text("return_port"),
  captain: text("captain").notNull(),
  crewCount: integer("crew_count").notNull().default(1),
  targetKg: doublePrecision("target_kg").notNull(),
  primarySpeciesId: integer("primary_species_id").references(() => species.id),
  fishingType: text("fishing_type").notNull().default("Rede de emalhe"),
  status: text("status").notNull().default("PLANNED"),
  notes: text("notes"),
  deletedAt: text("deleted_at"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
}, (t) => [
  index("idx_trips_boat_status").on(t.boatId, t.status),
  index("idx_trips_owner_status").on(t.ownerId, t.status),
]);

export const fishingSets = pgTable("fishing_sets", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  startLatitude: doublePrecision("start_latitude"),
  startLongitude: doublePrecision("start_longitude"),
  endLatitude: doublePrecision("end_latitude"),
  endLongitude: doublePrecision("end_longitude"),
  depthMeters: doublePrecision("depth_meters"),
  netLengthMeters: doublePrecision("net_length_meters"),
  netHeightMeters: doublePrecision("net_height_meters"),
  meshSize: doublePrecision("mesh_size"),
  netQuantity: integer("net_quantity"),
  soakTimeMinutes: integer("soak_time_minutes"),
  waterTemperature: doublePrecision("water_temperature"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [uniqueIndex("idx_sets_trip_number").on(t.tripId, t.setNumber)]);

export const catches = pgTable("catches", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  fishingSetId: integer("fishing_set_id").notNull().references(() => fishingSets.id, { onDelete: "cascade" }),
  speciesId: integer("species_id").notNull().references(() => species.id),
  catchType: text("catch_type").notNull().default("PRIMARY"),
  weightKg: doublePrecision("weight_kg").notNull(),
  caughtAt: text("caught_at").notNull(),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [index("idx_catches_trip_date").on(t.tripId, t.caughtAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull().default(nowText),
});

export const aisSavedVessels = pgTable("ais_saved_vessels", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  vesselKey: text("vessel_key").notNull(),
  name: text("name").notNull(),
  mmsi: text("mmsi"),
  imo: text("imo"),
  country: text("country"),
  vesselType: text("vessel_type"),
  callsign: text("callsign"),
  folder: text("folder").notNull().default("premium"),
  lastLatitude: doublePrecision("last_latitude"),
  lastLongitude: doublePrecision("last_longitude"),
  lastSog: doublePrecision("last_sog"),
  lastCog: doublePrecision("last_cog"),
  lastHeading: doublePrecision("last_heading"),
  lastDestination: text("last_destination"),
  lastStatus: text("last_status"),
  lastDataSource: text("last_data_source"),
  lastPositionReceived: text("last_position_received"),
  lastUpdateTime: text("last_update_time"),
  savedAt: text("saved_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
}, (t) => [
  uniqueIndex("idx_ais_saved_owner_key").on(t.ownerId, t.vesselKey),
  index("idx_ais_saved_owner_updated").on(t.ownerId, t.updatedAt),
]);

export const aisSearchHistory = pgTable("ais_search_history", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  vesselKey: text("vessel_key").notNull(),
  name: text("name").notNull(),
  mmsi: text("mmsi"),
  imo: text("imo"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  sog: doublePrecision("sog"),
  cog: doublePrecision("cog"),
  heading: doublePrecision("heading"),
  destination: text("destination"),
  navStatus: text("nav_status"),
  dataSource: text("data_source"),
  positionReceived: text("position_received"),
  updateTime: text("update_time"),
  creditsUsed: integer("credits_used").notNull().default(0),
  queriedAt: text("queried_at").notNull().default(nowText),
}, (t) => [
  index("idx_ais_history_owner_time").on(t.ownerId, t.queriedAt),
  index("idx_ais_history_owner_vessel").on(t.ownerId, t.vesselKey),
]);


export const mapWaypoints = pgTable("map_waypoints", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  icon: text("icon").notNull().default("diamond"),
  color: text("color").notNull().default("#ffb52e"),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
}, (t) => [
  index("idx_map_waypoints_owner_time").on(t.ownerId, t.id),
]);

export const forecastHistory = pgTable("forecast_history", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  latitudeRaw: text("latitude_raw"),
  longitudeRaw: text("longitude_raw"),
  positionLabel: text("position_label"),
  payloadJson: text("payload_json").notNull(),
  source: text("source"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [
  index("idx_forecast_history_owner_time").on(t.ownerId, t.id),
]);

export const savedForecasts = pgTable("saved_forecasts", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  latitudeRaw: text("latitude_raw"),
  longitudeRaw: text("longitude_raw"),
  positionLabel: text("position_label"),
  payloadJson: text("payload_json").notNull(),
  source: text("source"),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
}, (t) => [
  index("idx_saved_forecasts_owner_time").on(t.ownerId, t.id),
]);


export const billingSettings = pgTable("billing_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(nowText),
});

export const creditWallets = pgTable("credit_wallets", {
  userId: text("user_id").primaryKey(),
  email: text("email"),
  role: text("role").notNull().default("user"),
  balance: integer("balance").notNull().default(0),
  aiBonusBrl: doublePrecision("ai_bonus_brl").notNull().default(0),
  aiBonusGranted: boolean("ai_bonus_granted").notNull().default(false),
  freeAisAccess: boolean("free_ais_access").notNull().default(false),
  freeAiAccess: boolean("free_ai_access").notNull().default(false),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  amountBrl: doublePrecision("amount_brl"),
  reference: text("reference"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [index("idx_credit_transactions_user_time").on(t.userId, t.id)]);

export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  requestType: text("request_type").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  creditsCharged: integer("credits_charged").notNull().default(0),
  estimatedApiCostBrl: doublePrecision("estimated_api_cost_brl").notNull().default(0),
  status: text("status").notNull(),
  errorText: text("error_text"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [index("idx_ai_usage_user_time").on(t.userId, t.id)]);

export const aisUsage = pgTable("ais_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  vesselName: text("vessel_name"),
  providerCalls: integer("provider_calls").notNull().default(0),
  cacheHit: boolean("cache_hit").notNull().default(false),
  creditsCharged: integer("credits_charged").notNull().default(0),
  estimatedApiCostBrl: doublePrecision("estimated_api_cost_brl").notNull().default(0),
  status: text("status").notNull(),
  errorText: text("error_text"),
  createdAt: text("created_at").notNull().default(nowText),
}, (t) => [index("idx_ais_usage_user_time").on(t.userId, t.id)]);

export const paymentOrders = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  externalReference: text("external_reference").notNull(),
  preferenceId: text("preference_id"),
  paymentId: text("payment_id"),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  credits: integer("credits").notNull(),
  amountBrl: doublePrecision("amount_brl").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at").notNull().default(nowText),
  approvedAt: text("approved_at"),
}, (t) => [
  uniqueIndex("idx_payment_external_reference").on(t.externalReference),
  uniqueIndex("idx_payment_payment_id").on(t.paymentId),
  index("idx_payment_orders_user_time").on(t.userId, t.id),
]);
