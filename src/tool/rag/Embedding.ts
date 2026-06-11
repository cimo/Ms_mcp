import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: DatabaseSync | undefined = undefined;
const chunkLength = 400;
const batchLength = 32;
const vectorDimension = 768;
const vectorChunkSize = 512;
const distanceMargin = 0.13;
const distanceMax = 1.07;
const citationLimit = 6;
const relationLimit = 20;

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

const embedding = async (uniqueId: string, mode: "document" | "query", text: string | string[]): Promise<modelRag.IapiEmbedding> => {
    let inputList: string[] = [];

    if (Array.isArray(text)) {
        inputList = text;
    } else {
        inputList = [text];
    }

    const inputPrefixList: string[] = [];

    for (let a = 0; a < inputList.length; a++) {
        if (mode === "document") {
            inputPrefixList.push(`title: none | text: ${inputList[a]}`);
        } else {
            inputPrefixList.push(`task: search result | query: ${inputList[a]}`);
        }
    }

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
                input: inputPrefixList
            }
        )
        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout) as modelRag.IapiEmbedding;

            return stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Rag.ts - embedding() - catch()", error.message);

            return {} as modelRag.IapiEmbedding;
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
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout) as modelRag.IapiExtract;

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

const tableFileCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_file`);

    if (database) {
        database.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )`);

        isResult = true;
    }

    return isResult;
};

const tableFileInsert = (mcpSessionId: string, fileName: string): number => {
    let result = 0;

    const name = tableNameReplace(`${mcpSessionId}_rag_file`);

    if (database) {
        const runPrepare = database.prepare(`INSERT OR IGNORE INTO "${name}" (name) VALUES (?)`).run(fileName);

        result = Number(runPrepare.lastInsertRowid);
    }

    return result;
};

const tableFileSelect = (mcpSessionId: string, fileName: string): number => {
    let result = 0;

    const name = tableNameReplace(`${mcpSessionId}_rag_file`);

    if (database) {
        const queryRow = database.prepare(`SELECT id FROM "${name}" WHERE name = ?`).get(fileName);

        if (queryRow) {
            result = queryRow["id"] as number;
        }
    }

    return result;
};

const tableCitationCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag`);

    if (database) {
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING vec0(id INTEGER PRIMARY KEY, embedding float[${vectorDimension}], file_id INTEGER PARTITION KEY, +chunk TEXT NOT NULL, chunk_size=${vectorChunkSize})`
        );

        isResult = true;
    }

    return isResult;
};

const tableCitationInsert = (mcpSessionId: string, fileId: number, chunk: string, embedding: number[]): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${name}" (embedding, file_id, chunk) VALUES (?, CAST(? AS INTEGER), ?)`)
            .run(new Uint8Array(new Float32Array(embedding).buffer), fileId, chunk);

        isResult = true;
    }

    return isResult;
};

const tableRelationCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_relation`);

    if (database) {
        database.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            verb TEXT NOT NULL,
            target TEXT NOT NULL
        )`);

        isResult = true;
    }

    return isResult;
};

const tableRelationInsert = (mcpSessionId: string, fileId: number, source: string, verb: string, target: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_relation`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${name}" (file_id, source, verb, target) VALUES (CAST(? AS INTEGER), ?, ?, ?)`)
            .run(fileId, source, verb, target);

        isResult = true;
    }

    return isResult;
};

const tableRelationSelect = (mcpSessionId: string, query: string): modelRag.Irelation[] => {
    const resultList: modelRag.Irelation[] = [];

    const termList: string[] = [];

    const querySplit = query.split(/\s+/);

    for (let a = 0; a < querySplit.length; a++) {
        const word = querySplit[a].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

        if (word.length > 2) {
            termList.push(word);
        }
    }

    if (database && termList.length > 0) {
        const tableName = tableNameReplace(`${mcpSessionId}_rag_relation`);

        const conditionList: string[] = [];
        const parameterList: string[] = [];

        for (let a = 0; a < termList.length; a++) {
            conditionList.push("(LOWER(source) LIKE ? OR LOWER(target) LIKE ?)");

            parameterList.push(`%${termList[a]}%`, `%${termList[a]}%`);
        }

        const queryList = database
            .prepare(`SELECT DISTINCT source, verb, target FROM "${tableName}" WHERE ${conditionList.join(" OR ")} LIMIT ${relationLimit}`)
            .all(...parameterList);

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            resultList.push({
                source: query["source"] as string,
                verb: query["verb"] as string,
                target: query["target"] as string
            });
        }
    }

    return resultList;
};

