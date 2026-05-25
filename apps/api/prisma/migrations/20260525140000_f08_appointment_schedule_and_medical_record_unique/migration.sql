-- DropIndex
DROP INDEX "medical_records_appointment_id_idx";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "schedule_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "appointments_schedule_id_status_idx" ON "appointments"("schedule_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "medical_records_appointment_id_key" ON "medical_records"("appointment_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "doctor_schedules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
