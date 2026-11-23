-- CreateEnum
CREATE TYPE "role" AS ENUM ('CUSTOMER', 'OWNER', 'DRIVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "owner_type" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "document_subject" AS ENUM ('OWNER', 'DRIVER', 'VEHICLE');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "vehicle_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "fuel_type" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG');

-- CreateEnum
CREATE TYPE "pricing_unit" AS ENUM ('PER_DAY', 'PER_KM', 'PER_HOUR', 'PER_TRIP');

-- CreateEnum
CREATE TYPE "trip_type" AS ENUM ('ONE_WAY', 'RETURN', 'HOURLY', 'MULTI_DAY', 'AIRPORT_TRANSFER');

-- CreateEnum
CREATE TYPE "trip_request_status" AS ENUM ('SUBMITTED', 'QUOTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "quotation_status" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'STARTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "occupancy_kind" AS ENUM ('BLOCK', 'HOLD', 'BOOKING');

-- CreateEnum
CREATE TYPE "occupancy_status" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "driver_assignment_status" AS ENUM ('ACTIVE', 'REPLACED', 'CANCELLED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "owner_type" "owner_type" NOT NULL,
    "business_name" TEXT,
    "business_reg_number" TEXT,
    "verification_status" "verification_status" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "licence_number" TEXT NOT NULL,
    "licence_expires_at" TIMESTAMPTZ(3),
    "verification_status" "verification_status" NOT NULL DEFAULT 'PENDING',
    "is_owner_driver" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" "document_subject" NOT NULL,
    "owner_id" UUID,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "document_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_file_name" TEXT,
    "mime_type" TEXT,
    "valid_until" TIMESTAMPTZ(3),
    "status" "document_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_operating_area" (
    "owner_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_operating_area_pkey" PRIMARY KEY ("owner_id","area_id")
);

-- CreateTable
CREATE TABLE "vehicle_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "registration_number" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "luggage_capacity" INTEGER NOT NULL DEFAULT 0,
    "air_conditioned" BOOLEAN NOT NULL DEFAULT true,
    "transmission" "transmission" NOT NULL,
    "fuel_type" "fuel_type" NOT NULL,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "approval_status" "vehicle_approval_status" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "rejection_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_image" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_driver" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "is_owner_driver" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicative_price" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "pricing_unit" "pricing_unit" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicative_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "trip_type" "trip_type" NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "pickup_lat" DECIMAL(9,6),
    "pickup_lng" DECIMAL(9,6),
    "destination_address" TEXT,
    "destination_lat" DECIMAL(9,6),
    "destination_lng" DECIMAL(9,6),
    "requested_start_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_return_at" TIMESTAMPTZ(3),
    "requested_hours" INTEGER,
    "passenger_count" INTEGER NOT NULL,
    "luggage_notes" TEXT,
    "special_requirements" TEXT,
    "flight_number" TEXT,
    "flight_arrival_at" TIMESTAMPTZ(3),
    "status" "trip_request_status" NOT NULL DEFAULT 'SUBMITTED',
    "rejection_reason" TEXT,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stop" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_request_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_request_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "notes" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "quotation_status" NOT NULL DEFAULT 'SENT',
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_charge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotation_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "status" "booking_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "trip_status" "trip_status",
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_occupancy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "kind" "occupancy_kind" NOT NULL,
    "status" "occupancy_status" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "booking_id" UUID,
    "reason" TEXT,
    "created_by_user_id" UUID,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "driver_assignment_status" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_user_id" UUID NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "from_status" "trip_status",
    "to_status" "trip_status" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_request_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_request_id" UUID NOT NULL,
    "from_status" "trip_request_status",
    "to_status" "trip_request_status" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotation_id" UUID NOT NULL,
    "from_status" "quotation_status",
    "to_status" "quotation_status" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "from_status" "booking_status",
    "to_status" "booking_status" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE INDEX "user_role_role_idx" ON "user_role"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_user_id_role_key" ON "user_role"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_user_id_key" ON "customer_profile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_profile_user_id_key" ON "owner_profile"("user_id");

-- CreateIndex
CREATE INDEX "owner_profile_verification_status_idx" ON "owner_profile"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profile_user_id_key" ON "driver_profile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profile_licence_number_key" ON "driver_profile"("licence_number");

-- CreateIndex
CREATE INDEX "driver_profile_owner_id_idx" ON "driver_profile"("owner_id");

-- CreateIndex
CREATE INDEX "driver_profile_verification_status_idx" ON "driver_profile"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profile_id_owner_id_key" ON "driver_profile"("id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profile_id_is_owner_driver_key" ON "driver_profile"("id", "is_owner_driver");

-- CreateIndex
CREATE INDEX "document_owner_id_idx" ON "document"("owner_id");

-- CreateIndex
CREATE INDEX "document_driver_id_idx" ON "document"("driver_id");

-- CreateIndex
CREATE INDEX "document_vehicle_id_idx" ON "document"("vehicle_id");

-- CreateIndex
CREATE INDEX "document_status_subject_type_idx" ON "document"("status", "subject_type");

-- CreateIndex
CREATE UNIQUE INDEX "area_slug_key" ON "area"("slug");

-- CreateIndex
CREATE INDEX "area_is_active_idx" ON "area"("is_active");

-- CreateIndex
CREATE INDEX "owner_operating_area_area_id_idx" ON "owner_operating_area"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_category_name_key" ON "vehicle_category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_category_slug_key" ON "vehicle_category"("slug");

-- CreateIndex
CREATE INDEX "vehicle_category_is_active_sort_order_idx" ON "vehicle_category"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_registration_number_key" ON "vehicle"("registration_number");

-- CreateIndex
CREATE INDEX "vehicle_owner_id_idx" ON "vehicle"("owner_id");

-- CreateIndex
CREATE INDEX "vehicle_category_id_idx" ON "vehicle"("category_id");

-- CreateIndex
CREATE INDEX "vehicle_approval_status_is_active_category_id_idx" ON "vehicle"("approval_status", "is_active", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_id_owner_id_key" ON "vehicle"("id", "owner_id");

-- CreateIndex
CREATE INDEX "vehicle_image_vehicle_id_sort_order_idx" ON "vehicle_image"("vehicle_id", "sort_order");

-- CreateIndex
CREATE INDEX "vehicle_driver_driver_id_idx" ON "vehicle_driver"("driver_id");

-- CreateIndex
CREATE INDEX "vehicle_driver_vehicle_id_owner_id_idx" ON "vehicle_driver"("vehicle_id", "owner_id");

-- CreateIndex
CREATE INDEX "vehicle_driver_driver_id_owner_id_idx" ON "vehicle_driver"("driver_id", "owner_id");

-- CreateIndex
CREATE INDEX "vehicle_driver_driver_id_is_owner_driver_idx" ON "vehicle_driver"("driver_id", "is_owner_driver");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_driver_vehicle_id_driver_id_key" ON "vehicle_driver"("vehicle_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicative_price_vehicle_id_pricing_unit_key" ON "indicative_price"("vehicle_id", "pricing_unit");

-- CreateIndex
CREATE INDEX "trip_request_customer_id_created_at_idx" ON "trip_request"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "trip_request_owner_id_status_created_at_idx" ON "trip_request"("owner_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "trip_request_vehicle_id_owner_id_idx" ON "trip_request"("vehicle_id", "owner_id");

-- CreateIndex
CREATE INDEX "trip_request_status_idx" ON "trip_request"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_request_id_vehicle_id_key" ON "trip_request"("id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stop_trip_request_id_sequence_key" ON "trip_stop"("trip_request_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_trip_request_id_key" ON "quotation"("trip_request_id");

-- CreateIndex
CREATE INDEX "quotation_vehicle_id_status_starts_at_idx" ON "quotation"("vehicle_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "quotation_status_expires_at_idx" ON "quotation"("status", "expires_at");

-- CreateIndex
CREATE INDEX "quotation_expires_at_idx" ON "quotation"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_trip_request_id_vehicle_id_key" ON "quotation"("trip_request_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "quotation_charge_quotation_id_idx" ON "quotation_charge"("quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_quotation_id_key" ON "booking"("quotation_id");

-- CreateIndex
CREATE INDEX "booking_customer_id_starts_at_idx" ON "booking"("customer_id", "starts_at");

-- CreateIndex
CREATE INDEX "booking_owner_id_status_starts_at_idx" ON "booking"("owner_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "booking_vehicle_id_owner_id_idx" ON "booking"("vehicle_id", "owner_id");

-- CreateIndex
CREATE INDEX "booking_vehicle_id_starts_at_idx" ON "booking"("vehicle_id", "starts_at");

-- CreateIndex
CREATE INDEX "booking_status_idx" ON "booking"("status");

-- CreateIndex
CREATE INDEX "vehicle_occupancy_vehicle_id_status_starts_at_idx" ON "vehicle_occupancy"("vehicle_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "vehicle_occupancy_booking_id_idx" ON "vehicle_occupancy"("booking_id");

-- CreateIndex
CREATE INDEX "vehicle_occupancy_kind_status_expires_at_idx" ON "vehicle_occupancy"("kind", "status", "expires_at");

-- CreateIndex
CREATE INDEX "driver_assignment_booking_id_status_idx" ON "driver_assignment"("booking_id", "status");

-- CreateIndex
CREATE INDEX "driver_assignment_driver_id_status_starts_at_idx" ON "driver_assignment"("driver_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "trip_event_booking_id_occurred_at_idx" ON "trip_event"("booking_id", "occurred_at");

-- CreateIndex
CREATE INDEX "trip_request_status_history_trip_request_id_created_at_idx" ON "trip_request_status_history"("trip_request_id", "created_at");

-- CreateIndex
CREATE INDEX "quotation_status_history_quotation_id_created_at_idx" ON "quotation_status_history"("quotation_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_created_at_idx" ON "booking_status_history"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "notification_user_id_read_at_created_at_idx" ON "notification"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_setting_key_key" ON "platform_setting"("key");

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_profile" ADD CONSTRAINT "owner_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profile" ADD CONSTRAINT "driver_profile_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owner_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profile" ADD CONSTRAINT "driver_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owner_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_operating_area" ADD CONSTRAINT "owner_operating_area_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owner_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_operating_area" ADD CONSTRAINT "owner_operating_area_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owner_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vehicle_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_image" ADD CONSTRAINT "vehicle_image_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driver" ADD CONSTRAINT "vehicle_driver_vehicle_id_owner_id_fkey" FOREIGN KEY ("vehicle_id", "owner_id") REFERENCES "vehicle"("id", "owner_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driver" ADD CONSTRAINT "vehicle_driver_driver_id_owner_id_fkey" FOREIGN KEY ("driver_id", "owner_id") REFERENCES "driver_profile"("id", "owner_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driver" ADD CONSTRAINT "vehicle_driver_driver_id_is_owner_driver_fkey" FOREIGN KEY ("driver_id", "is_owner_driver") REFERENCES "driver_profile"("id", "is_owner_driver") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicative_price" ADD CONSTRAINT "indicative_price_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_request" ADD CONSTRAINT "trip_request_vehicle_id_owner_id_fkey" FOREIGN KEY ("vehicle_id", "owner_id") REFERENCES "vehicle"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stop" ADD CONSTRAINT "trip_stop_trip_request_id_fkey" FOREIGN KEY ("trip_request_id") REFERENCES "trip_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_trip_request_id_vehicle_id_fkey" FOREIGN KEY ("trip_request_id", "vehicle_id") REFERENCES "trip_request"("id", "vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation" ADD CONSTRAINT "quotation_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_charge" ADD CONSTRAINT "quotation_charge_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_vehicle_id_owner_id_fkey" FOREIGN KEY ("vehicle_id", "owner_id") REFERENCES "vehicle"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_occupancy" ADD CONSTRAINT "vehicle_occupancy_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignment" ADD CONSTRAINT "driver_assignment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_assignment" ADD CONSTRAINT "driver_assignment_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_event" ADD CONSTRAINT "trip_event_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_request_status_history" ADD CONSTRAINT "trip_request_status_history_trip_request_id_fkey" FOREIGN KEY ("trip_request_id") REFERENCES "trip_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