const chunkCreate = (text: string): string[] => {
    const resultList: string[] = [];

    let chunkText = "";

    const textSplit = text.split(/\s+/);

    for (let a = 0; a < textSplit.length; a++) {
        const word = textSplit[a];

        if (word !== "") {
            if (chunkText === "") {
                chunkText = word;
            } else if (chunkText.length + word.length + 1 > chunkLength) {
                resultList.push(chunkText);

                chunkText = word;
            } else {
                chunkText = `${chunkText} ${word}`;
            }
        }
    }

    if (chunkText !== "") {
        resultList.push(chunkText);
    }

    return resultList;
};

const chunk = (fileList: modelRag.Ifile[], tableNameRag: string, limit: number, buffer: Uint8Array<ArrayBuffer>): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (database) {
        const fileNameObject = {} as Record<number, string>;

        for (let a = 0; a < fileList.length; a++) {
            fileNameObject[fileList[a].id] = fileList[a].name;
        }

        const queryList = database
            .prepare(`SELECT chunk, file_id, distance FROM "${tableNameRag}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${limit}`)
            .all(buffer);

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            if (query["chunk"] && fileNameObject[query["file_id"] as number]) {
                resultList.push({
                    fileName: fileNameObject[query["file_id"] as number],
                    chunk: query["chunk"] as string,
                    distance: query["distance"] as number
                });
            }
        }
    }

    return resultList;
};

