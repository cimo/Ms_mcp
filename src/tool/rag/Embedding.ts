import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";
import * as semantic from "./Semantic.js";
import * as svg from "../document/Svg.js";

let db: DatabaseSync | null = null;

// Method
const login = async (uniqueId: string): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            result = JSON.stringify(resultApi.data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - login() - api(/login) - catch()", error.message);

            result = "ko";
        });

    return result;
};

const embedding = async (uniqueId: string, text: string | string[]): Promise<modelRag.IapiEmbeddingData[]> => {
    let result: modelRag.IapiEmbeddingData[] = [];

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
        .then((resultApi) => {
            result = JSON.parse(resultApi.data.response.stdout).data as modelRag.IapiEmbeddingData[];
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - embedding() - catch()", error.message);
        });

    return result;
};

const tableName = (sessionId: string, fileName: string): string => {
    return `${sessionId}_${fileName}`.replace(/"/g, '""');
};

const tableNameList = (sessionId: string): string[] => {
    if (!db) {
        return [];
    }

    const escapedSessionId = sessionId.replace(/[\\%_]/g, "\\$&");
    const query = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ? ESCAPE '\\' AND sql LIKE 'CREATE VIRTUAL TABLE%USING vec0%'"
    );
    const rowList = query.all(`${escapedSessionId}_%`);

    const tableList = [];
    for (const row of rowList) {
        tableList.push(String(row["name"] ?? "").replace(/"/g, '""'));
    }

    return tableList;
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
            result = JSON.stringify(resultApi.data, null, 2);
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

export const store = async (sessionId: string, uniqueId: string, fileName: string, fileContent: string): Promise<void> => {
    await instance.runWithContext(async () => {
        await login(uniqueId);

        const table = tableName(sessionId, fileName);

        await createTable(table);

        const chunkList = semantic.chunkList(fileContent, {
            maxChars: 300,
            overlapSentences: 1
        });

        for (let chunk of chunkList) {
            const data = await embedding(uniqueId, chunk);

            if (data.length > 0 && data[0].embedding.length > 0) {
                insert(table, chunk, data[0].embedding);
            }
        }

        await logout(uniqueId);
    });
};

export const searchDatabase = async (sessionId: string, uniqueId: string, fileName: string, input: string): Promise<string> => {
    return await instance.runWithContext(async () => {
        const resultObject: modelRag.IapiRagResult = {
            type: "citation",
            resultList: [] as modelRag.IapiRag[]
        };

        await login(uniqueId);

        const data = await embedding(uniqueId, input);

        const queryBlob = new Uint8Array(new Float32Array(data[0].embedding).buffer);

        if (db) {
            if (fileName.trim().toLowerCase() === "all") {
                const tableList = tableNameList(sessionId);
                const sessionPrefix = `${sessionId}_`;

                let citationList: modelRag.IapiCitation[] = [];

                for (const table of tableList) {
                    const querySelect = db
                        .prepare(`SELECT chunk, distance FROM "${table}" WHERE embedding MATCH ? ORDER BY distance LIMIT 5`)
                        .all(queryBlob);

                    const sourceFileName = table.startsWith(sessionPrefix) ? table.slice(sessionPrefix.length) : table;

                    for (const row of querySelect) {
                        if (row["chunk"]) {
                            citationList.push({
                                fileName: sourceFileName,
                                citation: row["chunk"] as string,
                                distance: Number(row["distance"] ?? Number.POSITIVE_INFINITY)
                            });
                        }
                    }
                }

                citationList = citationList
                    .sort((first, second) => {
                        const firstDistance = first.distance ?? Number.POSITIVE_INFINITY;
                        const secondDistance = second.distance ?? Number.POSITIVE_INFINITY;

                        return firstDistance - secondDistance;
                    })
                    .slice(0, 5);

                const resultList: modelRag.IapiRag[] = [];
                for (const citation of citationList) {
                    resultList.push({
                        fileName: citation.fileName,
                        citation: citation.citation
                    });
                }

                resultObject.resultList = resultList;
            } else {
                const querySelect = db
                    .prepare(`SELECT chunk FROM "${tableName(sessionId, fileName)}" WHERE embedding MATCH ? ORDER BY distance LIMIT 5`)
                    .all(queryBlob);

                const resultList: modelRag.IapiRag[] = [];
                for (const row of querySelect) {
                    if (row["chunk"]) {
                        resultList.push({
                            fileName,
                            citation: row["chunk"] as string
                        } as modelRag.IapiRag);
                    }
                }
                resultObject.resultList = resultList;
            }
        }

        await logout(uniqueId);

        return JSON.stringify(resultObject);
    });
};

export const searchDocument = (sessionId: string, fileName: string, searchInput: string): modelRag.IapiRag => {
    const baseFileName = helperSrc.baseFileName(fileName);
    const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

    return svg.convert(inputFolder, fileName, searchInput);
};

export const drop = async (sessionId: string, fileName: string): Promise<void> => {
    if (!db) {
        return;
    }

    let dropSql = "";

    if (fileName === "") {
        const tableList = tableNameList(sessionId);

        for (let index = 0; index < tableList.length; index++) {
            const tableName = tableList[index];
            const sql = `DROP TABLE IF EXISTS "${tableName}"`;

            dropSql += index === 0 ? sql : `;${sql}`;
        }
    } else {
        dropSql = `DROP TABLE IF EXISTS "${tableName(sessionId, fileName)}"`;
    }

    db.exec(dropSql);
};
