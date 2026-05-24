-- CreateEnum
CREATE TYPE "AuthLogEvent" AS ENUM ('SIGN_IN_SUCCESS', 'SIGN_IN_FAILED', 'PERMISSION_DENIED', 'SIGN_OUT');

-- CreateTable
CREATE TABLE "auth_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT,
    "event" "AuthLogEvent" NOT NULL,
    "reason" TEXT,
    "required_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "held_permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "path" VARCHAR(512),
    "method" VARCHAR(16),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_logs_user_id_created_at_idx" ON "auth_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_logs_event_created_at_idx" ON "auth_logs"("event", "created_at");

-- CreateIndex
CREATE INDEX "auth_logs_email_idx" ON "auth_logs"("email");

-- AddForeignKey
ALTER TABLE "auth_logs" ADD CONSTRAINT "auth_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
