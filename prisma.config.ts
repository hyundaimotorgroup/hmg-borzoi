import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';

// In Kubernetes, environment variables are injected from Secrets.
// Load .env.local for local development.
dotenv.config({ path: '.env.local', override: false });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
