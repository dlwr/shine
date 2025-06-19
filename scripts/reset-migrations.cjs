#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@libsql/client');

const environment = process.env.NODE_ENV || 'development';
const isDevelopment = environment === 'development';

const databaseUrl = isDevelopment ? process.env.TURSO_DATABASE_URL_DEV : process.env.TURSO_DATABASE_URL_PROD;
const authToken = isDevelopment ? process.env.TURSO_AUTH_TOKEN_DEV : process.env.TURSO_AUTH_TOKEN_PROD;

if (!databaseUrl || !authToken) {
  console.error(`Missing database credentials for ${environment} environment`);
  process.exit(1);
}

async function resetMigrations() {
  const client = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  try {
    // Drop the migrations table
    await client.execute('DROP TABLE IF EXISTS __drizzle_migrations');
    console.log('✓ Dropped migrations table');
    
    // Run the migration command
    const { execSync } = require('node:child_process');
    console.log('Running migrations...');
    execSync('pnpm run db:migrate', { stdio: 'inherit' });
    
  } catch (error) {
    console.error('Error resetting migrations:', error);
    process.exit(1);
  }
}

resetMigrations();