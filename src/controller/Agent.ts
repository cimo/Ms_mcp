import Database from "better-sqlite3";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelAgent from "../model/Agent.js";

export default class Agent {
    // Variable
    private database: Database.Database;

    // Method
    constructor() {
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

    tableDrop = (mcpSessionId: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            this.database.exec(`DROP TABLE IF EXISTS "${mcpSessionId}_agent";`);

            isResult = true;
        }

        return isResult;
    };

    tableInsert = (mcpSessionId: string, name: string, description: string, skillName: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            const queryRun = this.database
                .prepare(`INSERT INTO "${mcpSessionId}_agent" (name, description, skill_name) VALUES (?, ?, ?);`)
                .run(name, description, skillName);

            if (queryRun && queryRun.changes > 0) {
                isResult = true;
            }
        }

        return isResult;
    };

    tableUpdate = (mcpSessionId: string, id: number, name: string, description: string, skillName: string): boolean => {
        let isResult = false;

        if (mcpSessionId !== "") {
            const queryRun = this.database
                .prepare(`UPDATE "${mcpSessionId}_agent" SET name = ?, description = ?, skill_name = ? WHERE id = ?;`)
                .run(name, description, skillName, id);

            if (queryRun && queryRun.changes > 0) {
                isResult = true;
            }
        }

        return isResult;
    };

    tableSelectList = (mcpSessionId: string): modelAgent.Iagent[] => {
        const resultList: modelAgent.Iagent[] = [];

        if (mcpSessionId !== "") {
            const queryList = this.database
                .prepare(`SELECT id, name, description, skill_name FROM "${mcpSessionId}_agent";`)
                .all() as unknown as modelAgent.IdatabaseQueryAgent[];

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
