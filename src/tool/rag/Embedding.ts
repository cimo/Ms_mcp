import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: DatabaseSync | undefined = undefined;
const chunkLength = 400;

// Method
const login = async (uniqueId: string): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const embedding = async (uniqueId: string, text: string | string[]): Promise<modelRag.IapiEmbedding[]> => {
    return instance.api
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
            const stdout = JSON.parse(resultApi.data.response.stdout);

            return stdout.data as modelRag.IapiEmbedding[];
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - embedding() - catch()", error.message);

            return [];
        });
};

const graphifyExtract = async (uniqueId: string, text: string): Promise<modelRag.IapiExtract> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>(
            "/api/ragGraphifyExtract",
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
            const stdout = JSON.parse(resultApi.data.response.stdout) as modelRag.IapiExtract;

            return stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Embedding.ts - graphifyExtract() - api(/api/ragGraphifyExtract) - catch()", error.message);

            return {} as modelRag.IapiExtract;
        });
};

const logout = async (uniqueId: string): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

const tableNameReplace = (name: string): string => {
    return name.replace(/"/g, '""');
};

const tableCitationCreate = (mcpSessionId: string, fileName: string): boolean => {
    let isResult = false;

    const tableName = tableNameReplace(`${mcpSessionId}_${fileName}`);

    if (database) {
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}" USING vec0(id INTEGER PRIMARY KEY, chunk TEXT NOT NULL, embedding float[768])`
        );

        isResult = true;
    }

    return isResult;
};

const tableCitationSelectList = (mcpSessionId: string): string[] => {
    const resultList: string[] = [];

    if (!database) {
        return resultList;
    }

    const queryList = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ? ESCAPE '\\' AND sql LIKE 'CREATE VIRTUAL TABLE%USING vec0%'")
        .all(`${mcpSessionId}_%`);

    for (let a = 0; a < queryList.length; a++) {
        const query = queryList[a];

        const tableName = tableNameReplace(query["name"] as string);

        resultList.push(tableName);
    }

    return resultList;
};

const tableCitationInsert = (mcpSessionId: string, fileName: string, chunk: string, embedding: number[]): boolean => {
    let isResult = false;

    const tableName = tableNameReplace(`${mcpSessionId}_${fileName}`);

    if (database) {
        database
            .prepare(`INSERT INTO "${tableName}" (chunk, embedding) VALUES (?, ?)`)
            .run(chunk, new Uint8Array(new Float32Array(embedding).buffer));

        isResult = true;
    }

    return isResult;
};

const tableRelationInsert = (mcpSessionId: string, source: string, verb: string, target: string): boolean => {
    let isResult = false;

    if (database) {
        database.prepare("INSERT INTO relation (session_id, source, verb, target) VALUES (?, ?, ?, ?)").run(mcpSessionId, source, verb, target);

        isResult = true;
    }

    return isResult;
};

const tableRelationSearch = (mcpSessionId: string, query: string): modelRag.Irelation[] => {
    if (!database) {
        return [];
    }

    const termRawList = query.split(/\s+/);
    const termList: string[] = [];

    for (let a = 0; a < termRawList.length; a++) {
        const term = termRawList[a].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

        if (term.length > 2) {
            termList.push(term);
        }
    }

    const resultObject: Record<string, modelRag.Irelation> = {};

    for (let a = 0; a < termList.length; a++) {
        const term = termList[a];

        const queryList = database
            .prepare("SELECT source, verb, target FROM relation WHERE session_id = ? AND (LOWER(source) LIKE ? OR LOWER(target) LIKE ?)")
            .all(mcpSessionId, `%${term}%`, `%${term}%`);

        for (let b = 0; b < queryList.length; b++) {
            const query = queryList[b];

            const key = `${query["source"]}|${query["verb"]}|${query["target"]}`;

            if (!resultObject[key]) {
                resultObject[key] = {
                    source: query["source"] as string,
                    verb: query["verb"] as string,
                    target: query["target"] as string
                };
            }
        }
    }

    return Object.values(resultObject);
};

export const databaseCreate = (): boolean => {
    let isResult = false;

    database = new DatabaseSync(":memory:", { allowExtension: true });
    sqliteVec.load(database);

    const queryRow = database.prepare("SELECT sqlite_version() AS sqlite_version, vec_version() AS vec_version;").get();

    if (queryRow) {
        helperSrc.writeLog("Rag.ts - databaseCreate()", `Sqlite version: ${queryRow["sqlite_version"]} - Vec version: ${queryRow["vec_version"]}`);

        isResult = true;
    }

    database.exec(`CREATE TABLE IF NOT EXISTS relation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        verb TEXT NOT NULL,
        target TEXT NOT NULL
    )`);

    return isResult;
};

