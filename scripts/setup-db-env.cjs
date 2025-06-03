#!/usr/bin/env node

require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isDev = env === 'development';

const dbUrl = isDev ? process.env.TURSO_DATABASE_URL_DEV : process.env.TURSO_DATABASE_URL_PROD;
const authToken = isDev ? process.env.TURSO_AUTH_TOKEN_DEV : process.env.TURSO_AUTH_TOKEN_PROD;

if (!dbUrl || !authToken) {
  console.error(`Missing database credentials for ${env} environment`);
  console.error('Please ensure the following environment variables are set:');
  console.error(isDev ? '- TURSO_DATABASE_URL_DEV' : '- TURSO_DATABASE_URL_PROD');
  console.error(isDev ? '- TURSO_AUTH_TOKEN_DEV' : '- TURSO_AUTH_TOKEN_PROD');
  process.exit(1);
}

process.env.TURSO_DATABASE_URL = dbUrl;
process.env.TURSO_AUTH_TOKEN = authToken;

const command = process.argv.slice(2).join(' ');
if (command) {
  const { execSync } = require('child_process');
  try {
    execSync(command, { stdio: 'inherit', env: process.env });
  } catch (error) {
    process.exit(error.status || 1);
  }
}