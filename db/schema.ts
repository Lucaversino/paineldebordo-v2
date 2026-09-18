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
  queriedAt: text("queried_at").notNull().default(nowText),
}, (t) => [
  index("idx_ais_history_owner_time").on(t.ownerId, t.queriedAt),
  index("idx_ais_history_owner_vessel").on(t.ownerId, t.vesselKey),
]);
