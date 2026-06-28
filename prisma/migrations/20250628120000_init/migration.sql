-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "workplace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PidMaster" (
    "pid" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PidMaster_pkey" PRIMARY KEY ("pid")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "workplace" TEXT NOT NULL,
    "facilityName" TEXT NOT NULL,
    "maskedUtterance" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_name_key" ON "Facility"("name");

-- CreateIndex
CREATE INDEX "Record_staffId_timestamp_idx" ON "Record"("staffId", "timestamp");

-- CreateIndex
CREATE INDEX "Record_timestamp_idx" ON "Record"("timestamp");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
