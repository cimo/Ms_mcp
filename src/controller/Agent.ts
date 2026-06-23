import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import Database from "better-sqlite3";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelAgent from "../model/Agent.js";

export default class Agent {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    private database: Database.Database;

    // Method
    private tableInsert = (mcpSessionId: string, name: string, description: string, skillName: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database
                .prepare(`INSERT INTO "${mcpSessionId}_agent" (name, description, skill_name) VALUES (?, ?, ?);`)
                .run(name, description, skillName);

            isResult = true;
        }

        return isResult;
    };

    private tableUpdate = (mcpSessionId: string, id: number, name: string, description: string, skillName: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database
                .prepare(`UPDATE "${mcpSessionId}_agent" SET name = ?, description = ?, skill_name = ? WHERE id = ?;`)
                .run(name, description, skillName, id);

            isResult = true;
        }

        return isResult;
    };

    private tableSelectList = (mcpSessionId: string): modelAgent.Idata[] => {
        const resultList: modelAgent.Idata[] = [];

        if (mcpSessionId !== "") {
            const queryList = this.database
                .prepare(`SELECT id, name, description, skill_name FROM "${mcpSessionId}_agent";`)
                .all() as unknown as modelAgent.IdataDatabaseQuery[];

            for (let a = 0; a < queryList.length; a++) {
                const query = queryList[a];

                resultList.push({
                    id: query.id,
                    name: query.name,
                    description: query.description,
                    skillName: query.skill_name
                });
            }
        }

        return resultList;
    };

    private tableDelete = (mcpSessionId: string, id: number): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.prepare(`DELETE FROM "${mcpSessionId}_agent" WHERE id = ?;`).run(id);

            isResult = true;
        }

        return isResult;
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;

        this.database = new Database(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}sqlite/agent.sqlite`);
    }

    tableCreate = (mcpSessionId: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.exec(`
                CREATE TABLE IF NOT EXISTS "${mcpSessionId}_agent" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    skill_name TEXT
                );
            `);

            isResult = true;
        }

        return isResult;
    };

    api = (): void => {
        this.app.post("/api/agent-create", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiDataCreateBody;

            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId === "string") {
                const isInsert = this.tableInsert(mcpSessionId, name, description, skillName);

                if (isInsert) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("", "ko", response, 500);
                }
            } else {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/agent-update", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiDataUpdateBody;

            const id = body.id;
            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId === "string") {
                const isUpdate = this.tableUpdate(mcpSessionId, id, name, description, skillName);

                if (isUpdate) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-update) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.get("/api/agent-list", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const resultList = this.tableSelectList(mcpSessionId);

                helperSrc.responseBody(JSON.stringify(resultList), "", response, 200);
            } else {
                helperSrc.writeLog("Agent.ts - api() - get(/api/agent-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/agent-delete", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiDataDeleteBody;

            const id = body.id;

            if (typeof mcpSessionId === "string") {
                const isDelete = this.tableDelete(mcpSessionId, id);

                if (isDelete) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