export const databaseStore = (mcpSessionId: string, uniqueId: string, fileName: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "ko";

        await login(uniqueId);

        tableCitationCreate(mcpSessionId, fileName);

        const fileDetail = helperSrc.fileDetail(fileName);

        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        const resultFileReadStream = await helperSrc.fileReadStream(`${inputFolder}result.md`);

        if (Buffer.isBuffer(resultFileReadStream)) {
            const text = resultFileReadStream.toString();

            for (let a = 0; a < text.length; a += chunkLength) {
                const chunk = text.slice(a, a + chunkLength);

                const data = await embedding(uniqueId, chunk);

                if (data.length > 0 && data[0].embedding.length > 0) {
                    tableCitationInsert(mcpSessionId, fileName, chunk, data[0].embedding);

                    const graphData = await graphifyExtract(uniqueId, chunk);

                    if (Array.isArray(graphData.relationList)) {
                        for (let b = 0; b < graphData.relationList.length; b++) {
                            const graphRelation = graphData.relationList[b];

                            tableRelationInsert(mcpSessionId, graphRelation.source, graphRelation.verb, graphRelation.target);
                        }
                    }

                    result = "ok";
                }
            }
        } else {
            helperSrc.writeLog("Embedding.ts - databaseStore() - fileReadStream()", resultFileReadStream.toString());
        }

        if (result === "ok") {
            const fileWriteStreamDone = await helperSrc.fileWriteStream(`${inputFolder}.done`, Buffer.from(""));

            if (typeof fileWriteStreamDone !== "boolean") {
                helperSrc.writeLog("Embedding.ts - databaseStore() - fileWriteStream(.done)", fileWriteStreamDone.toString());
            }
        } else {
            const fileWriteStreamFail = await helperSrc.fileWriteStream(`${inputFolder}.fail`, Buffer.from(""));

            if (typeof fileWriteStreamFail !== "boolean") {
                helperSrc.writeLog("Embedding.ts - databaseStore() - fileWriteStream(.fail)", fileWriteStreamFail.toString());
            }
        }

        await logout(uniqueId);

        return result;
    });
};

export const databaseSearch = (mcpSessionId: string, uniqueId: string, prompt: string): Promise<string> => {
    return instance.runWithContext(async () => {
        await login(uniqueId);

        const citationList: modelRag.Icitation[] = [];

        const data = await embedding(uniqueId, prompt);

        if (data.length > 0 && data[0].embedding.length > 0) {
            const buffer = new Uint8Array(new Float32Array(data[0].embedding).buffer);

            if (database) {
                const tableList = tableCitationSelectList(mcpSessionId);
                const sessionPrefix = `${mcpSessionId}_`;
                const totalLimit = Math.max(6, tableList.length);
                const limitPerTable = Math.max(2, Math.ceil(totalLimit / Math.max(1, tableList.length)));

                let citationCleanedList: modelRag.Icitation[] = [];

                for (let a = 0; a < tableList.length; a++) {
                    const table = tableList[a];

                    const queryList = database
                        .prepare(`SELECT chunk, distance FROM "${table}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${limitPerTable}`)
                        .all(buffer);

                    for (let b = 0; b < queryList.length; b++) {
                        const query = queryList[b];

                        if (query["chunk"]) {
                            citationCleanedList.push({
                                fileName: table.startsWith(sessionPrefix) ? table.slice(sessionPrefix.length) : table,
                                chunk: query["chunk"] as string,
                                distance: query["distance"] as number
                            });
                        }
                    }
                }

                const termRawList = prompt.split(/\s+/);
                const termCandidateList: string[] = [];

                for (let a = 0; a < termRawList.length; a++) {
                    const term = termRawList[a].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

                    if (term.length > 1) {
                        termCandidateList.push(term);
                    }
                }

                let termList = termCandidateList;

                if (termCandidateList.length > 0 && citationCleanedList.length >= 6) {
                    const termFilteredList = [];

                    for (let a = 0; a < termCandidateList.length; a++) {
                        let documentCount = 0;

                        for (let b = 0; b < citationCleanedList.length; b++) {
                            if (citationCleanedList[b].chunk.toLowerCase().includes(termCandidateList[a])) {
                                documentCount++;
                            }
                        }

                        if (documentCount / citationCleanedList.length < 0.7) {
                            termFilteredList.push(termCandidateList[a]);
                        }
                    }

                    if (termFilteredList.length > 0) {
                        termList = termFilteredList;
                    }
                }

                if (termList.length > 0) {
                    const citationFilteredList = [];

                    for (let a = 0; a < citationCleanedList.length; a++) {
                        const chunkLower = citationCleanedList[a].chunk.toLowerCase();

                        for (let b = 0; b < termList.length; b++) {
                            if (chunkLower.includes(termList[b])) {
                                citationFilteredList.push(citationCleanedList[a]);

                                break;
                            }
                        }
                    }

                    citationCleanedList = citationFilteredList;
                }

                citationCleanedList = citationCleanedList
                    .sort((a, b) => {
                        const distanceOne = a.distance;
                        const distanceTwo = b.distance;

                        return distanceOne - distanceTwo;
                    })
                    .slice(0, totalLimit);

                for (let a = 0; a < citationCleanedList.length; a++) {
                    const citation = citationCleanedList[a];

                    citationList.push({
                        fileName: citation.fileName,
                        chunk: citation.chunk,
                        distance: citation.distance
                    });
                }
            }
        }

        await logout(uniqueId);

        return JSON.stringify({ citationList, relationList: tableRelationSearch(mcpSessionId, prompt) });
    });
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    let result = "ko";

    if (database) {
        if (fileName === "") {
            let query = "";

            const tableList = tableCitationSelectList(mcpSessionId);

            for (let a = 0; a < tableList.length; a++) {
                const sql = `DROP TABLE IF EXISTS "${tableList[a]}"`;

                query += a === 0 ? sql : `;${sql}`;
            }

            if (query) {
                database.exec(query);
            }

            database.prepare("DELETE FROM relation WHERE session_id = ?").run(mcpSessionId);
        } else {
            const tableName = tableNameReplace(`${mcpSessionId}_${fileName}`);

            database.exec(`DROP TABLE IF EXISTS "${tableName}"`);
        }

        result = "ok";
    }

    return result;
};
