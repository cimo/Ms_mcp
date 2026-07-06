import Pg from "pg";

// Source
import * as helperSrc from "./HelperSrc.js";

export const pool = new Pg.Pool({
    host: helperSrc.DB_HOST,
    port: parseInt(helperSrc.DB_PORT),
    database: helperSrc.DB_NAME,
    user: helperSrc.DB_USER,
    password: helperSrc.DB_PASS
});

pool.on("error", (error: Error) => {
    helperSrc.writeLog("Database.ts - pool.on(error)", error.message);
});
