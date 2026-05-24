-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('NEW_PATIENT_VISIT', 'FOLLOW_UP', 'CONSULTATION', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "google_sub" TEXT,
    "first_name_en" TEXT NOT NULL,
    "last_name_en" TEXT NOT NULL,
    "first_name_th" TEXT,
    "last_name_th" TEXT,
    "role" "Role" NOT NULL,
    "picture" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hn" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "blood_group" "BloodGroup" NOT NULL DEFAULT 'UNKNOWN',
    "identification_no" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emergency_person_name" TEXT NOT NULL,
    "emergency_person_relation" TEXT NOT NULL,
    "emergency_person_phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "doctor_code" TEXT NOT NULL,
    "gender" "Gender",
    "medical_license_no" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_schedules" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "break_start_minute" INTEGER,
    "break_end_minute" INTEGER,
    "accepts_booking" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "appointment_type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "cancelled_by_user_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_domains" (
    "domain" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "staff_domains_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_hn_key" ON "patients"("hn");

-- CreateIndex
CREATE INDEX "patients_deleted_at_idx" ON "patients"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_deleted_at_idx" ON "departments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_doctor_code_key" ON "doctors"("doctor_code");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_medical_license_no_key" ON "doctors"("medical_license_no");

-- CreateIndex
CREATE INDEX "doctors_department_id_idx" ON "doctors"("department_id");

-- CreateIndex
CREATE INDEX "doctors_deleted_at_idx" ON "doctors"("deleted_at");

-- CreateIndex
CREATE INDEX "doctor_schedules_doctor_id_day_of_week_effective_from_idx" ON "doctor_schedules"("doctor_id", "day_of_week", "effective_from");

-- CreateIndex
CREATE INDEX "doctor_schedules_deleted_at_idx" ON "doctor_schedules"("deleted_at");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_start_at_idx" ON "appointments"("doctor_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_start_at_idx" ON "appointments"("patient_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "staff_domains_deleted_at_idx" ON "staff_domains"("deleted_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_domains" ADD CONSTRAINT "staff_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_domains" ADD CONSTRAINT "staff_domains_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
