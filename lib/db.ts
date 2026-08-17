import { Pool } from "pg";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const dbReadOnly = new Pool({
  connectionString: process.env.DATABASE_URL_READONLY,
  max: 5,
});