export const databaseCreate = (): boolean => {
    let isResult = false;

    database = new DatabaseSync(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}sqlite/rag.sqlite`, { allowExtension: true });
    sqliteVec.load(database);

    const queryRow = database.prepare("SELECT sqlite_version() AS sqlite_version, vec_version() AS vec_version;").get();

    if (queryRow) {
        helperSrc.writeLog("Rag.ts - databaseCreate()", `Sqlite version: ${queryRow["sqlite_version"]} - Vec version: ${queryRow["vec_version"]}`);

        isResult = true;
    }

    return isResult;
};

export const databaseStore = (mcpSessionId: string, uniqueId: string, fileName: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "ko";

        const fileIdStored = tableFileSelect(mcpSessionId, fileName);

        if (fileIdStored > 0) {
            result = "ok";
        } else {
            const fileId = tableFileInsert(mcpSessionId, fileName);

            await login(uniqueId);

            const fileDetail = helperSrc.fileDetail(fileName);

            const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

            const fileReadStream = await helperSrc.fileReadStream(`${inputFolder}result.md`);

            if (Buffer.isBuffer(fileReadStream)) {
                const fileReadStreamContent = fileReadStream.toString();

                const chunkList = chunkCreate(fileReadStreamContent);

                result = "ok";

                for (let a = 0; a < chunkList.length; a += batchLength) {
                    const chunkBatchList = chunkList.slice(a, a + batchLength);

                    const embeddingData = await embedding(uniqueId, "document", chunkBatchList);

                    if (Array.isArray(embeddingData.data) && embeddingData.data.length === chunkBatchList.length) {
                        for (let b = 0; b < chunkBatchList.length; b++) {
                            tableCitationInsert(mcpSessionId, fileId, chunkBatchList[b], embeddingData.data[b].embedding);

                            const graphData = await graphifyExtract(uniqueId, chunkBatchList[b]);

                            if (Array.isArray(graphData.relationList)) {
                                for (let c = 0; c < graphData.relationList.length; c++) {
                                    const graphRelation = graphData.relationList[c];

                                    tableRelationInsert(mcpSessionId, fileId, graphRelation.source, graphRelation.verb, graphRelation.target);
                                }
                            } else {
                                result = "ko";

                                break;
                            }
                        }

                        if (result === "ko") {
                            break;
                        }
                    } else {
                        result = "ko";

                        break;
                    }
                }
            } else {
                helperSrc.writeLog("Embedding.ts - databaseStore() - fileReadStream()", fileReadStream.toString());
            }

            if (result === "ok") {
                const fileWriteStreamDone = await helperSrc.fileWriteStream(`${inputFolder}.done`, Buffer.from(""));

                if (typeof fileWriteStreamDone !== "boolean") {
                    helperSrc.writeLog("Embedding.ts - databaseStore() - fileWriteStream(.done)", fileWriteStreamDone.toString());
                }
            } else {
                await databaseDelete(mcpSessionId, fileName);

                const fileWriteStreamFail = await helperSrc.fileWriteStream(`${inputFolder}.fail`, Buffer.from(""));

                if (typeof fileWriteStreamFail !== "boolean") {
                    helperSrc.writeLog("Embedding.ts - databaseStore() - fileWriteStream(.fail)", fileWriteStreamFail.toString());
                }
            }

            await logout(uniqueId);
        }

        return result;
    });
};

export const databaseSearch = (mcpSessionId: string, uniqueId: string, prompt: string): Promise<string> => {
    return instance.runWithContext(async () => {
        await login(uniqueId);

        let citationList: modelRag.Icitation[] = [];

        const embeddingData = await embedding(uniqueId, "query", prompt);

        if (Array.isArray(embeddingData.data) && embeddingData.data.length > 0 && embeddingData.data[0].embedding.length > 0) {
            const buffer = new Uint8Array(new Float32Array(embeddingData.data[0].embedding).buffer);

            const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
            const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);

            if (database) {
                const queryList = database.prepare(`SELECT id, name FROM "${tableNameRagFile}"`).all();
                const fileList = queryList as unknown as modelRag.Ifile[];

                citationList = chunk(fileList, tableNameRag, citationLimit, buffer);

                if (citationList.length > 0) {
                    const distanceBest = citationList[0].distance;

                    const citationFilterList: modelRag.Icitation[] = [];

                    if (distanceBest <= distanceMax) {
                        for (let a = 0; a < citationList.length; a++) {
                            if (citationList[a].distance <= distanceBest + distanceMargin) {
                                citationFilterList.push(citationList[a]);
                            }
                        }
                    }

                    citationList = citationFilterList;
                }
            }
        }

        await logout(uniqueId);

        return JSON.stringify({ citationList: citationList, relationList: tableRelationSelect(mcpSessionId, prompt) });
    });
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    let result = "ko";

    const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
    const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);
    const tableNameRagRelation = tableNameReplace(`${mcpSessionId}_rag_relation`);

    if (database && fileName) {
        const queryRow = database.prepare(`SELECT id FROM "${tableNameRagFile}" WHERE name = ?`).get(fileName);

        if (queryRow) {
            const fileId = queryRow["id"] as number;

            database.prepare(`DELETE FROM "${tableNameRag}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagFile}" WHERE id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagRelation}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
        }

        result = "ok";
    }

    return result;
};

export const tableCreate = (mcpSessionId: string): boolean => {
    const isFileCreate = tableFileCreate(mcpSessionId);
    const isCitationCreate = tableCitationCreate(mcpSessionId);
    const isRelationCreate = tableRelationCreate(mcpSessionId);

    return isFileCreate && isCitationCreate && isRelationCreate;
};

export const tableDrop = (mcpSessionId: string): boolean => {
    let isResult = false;

    const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
    const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);
    const tableNameRagRelation = tableNameReplace(`${mcpSessionId}_rag_relation`);

    if (database) {
        database.exec(`DROP TABLE IF EXISTS "${tableNameRag}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagFile}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagRelation}"`);

        isResult = true;
    }

    return isResult;
};
