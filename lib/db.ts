import { Pool, types } from "pg";

// 1082 = type DATE : renvoyer la chaîne brute, sans conversion de fuseau.
types.setTypeParser(1082, (v) => v);

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
});

export const dbReadOnly = new Pool({
    connectionString: process.env.DATABASE_URL_READONLY,
    max: 5,
});