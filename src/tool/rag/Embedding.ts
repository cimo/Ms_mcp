import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: DatabaseSync | undefined = undefined;
const chunkLength = 1000;
const chunkLengthMin = chunkLength / 10;
const chunkDistanceMargin = 0.13;
const distanceMax = 1.12;
const graphifyParallel = 4;
const batchLength = 32;
const vectorDimension = 768;
const vectorChunkSize = 512;
const citationLimit = 4;
const relationLimit = 20;
const urlMaxCount = 3;

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

const chunkRead = (fileList: modelRag.Ifile[], tableNameRag: string, limit: number, buffer: Uint8Array<ArrayBuffer>): modelRag.Icitation[] => {
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
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING vec0(id INTEGER PRIMARY KEY, embedding float[${vectorDimension}], file_id INTEGER PARTITION KEY, +source TEXT NOT NULL, +verb TEXT NOT NULL, +target TEXT NOT NULL, chunk_size=${vectorChunkSize})`
        );

        isResult = true;
    }

    return isResult;
};

const tableRelationInsert = (mcpSessionId: string, fileId: number, source: string, verb: string, target: string, embedding: number[]): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_relation`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${name}" (embedding, file_id, source, verb, target) VALUES (?, CAST(? AS INTEGER), ?, ?, ?)`)
            .run(new Uint8Array(new Float32Array(embedding).buffer), fileId, source, verb, target);

        isResult = true;
    }

    return isResult;
};

const tableRelationSelect = (mcpSessionId: string, buffer: Uint8Array<ArrayBuffer>): modelRag.Irelation[] => {
    const resultList: modelRag.Irelation[] = [];

    if (database) {
        const tableName = tableNameReplace(`${mcpSessionId}_rag_relation`);

        const queryList = database
            .prepare(`SELECT source, verb, target, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${relationLimit}`)
            .all(buffer);

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            if ((query["distance"] as number) <= distanceMax) {
                resultList.push({
                    source: query["source"] as string,
                    verb: query["verb"] as string,
                    target: query["target"] as string
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

            const millisecondStart = Date.now();

            let chunkCount = 0;
            let relationInsertCount = 0;

            const fileReadStream = await helperSrc.fileReadStream(`${inputFolder}result.md`);

            if (Buffer.isBuffer(fileReadStream)) {
                const fileReadStreamContent = fileReadStream.toString();

                const chunkCreateList = chunkCreate(fileReadStreamContent);

                const chunkList: string[] = [];

                for (let a = 0; a < chunkCreateList.length; a++) {
                    const urlMatchList = chunkCreateList[a].match(/https?:\/\//g);

                    if (chunkCreateList[a].length >= chunkLengthMin && (!urlMatchList || urlMatchList.length < urlMaxCount)) {
                        chunkList.push(chunkCreateList[a]);
                    }
                }

                chunkCount = chunkList.length;

                result = "ok";

                for (let a = 0; a < chunkList.length; a += batchLength) {
                    const chunkBatchList = chunkList.slice(a, a + batchLength);

                    const embeddingData = await embedding(uniqueId, "document", chunkBatchList);

                    if (Array.isArray(embeddingData.data) && embeddingData.data.length === chunkBatchList.length) {
                        for (let b = 0; b < chunkBatchList.length; b++) {
                            tableCitationInsert(mcpSessionId, fileId, chunkBatchList[b], embeddingData.data[b].embedding);
                        }

                        for (let b = 0; b < chunkBatchList.length; b += graphifyParallel) {
                            const graphifyPromiseList: Promise<modelRag.IapiExtract>[] = [];

                            for (let c = b; c < Math.min(b + graphifyParallel, chunkBatchList.length); c++) {
                                graphifyPromiseList.push(graphifyExtract(uniqueId, chunkBatchList[c]));
                            }

                            const graphDataList = await Promise.all(graphifyPromiseList);

                            const relationPendingList: modelRag.Irelation[] = [];

                            for (let c = 0; c < graphDataList.length; c++) {
                                if (Array.isArray(graphDataList[c].relationList)) {
                                    for (let d = 0; d < graphDataList[c].relationList.length; d++) {
                                        relationPendingList.push(graphDataList[c].relationList[d]);
                                    }
                                } else {
                                    result = "ko";

                                    break;
                                }
                            }

                            if (result === "ok" && relationPendingList.length > 0) {
                                const relationTextList: string[] = [];

                                for (let c = 0; c < relationPendingList.length; c++) {
                                    relationTextList.push(
                                        `${relationPendingList[c].source} ${relationPendingList[c].verb} ${relationPendingList[c].target}`
                                    );
                                }

                                const relationEmbeddingData = await embedding(uniqueId, "document", relationTextList);

                                if (Array.isArray(relationEmbeddingData.data) && relationEmbeddingData.data.length === relationPendingList.length) {
                                    for (let c = 0; c < relationPendingList.length; c++) {
                                        tableRelationInsert(
                                            mcpSessionId,
                                            fileId,
                                            relationPendingList[c].source,
                                            relationPendingList[c].verb,
                                            relationPendingList[c].target,
                                            relationEmbeddingData.data[c].embedding
                                        );
                                    }

                                    relationInsertCount += relationPendingList.length;
                                } else {
                                    result = "ko";
                                }
                            }

                            if (result === "ko") {
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
                helperSrc.writeLog(
                    "Embedding.ts - databaseStore()",
                    `File: ${fileName} - Chunk: ${chunkCount} - Relation: ${relationInsertCount} - Time: ${Math.round((Date.now() - millisecondStart) / 1000)}s`
                );

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
        let relationList: modelRag.Irelation[] = [];

        const embeddingData = await embedding(uniqueId, "query", prompt);

        if (Array.isArray(embeddingData.data) && embeddingData.data.length > 0 && embeddingData.data[0].embedding.length > 0) {
            const buffer = new Uint8Array(new Float32Array(embeddingData.data[0].embedding).buffer);

            const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
            const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);

            if (database) {
                const queryList = database.prepare(`SELECT id, name FROM "${tableNameRagFile}"`).all();
                const fileList = queryList as unknown as modelRag.Ifile[];

                citationList = chunkRead(fileList, tableNameRag, citationLimit, buffer);

                let distanceBest = -1;

                if (citationList.length > 0) {
                    distanceBest = citationList[0].distance;

                    const citationFilterList: modelRag.Icitation[] = [];

                    if (distanceBest <= distanceMax) {
                        for (let a = 0; a < citationList.length; a++) {
                            if (citationList[a].distance <= distanceBest + chunkDistanceMargin && citationList[a].distance <= distanceMax) {
                                citationFilterList.push(citationList[a]);
                            }
                        }
                    }

                    citationList = citationFilterList;
                }

                if (citationList.length > 0) {
                    relationList = tableRelationSelect(mcpSessionId, buffer);
                }

                helperSrc.writeLog(
                    "Embedding.ts - databaseSearch()",
                    `Prompt: ${prompt.substring(0, 80)} - DistanceBest: ${distanceBest.toFixed(4)} - Citation: ${citationList.length} - Relation: ${relationList.length}`
                );
            }
        }

        await logout(uniqueId);

        return JSON.stringify({ citationList: citationList, relationList: relationList });
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
