import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as model from "./Model.js";

let db: DatabaseSync | null = null;

// Method
const login = async (uniqueId: string): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>(
            "/login",
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${uniqueId}`
                }
            },
            true
        )
        .then((resultApi) => {
            result = JSON.stringify(resultApi, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - login() - api(/login) - catch()", error.message);

            result = "ko";
        });

    return result;
};

const embedding = async (uniqueId: string, text: string | string[]): Promise<model.IapiEmbeddingData[]> => {
    let result: model.IapiEmbeddingData[] = [];

    await instance.api
        .post<modelHelperSrc.IresponseBody>(
            "/api/embedding",
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${uniqueId}`
                }
            },
            {
                input: text
            }
        )
        .then((resultEmbedding) => {
            result = JSON.parse(resultEmbedding.response.stdout) as model.IapiEmbeddingData[];
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - embedding() - catch()", error.message);
        });

    return result;
};

const createTable = async (tableName: string): Promise<void> => {
    if (db) {
        db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}" USING vec0(id INTEGER PRIMARY KEY, chunk TEXT NOT NULL, embedding float[768])`);
    }
};

const insert = (tableName: string, chunk: string, embedding: number[]): void => {
    if (db) {
        const insertEmbedding = db.prepare(`INSERT INTO "${tableName}" (chunk, embedding) VALUES (?, ?)`);

        insertEmbedding.run(chunk, new Uint8Array(new Float32Array(embedding).buffer));
    }
};

const chunkLength = async (tableName: string, uniqueId: string, text: string): Promise<void> => {
    const chunkLength = 2000;

    for (let a = 0; a < text.length; a += chunkLength) {
        const chunk = text.substring(a, a + chunkLength);

        const data = await embedding(uniqueId, chunk);

        if (data[0].embedding.length > 0) {
            insert(tableName, chunk, data[0].embedding);
        }
    }
};

const logout = async (uniqueId: string): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            result = JSON.stringify(resultApi, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - logout() - api(/logout) - catch()", error.message);

            result = "ko";
        });

    return result;
};

export const createDatabase = (): void => {
    db = new DatabaseSync(":memory:", { allowExtension: true });
    sqliteVec.load(db);

    const row = db.prepare("SELECT sqlite_version() AS sqlite_version, vec_version() AS vec_version;").get();

    if (row) {
        helperSrc.writeLog("Rag.ts - createDatabase()", `Sqlite version: ${row["sqlite_version"]} - Vec version: ${row["vec_version"]}`);
    }
};

export const store = async (tableName: string, uniqueId: string, text: string): Promise<void> => {
    await instance.runWithContext(async () => {
        await login(uniqueId);

        await createTable(tableName);

        await chunkLength(tableName, uniqueId, text);

        await logout(uniqueId);
    });
};

export const search = async (tableName: string, uniqueId: string, input: string): Promise<string> => {
    return await instance.runWithContext(async () => {
        const resultObject: Record<string, string> = {};

        await login(uniqueId);

        const data = await embedding(uniqueId, input);

        const queryBlob = new Uint8Array(new Float32Array(data[0].embedding).buffer);

        if (db) {
            const querySelect = db.prepare(`SELECT chunk FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT 5`).all(queryBlob);

            let counter = 0;
            for (const row of querySelect) {
                if (row["chunk"]) {
                    counter++;

                    resultObject[`citation ${counter}`] = row["chunk"] as string;
                }
            }
        }

        await logout(uniqueId);

        return JSON.stringify(resultObject);
    });
};
