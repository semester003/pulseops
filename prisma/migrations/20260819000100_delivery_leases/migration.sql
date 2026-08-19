-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

