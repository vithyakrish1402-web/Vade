-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "clearedAt" TIMESTAMP(3);
