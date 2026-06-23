import Express, { Request, Response } from "express";
import { RateLimitRequestHandler } from "express-rate-limit";
import Database from "better-sqlite3";
import { Ca } from "@cimo/authentication/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelSetting from "../model/Setting.js";

export default class Setting {
    // Variable
    private app: Express.Express;
    private limiter: RateLimitRequestHandler;

    private database: Database.Database;

    // Method
    private tableInsert = (mcpSessionId: string, id: number, apiId: number): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.prepare(`INSERT OR IGNORE INTO "${mcpSessionId}_setting" (id, api_id) VALUES (?, ?);`).run(id, apiId);

            isResult = true;
        }

        return isResult;
    };

    private tableUpdate = (mcpSessionId: string, id: number, apiId: number): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.prepare(`UPDATE "${mcpSessionId}_setting" SET api_id = ? WHERE id = ?;`).run(apiId, id);

            isResult = true;
        }

        return isResult;
    };

    private tableSelect = (mcpSessionId: string): modelSetting.Idata => {
        const resultObject = {} as modelSetting.Idata;

        if (mcpSessionId !== "") {
            const queryRow = this.database
                .prepare(`SELECT id, api_id FROM "${mcpSessionId}_setting" WHERE id = 1;`)
                .get() as unknown as modelSetting.IdataDatabaseQuery;

            if (queryRow) {
                resultObject.id = queryRow.id;
                resultObject.apiId = queryRow.api_id;
            }
        }

        return resultObject;
    };

    constructor(app: Express.Express, limiter: RateLimitRequestHandler) {
        this.app = app;
        this.limiter = limiter;

        this.database = new Database(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}sqlite/setting.sqlite`);
    }

    tableCreate = async (mcpSessionId: string): Promise<boolean> => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.exec(`
                CREATE TABLE IF NOT EXISTS "${mcpSessionId}_setting" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    api_id INTEGER NOT NULL
                );
            `);

            const fileReadStream = await helperSrc.fileReadStream(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}fixture/dev/setting.json`);

            if (Buffer.isBuffer(fileReadStream)) {
                const fileReadStreamContent = fileReadStream.toString();

                const settingList = JSON.parse(fileReadStreamContent) as modelSetting.Idata[];

                if (settingList.length > 0) {
                    for (const setting of settingList) {
                        this.tableInsert(mcpSessionId, setting.id, setting.apiId);
                    }

                    isResult = true;
                }
            }
        }

        return isResult;
    };

    api = (): void => {
        this.app.get("/api/setting-info", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];

            if (typeof mcpSessionId === "string") {
                const setting = this.tableSelect(mcpSessionId);

                const resultObject = {
                    id: setting.id,
                    apiId: setting.apiId
                };

                helperSrc.responseBody(JSON.stringify(resultObject), "", response, 200);
            } else {
                helperSrc.writeLog("Setting.ts - api() - get(/api/setting-info) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });

        this.app.post("/api/setting-update", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
            const mcpSessionId = request.headers["mcp-session-id"];
            const body = request.body as modelSetting.IapiDataUpdateBody;

            const id = body.id;
            const apiId = body.apiId;

            if (typeof mcpSessionId === "string") {
                const isUpdate = this.tableUpdate(mcpSessionId, id, apiId);

                if (isUpdate) {
                    helperSrc.responseBody("ok", "", response, 200);
                } else {
                    helperSrc.responseBody("ko", "", response, 200);
                }
            } else {
                helperSrc.writeLog("Setting.ts - api() - post(/api/setting-update) - Error", "Missing or invalid header.");

                helperSrc.responseBody("", "ko", response, 500);
            }
        });
    };
}
