import { DatabaseSync } from "node:sqlite";

// Source
import * as modelAgent from "../model/Agent.js";

export default class Agent {
    // Variable
    private databaseAgent: DatabaseSync;

    // Method
    constructor() {
        this.databaseAgent = new DatabaseSync(":memory:");
    }

    createTable = (sessionId: string): boolean => {
        if (sessionId !== "") {
            this.databaseAgent.exec(`
                CREATE TABLE IF NOT EXISTS "${sessionId}_agent" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    skill TEXT
                );
            `);

            return true;
        }

        return false;
    };

    insertAgent = (sessionId: string, name: string, description: string, skill: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryInsert = this.databaseAgent.prepare(`INSERT INTO "${sessionId}_agent" (name, description, skill) VALUES (?, ?, ?);`);
            const resultInsert = queryInsert.run(name, description, skill);

            if (resultInsert && resultInsert.changes > 0) {
                result = true;
            }
        }

        return result;
    };

    updateAgent = (sessionId: string, id: number, name: string, description: string, skill: string): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryUpdate = this.databaseAgent.prepare(`UPDATE "${sessionId}_agent" SET name = ?, description = ?, skill = ? WHERE id = ?;`);
            const resultUpdate = queryUpdate.run(name, description, skill, id);

            if (resultUpdate && resultUpdate.changes > 0) {
                result = true;
            }
        }

        return result;
    };

    selectAgentList = (sessionId: string): modelAgent.Iagent[] => {
        const result: modelAgent.Iagent[] = [];

        if (sessionId !== "") {
            const querySelect = this.databaseAgent.prepare(`SELECT id, name, description, skill FROM "${sessionId}_agent";`).all();

            for (const row of querySelect) {
                result.push({
                    id: row["id"] as number,
                    name: row["name"] as string,
                    description: row["description"] as string,
                    skill: row["skill"] as string
                });
            }
        }

        return result;
    };

    deleteAgent = (sessionId: string, id: number): boolean => {
        let result = false;

        if (sessionId !== "") {
            const queryDelete = this.databaseAgent.prepare(`DELETE FROM "${sessionId}_agent" WHERE id = ?;`);
            const resultDelete = queryDelete.run(id);

            if (resultDelete && resultDelete.changes > 0) {
                result = true;
            }
        }

        return result;
    };

    dropTable = (sessionId: string): boolean => {
        if (sessionId !== "") {
            this.databaseAgent.exec(`DROP TABLE IF EXISTS "${sessionId}_agent";`);

            return true;
        }

        return false;
    };
}
