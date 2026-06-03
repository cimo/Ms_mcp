import { DatabaseSync } from "node:sqlite";

// Source
import * as modelAgent from "../model/Agent.js";

export default class Agent {
    // Variable
    private database: DatabaseSync;

    // Method
    constructor() {
        this.database = new DatabaseSync(":memory:");
    }

    tableCreate = (mcpSessionId: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.exec(`
                CREATE TABLE IF NOT EXISTS "${mcpSessionId}_agent" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    skill TEXT
                );
            `);

            isResult = true;
        }

        return isResult;
    };

    tableDrop = (mcpSessionId: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.exec(`DROP TABLE IF EXISTS "${mcpSessionId}_agent";`);

            isResult = true;
        }

        return isResult;
    };

    tableInsert = (mcpSessionId: string, name: string, description: string, skill: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            const queryRun = this.database
                .prepare(`INSERT INTO "${mcpSessionId}_agent" (name, description, skill) VALUES (?, ?, ?);`)
                .run(name, description, skill);

            if (queryRun && queryRun.changes > 0) {
                isResult = true;
            }
        }

        return isResult;
    };

    tableUpdate = (mcpSessionId: string, id: number, name: string, description: string, skill: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            const queryRun = this.database
                .prepare(`UPDATE "${mcpSessionId}_agent" SET name = ?, description = ?, skill = ? WHERE id = ?;`)
                .run(name, description, skill, id);

            if (queryRun && queryRun.changes > 0) {
                isResult = true;
            }
        }

        return isResult;
    };

    tableSelectList = (mcpSessionId: string): modelAgent.Iagent[] => {
        const resultList: modelAgent.Iagent[] = [];

        if (mcpSessionId !== "") {
            const queryList = this.database.prepare(`SELECT id, name, description, skill FROM "${mcpSessionId}_agent";`).all();

            for (let a = 0; a < queryList.length; a++) {
                const query = queryList[a];

                resultList.push({
                    id: query["id"] as number,
                    name: query["name"] as string,
                    description: query["description"] as string,
                    skill: query["skill"] as string
                });
            }
        }

        return resultList;
    };

    tableDelete = (mcpSessionId: string, id: number): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            const queryRun = this.database.prepare(`DELETE FROM "${mcpSessionId}_agent" WHERE id = ?;`).run(id);

            if (queryRun && queryRun.changes > 0) {
                isResult = true;
            }
        }

        return isResult;
    };
}
