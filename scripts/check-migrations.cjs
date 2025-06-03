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

async function checkMigrations() {
  const client = createClient({
    url: dbUrl,
    authToken: authToken,
  });

  try {
    // Check if migrations table exists
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='__drizzle_migrations'
    `);
    
    if (tables.rows.length > 0) {
      console.log('✓ Migrations table exists');
      
      // Get all migrations
      const migrations = await client.execute('SELECT * FROM __drizzle_migrations ORDER BY created_at');
      console.log('\nApplied migrations:');
      migrations.rows.forEach(row => {
        console.log(`- ${row.tag} (${new Date(row.created_at).toISOString()})`);
      });
    } else {
      console.log('✗ Migrations table does not exist');
    }
    
  } catch (error) {
    console.error('Error checking migrations:', error);
    process.exit(1);
  }
}

checkMigrations();