/**
 * Prisma client instance
 * Prevents duplicate Prisma instance creation caused by HMR in Next.js development environment
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load .env.local for local development environment
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'production') {
  try {
    dotenv.config({ path: '.env.local' });
  } catch (e) {
    console.warn('Failed to load .env.local:', e);
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 50,                    // Maximum connections (default: 10)
  idleTimeoutMillis: 30000,   // Idle connection timeout
  connectionTimeoutMillis: 5000, // Connection timeout
  allowExitOnIdle: false,     // Prevent process exit on idle
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
