// Enables Row Level Security on every table in the `public` schema.
// With no policies defined, this blocks Supabase's Data API (anon /
// authenticated roles) while the app — which connects as the table owner via
// the direct Prisma connection — keeps full access (owners bypass RLS unless
// FORCE is set, which we intentionally do NOT set).
//
// Run:  node -r dotenv/config scripts/enable-rls.mjs   (reads DATABASE_URL from .env)
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

await client.query(`
  DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
  END $$;
`);

const status = await client.query(`
  SELECT relname AS "table", relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  ORDER BY relname;
`);
console.table(status.rows);

// Sanity check: the owner (our app's connection) can still read.
const count = await client.query('SELECT COUNT(*)::int AS users FROM "User";');
console.log("Owner read OK — User rows:", count.rows[0].users);

await client.end();
