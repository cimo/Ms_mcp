import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import Database from "better-sqlite3";
import Crypto from "node:crypto";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelUser from "../model/User.js";

export default class User {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    private database: Database.Database;

    // Method
    private passwordHash = (password: string): string => {
        const salt = Crypto.randomBytes(16).toString("hex");
        const hash = Crypto.scryptSync(password, salt, 64).toString("hex");

        return `${salt}:${hash}`;
    };

    private passwordVerify = (password: string, passwordUser: string): boolean => {
        let isResult = false;

        const passwordUserSplit = passwordUser.split(":");

        if (passwordUserSplit.length === 2) {
            const hash = Crypto.scryptSync(password, passwordUserSplit[0], 64).toString("hex");

            isResult = Crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(passwordUserSplit[1], "hex"));
        }

        return isResult;
    };

    private tableInsert = (id: number, email: string, name: string, surname: string, password: string, mcpSessionId: string): boolean => {
        let isResult = false;

        const hash = password === "" ? null : this.passwordHash(password);

        this.database
            .prepare("INSERT OR IGNORE INTO \"user\" (id, email, name, surname, password, mcp_session_id) VALUES (?, ?, ?, ?, ?, NULLIF(?, ''));")
            .run(id, email, name, surname, hash, mcpSessionId);

        isResult = true;

        return isResult;
    };

    private tableUpdate = (id: number, name: string, surname: string, password: string, mcpSessionId: string): boolean => {
        let isResult = false;

        const hash = password === "" ? null : this.passwordHash(password);

        this.database
            .prepare("UPDATE \"user\" SET name = ?, surname = ?, password = COALESCE(?, password), mcp_session_id = NULLIF(?, '') WHERE id = ?;")
            .run(name, surname, hash, mcpSessionId, id);

        isResult = true;

        return isResult;
    };

    private tableSelect = (email: string, mcpSessionId: string): modelUser.Idata => {
        const resultObject = {} as modelUser.Idata;

        const queryRow = this.database
            .prepare('SELECT id, email, name, surname, password, mcp_session_id FROM "user" WHERE email = ? OR mcp_session_id = ?;')
            .get(email, mcpSessionId) as unknown as modelUser.IdataDatabaseQuery;

        if (queryRow) {
            resultObject.id = queryRow.id;
            resultObject.email = queryRow.email;
            resultObject.name = queryRow.name;
            resultObject.surname = queryRow.surname;
            resultObject.password = queryRow.password;
            resultObject.mcpSessionId = queryRow.mcp_session_id;
        }

        return resultObject;
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;

        this.database = new Database(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}sqlite/user.sqlite`);
    }

    tableCreate = async (): Promise<boolean> => {
        let isResult = false;

        this.database.exec(
            'CREATE TABLE IF NOT EXISTS "user" (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, surname TEXT NOT NULL, password TEXT NOT NULL, mcp_session_id TEXT UNIQUE);'
        );

        const fileReadStream = await helperSrc.fileReadStream(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}fixture/dev/user.json`);

        if (Buffer.isBuffer(fileReadStream)) {
            const userList = JSON.parse(fileReadStream.toString()) as modelUser.Idata[];

            if (userList.length > 0) {
                for (const user of userList) {
                    this.tableInsert(user.id, user.email, user.name, user.surname, user.password, user.mcpSessionId || "");
                }

                isResult = true;
            }
        }

        return isResult;
    };

    loginSessionVerify = (username: string, password: string): modelUser.IdataLoginSession => {
        const resultObject = {} as modelUser.IdataLoginSession;

        const user = this.tableSelect(username, "");

        if (user.id) {
            if (this.passwordVerify(password, user.password)) {
                if (user.mcpSessionId) {
                    resultObject.mcpSessionId = user.mcpSessionId;
                    resultObject.message = "";
                } else {
                    resultObject.mcpSessionId = helperSrc.generateUniqueId();
                    resultObject.message = "";

                    this.tableUpdate(user.id, user.name, user.surname, "", resultObject.mcpSessionId);
                }
            } else {
                resultObject.mcpSessionId = "";
                resultObject.message = "Incorrect password.";
            }
        } else {
            resultObject.mcpSessionId = "";
            resultObject.message = "Incorrect username.";
        }

        return resultObject;
    };

    api = (): void => {
        this.app.get("/api/user-info", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const user = this.tableSelect("", mcpSessionId);

                const resultObject = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    surname: user.surname
                };

                helperSrc.responseBody(JSON.stringify(resultObject), "", response, 200);
            } else {
                helperSrc.writeLog("User.ts - api() - get(/api/user-info) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/user-update", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelUser.IapiDataUpdateBody;

            const id = body.id;
            const name = body.name;
            const surname = body.surname;
            const password = body.password;

            if (typeof mcpSessionId === "string") {
                const isUpdate = this.tableUpdate(id, name, surname, password, mcpSessionId);

                if (isUpdate) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("User.ts - api() - post(/api/user-update) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
