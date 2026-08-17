import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import Pg from "pg";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as database from "../Database.js";
import * as modelAgent from "../model/Agent.js";

export default class Agent {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    // Method
    private checkField = (name: string, description: string, skillName: string): string[] => {
        const resultList: string[] = [];

        if (!/^[A-Za-z0-9_ ]+$/.test(name)) {
            resultList.push("Name: Can only contain letter, number, underscore and space.");
        }

        if (!/^[A-Za-z0-9_,. ]+$/.test(description)) {
            resultList.push("Description: Can only contain letter, number, underscore, comma, dot and space.");
        }

        if (skillName !== "" && !/^[A-Za-z0-9_]+$/.test(skillName)) {
            resultList.push("Skill name: Can only contain letter, number and underscore.");
        }

        return resultList;
    };

    private tableInsert = async (mcpSessionId: string, name: string, description: string, skillName: string): Promise<boolean> => {
        let isResult = false;

        if (mcpSessionId !== "") {
            isResult = await database.pool
                .query(`INSERT INTO "${mcpSessionId}_agent" (name, description, skill_name, delete) VALUES ($1, $2, $3, false);`, [
                    name,
                    description,
                    skillName
                ])
                .then(() => {
                    return true;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Agent.ts - tableInsert() - catch()", error.message);

                    return false;
                });
        }

        return isResult;
    };

    private tableUpdate = async (mcpSessionId: string, id: number, name: string, description: string, skillName: string): Promise<boolean> => {
        let isResult = false;

        if (mcpSessionId !== "") {
            isResult = await database.pool
                .query(`UPDATE "${mcpSessionId}_agent" SET name = $1, description = $2, skill_name = $3 WHERE id = $4;`, [
                    name,
                    description,
                    skillName,
                    id
                ])
                .then(() => {
                    return true;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Agent.ts - tableUpdate() - catch()", error.message);

                    return false;
                });
        }

        return isResult;
    };

    private tableSelect = async (mcpSessionId: string): Promise<modelAgent.Idata[]> => {
        let resultList: modelAgent.Idata[] = [];

        if (mcpSessionId !== "") {
            resultList = await database.pool
                .query(`SELECT id, name, description, skill_name FROM "${mcpSessionId}_agent" WHERE NOT delete ORDER BY id ASC;`)
                .then((queryResult: Pg.QueryResult<modelAgent.IdataDatabaseQuery>) => {
                    const dataList: modelAgent.Idata[] = [];

                    for (let a = 0; a < queryResult.rows.length; a++) {
                        const queryRow = queryResult.rows[a];

                        dataList.push({
                            id: queryRow.id,
                            name: queryRow.name,
                            description: queryRow.description,
                            skillName: queryRow.skill_name
                        });
                    }

                    return dataList;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Agent.ts - tableSelect() - catch()", error.message);

                    return [];
                });
        }

        return resultList;
    };

    private tableDelete = async (mcpSessionId: string, id: number): Promise<boolean> => {
        let isResult = false;

        if (mcpSessionId !== "") {
            isResult = await database.pool
                .query(`UPDATE "${mcpSessionId}_agent" SET delete = true WHERE id = $1;`, [id])
                .then(() => {
                    return true;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Agent.ts - tableDelete() - catch()", error.message);

                    return false;
                });
        }

        return isResult;
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;
    }

    tableCreate = async (mcpSessionId: string): Promise<boolean> => {
        let isResult = false;

        if (mcpSessionId !== "") {
            isResult = await database.pool
                .query(
                    `CREATE TABLE IF NOT EXISTS "${mcpSessionId}_agent" (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name TEXT NOT NULL, description TEXT, skill_name TEXT, delete BOOLEAN NOT NULL);`
                )
                .then(() => {
                    return true;
                })
                .catch((error: Error) => {
                    helperSrc.writeLog("Agent.ts - tableCreate() - catch()", error.message);

                    return false;
                });
        }

        return isResult;
    };

    api = (): void => {
        this.app.post("/api/agent-create", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiCreateBody;

            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-create) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const checkMessageList = this.checkField(name, description, skillName);

                if (checkMessageList.length > 0) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: checkMessageList }), "", response, 200);
                } else {
                    const isTableInsert = await this.tableInsert(mcpSessionId, name, description, skillName);

                    if (!isTableInsert) {
                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        helperSrc.responseBody(JSON.stringify({ state: "ok", message: "Agent created successfully." }), "", response, 200);
                    }
                }
            }
        });

        this.app.post("/api/agent-update", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiUpdateBody;

            const id = body.id;
            const name = body.name;
            const description = body.description;
            const skillName = body.skillName;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-update) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const checkMessageList = this.checkField(name, description, skillName);

                if (checkMessageList.length > 0) {
                    helperSrc.responseBody(JSON.stringify({ state: "ko", message: checkMessageList }), "", response, 200);
                } else {
                    const isTableUpdate = await this.tableUpdate(mcpSessionId, id, name, description, skillName);

                    if (!isTableUpdate) {
                        helperSrc.responseBody("", "ko", response, 500);
                    } else {
                        helperSrc.responseBody(JSON.stringify({ state: "ok", message: "Agent updated successfully." }), "", response, 200);
                    }
                }
            }
        });

        this.app.get("/api/agent-list", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Agent.ts - api() - get(/api/agent-list) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const agentList = await this.tableSelect(mcpSessionId);

                helperSrc.responseBody(JSON.stringify({ state: "ok", message: "", data: agentList }), "", response, 200);
            }
        });

        this.app.post("/api/agent-delete", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelAgent.IapiDeleteBody;

            const id = body.id;

            if (typeof mcpSessionId !== "string") {
                helperSrc.writeLog("Agent.ts - api() - post(/api/agent-delete) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            } else {
                const isTableDelete = await this.tableDelete(mcpSessionId, id);

                if (!isTableDelete) {
                    helperSrc.responseBody("", "ko", response, 500);
                } else {
                    helperSrc.responseBody("ok", "", response, 200);
                }
            }
        });
    };
}
