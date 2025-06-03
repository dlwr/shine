#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@libsql/client');

const env = process.env.NODE_ENV || 'development';
const isDev = env === 'development';

const dbUrl = isDev ? process.env.TURSO_DATABASE_URL_DEV : process.env.TURSO_DATABASE_URL_PROD;
const authToken = isDev ? process.env.TURSO_AUTH_TOKEN_DEV : process.env.TURSO_AUTH_TOKEN_PROD;

if (!dbUrl || !authToken) {
  console.error(`Missing database credentials for ${env} environment`);
  process.exit(1);
}

async function resetMigrations() {
  const client = createClient({
    url: dbUrl,
    authToken: authToken,
  });

  try {
    // Drop the migrations table
    await client.execute('DROP TABLE IF EXISTS __drizzle_migrations');
    console.log('✓ Dropped migrations table');
    
    // Run the migration command
    const { execSync } = require('child_process');
    console.log('Running migrations...');
    execSync('pnpm run db:migrate', { stdio: 'inherit' });
    
  } catch (error) {
    console.error('Error resetting migrations:', error);
    process.exit(1);
  }
}

resetMigrations();