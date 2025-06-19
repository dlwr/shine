#!/usr/bin/env node

require('dotenv').config();

const environment = process.env.NODE_ENV || 'development';
const isDevelopment = environment === 'development';

const databaseUrl = isDevelopment ? process.env.TURSO_DATABASE_URL_DEV : process.env.TURSO_DATABASE_URL_PROD;
const authToken = isDevelopment ? process.env.TURSO_AUTH_TOKEN_DEV : process.env.TURSO_AUTH_TOKEN_PROD;

if (!databaseUrl || !authToken) {
  console.error(`Missing database credentials for ${environment} environment`);
  console.error('Please ensure the following environment variables are set:');
  console.error(isDevelopment ? '- TURSO_DATABASE_URL_DEV' : '- TURSO_DATABASE_URL_PROD');
  console.error(isDevelopment ? '- TURSO_AUTH_TOKEN_DEV' : '- TURSO_AUTH_TOKEN_PROD');
  process.exit(1);
}

process.env.TURSO_DATABASE_URL = databaseUrl;
process.env.TURSO_AUTH_TOKEN = authToken;

const command = process.argv.slice(2).join(' ');
if (command) {
  const { execSync } = require('node:child_process');
  try {
    execSync(command, { stdio: 'inherit', env: process.env });
  } catch (error) {
    process.exit(error.status || 1);
  }
}