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

    tableCreate = (sessionId: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            this.database.exec(`
                CREATE TABLE IF NOT EXISTS "${sessionId}_agent" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    skill TEXT
                );
            `);

            result = true;
        }

        return result;
    };

    tableDrop = (sessionId: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            this.database.exec(`DROP TABLE IF EXISTS "${sessionId}_agent";`);

            result = true;
        }

        return result;
    };

    tableInsert = (sessionId: string, name: string, description: string, skill: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryRun = this.database
                .prepare(`INSERT INTO "${sessionId}_agent" (name, description, skill) VALUES (?, ?, ?);`)
                .run(name, description, skill);

            if (queryRun && queryRun.changes > 0) {
                result = true;
            }
        }

        return result;
    };

    tableUpdate = (sessionId: string, id: number, name: string, description: string, skill: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryRun = this.database
                .prepare(`UPDATE "${sessionId}_agent" SET name = ?, description = ?, skill = ? WHERE id = ?;`)
                .run(name, description, skill, id);

            if (queryRun && queryRun.changes > 0) {
                result = true;
            }
        }

        return result;
    };

    tableSelectList = (sessionId: string): modelAgent.Iagent[] => {
        const resultList: modelAgent.Iagent[] = [];

        if (sessionId !== "") {
            const queryList = this.database.prepare(`SELECT id, name, description, skill FROM "${sessionId}_agent";`).all();

            for (const query of queryList) {
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

    tableDelete = (sessionId: string, id: number): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryRun = this.database.prepare(`DELETE FROM "${sessionId}_agent" WHERE id = ?;`).run(id);

            if (queryRun && queryRun.changes > 0) {
                result = true;
            }
        }

        return result;
    };
}
