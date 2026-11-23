-- =============================================================================
-- Availability & integrity constraints that Prisma schema cannot express.
--
-- These objects are NOT represented in schema.prisma. They are created only by
-- this migration. Never use `prisma db push` against a shared database: it
-- would not create them. See backend/README.md.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Vehicle availability: no overlapping ACTIVE occupancy (blocks, holds,
-- bookings) per vehicle. Range is half-open, so back-to-back rows are allowed.
-- -----------------------------------------------------------------------------
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_no_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

-- -----------------------------------------------------------------------------
-- Driver availability: no overlapping ACTIVE assignments per driver.
-- Covers owner-drivers linked to several vehicles (rule 16).
-- -----------------------------------------------------------------------------
ALTER TABLE "driver_assignment" ADD CONSTRAINT "driver_assignment_no_overlap"
  EXCLUDE USING gist (
    "driver_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

-- At most one ACTIVE driver assignment per booking (replacement marks the old
-- one REPLACED first).
ALTER TABLE "driver_assignment" ADD CONSTRAINT "driver_assignment_one_active_per_booking"
  EXCLUDE USING btree ("booking_id" WITH =) WHERE ("status" = 'ACTIVE');

-- -----------------------------------------------------------------------------
-- A normal driver can be linked to only one vehicle; owner-drivers are exempt
-- (rules 4 & 5).
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "vehicle_driver_one_vehicle_per_driver"
  ON "vehicle_driver" ("driver_id") WHERE ("is_owner_driver" = false);

-- -----------------------------------------------------------------------------
-- Sanity checks
-- -----------------------------------------------------------------------------
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_valid_range"
  CHECK ("blocked_until" > "starts_at");
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_ends_valid"
  CHECK ("ends_at" > "starts_at" AND "blocked_until" >= "ends_at");
-- Only HOLD rows carry a payment deadline.
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_hold_expiry"
  CHECK (("kind" = 'HOLD') = ("expires_at" IS NOT NULL));
-- HOLD / BOOKING rows always point at a booking; owner BLOCK rows never do.
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_booking_link"
  CHECK (("kind" = 'BLOCK') = ("booking_id" IS NULL));

ALTER TABLE "quotation" ADD CONSTRAINT "quotation_valid_range"
  CHECK ("ends_at" > "starts_at");
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_expires_before_start"
  CHECK ("expires_at" <= "starts_at");
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_amounts_non_negative"
  CHECK ("base_amount" >= 0 AND "total_amount" >= 0);

ALTER TABLE "booking" ADD CONSTRAINT "booking_valid_range"
  CHECK ("ends_at" > "starts_at");
ALTER TABLE "booking" ADD CONSTRAINT "booking_amount_non_negative"
  CHECK ("total_amount" >= 0);

ALTER TABLE "driver_assignment" ADD CONSTRAINT "driver_assignment_valid_range"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_passengers_positive"
  CHECK ("passenger_count" > 0);
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_return_after_start"
  CHECK ("requested_return_at" IS NULL OR "requested_return_at" > "requested_start_at");

ALTER TABLE "trip_stop" ADD CONSTRAINT "trip_stop_sequence_positive"
  CHECK ("sequence" >= 1);

ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_seats_positive"
  CHECK ("seats" > 0 AND "luggage_capacity" >= 0);

ALTER TABLE "indicative_price" ADD CONSTRAINT "indicative_price_amount_non_negative"
  CHECK ("amount" >= 0);

ALTER TABLE "owner_profile" ADD CONSTRAINT "owner_profile_business_name_required"
  CHECK ("owner_type" <> 'BUSINESS' OR "business_name" IS NOT NULL);

-- Exactly one subject FK is set and it matches subject_type.
ALTER TABLE "document" ADD CONSTRAINT "document_one_subject"
  CHECK (
    num_nonnulls("owner_id", "driver_id", "vehicle_id") = 1
    AND (
      ("subject_type" = 'OWNER'   AND "owner_id"   IS NOT NULL) OR
      ("subject_type" = 'DRIVER'  AND "driver_id"  IS NOT NULL) OR
      ("subject_type" = 'VEHICLE' AND "vehicle_id" IS NOT NULL)
    )
  );
