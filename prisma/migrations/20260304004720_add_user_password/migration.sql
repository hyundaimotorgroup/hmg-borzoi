/*
  Warnings:

  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: Add password column with temporary default, then remove default
ALTER TABLE "User" ADD COLUMN "password" TEXT NOT NULL DEFAULT 'temp';
ALTER TABLE "User" ALTER COLUMN "password" DROP DEFAULT;
