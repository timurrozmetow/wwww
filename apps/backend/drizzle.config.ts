import { defineConfig } from 'drizzle-kit';

// `generate` works purely from the schema (no DB). `migrate`/`push`/`studio`
// need DATABASE_URL (see .env / docker-compose.yml).
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://vpn:vpn_password@127.0.0.1:3306/vpn',
  },
});
