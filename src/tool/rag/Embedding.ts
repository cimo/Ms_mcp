import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: Database.Database | undefined = undefined;
const chunkLength = 1000;
const chunkLengthMin = chunkLength / 10;
const distanceMax = 1.12;
const graphifyParallel = 8;
const batchLength = 32;
const vectorDimension = 768;
const vectorChunkSize = 512;
const candidatePool = 256;
const citationLimit = 4;
const graphHopMax = 2;
const nodeWordMin = 3;
const ftsTermMin = 3;
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
            helperSrc.writeLog("Embedding.ts - login() - api(/login) - catch()", error.message);

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
            helperSrc.writeLog("Embedding.ts - embedding() - catch()", error.message);

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
            helperSrc.writeLog("Embedding.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
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

const chunkRead = (fileList: modelRag.Ifile[], tableNameRag: string, limit: number, buffer: Buffer): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (database) {
        const fileNameObject = {} as Record<number, string>;

        for (let a = 0; a < fileList.length; a++) {
            fileNameObject[fileList[a].id] = fileList[a].name;
        }

        const queryList = database
            .prepare(`SELECT chunk, file_id, distance FROM "${tableNameRag}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${limit}`)
            .all(buffer) as unknown as modelRag.IdatabaseQueryChunk[];

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            if (query.chunk && fileNameObject[query.file_id]) {
                resultList.push({
                    fileName: fileNameObject[query.file_id],
                    chunk: query.chunk,
                    distance: query.distance
                });
            }
        }
    }

    return resultList;
};

const ftsRead = (mcpSessionId: string, fileList: modelRag.Ifile[], termList: string[]): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (database) {
        const tableName = tableNameReplace(`${mcpSessionId}_rag_fts`);

        const matchList: string[] = [];
        const seenObject: Record<string, boolean> = {};

        for (let a = 0; a < termList.length; a++) {
            const term = termList[a].trim().toLowerCase().replace(/"/g, '""');

            if (term.length >= ftsTermMin && !seenObject[term]) {
                seenObject[term] = true;
                matchList.push(`"${term}"`);
            }
        }

        if (matchList.length > 0) {
            const fileNameObject = {} as Record<number, string>;

            for (let a = 0; a < fileList.length; a++) {
                fileNameObject[fileList[a].id] = fileList[a].name;
            }

            const queryList = database
                .prepare(`SELECT chunk, file_id FROM "${tableName}" WHERE "${tableName}" MATCH ? ORDER BY rank LIMIT ${candidatePool}`)
                .all(matchList.join(" OR ")) as unknown as modelRag.IdatabaseQueryChunk[];

            for (let a = 0; a < queryList.length; a++) {
                const query = queryList[a];

                if (query.chunk && fileNameObject[query.file_id]) {
                    resultList.push({
                        fileName: fileNameObject[query.file_id],
                        chunk: query.chunk,
                        distance: 0
                    });
                }
            }
        }
    }

    return resultList;
};

const nodeNormalize = (text: string): string => {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
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
        const queryRow = database.prepare(`SELECT id FROM "${name}" WHERE name = ?`).get(fileName) as Record<string, unknown> | undefined;

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
            .run(Buffer.from(new Float32Array(embedding).buffer), fileId, chunk);

        isResult = true;
    }

    return isResult;
};

const tableFtsCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_fts`);

    if (database) {
        database.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING fts5(chunk, file_id UNINDEXED, tokenize='trigram')`);

        isResult = true;
    }

    return isResult;
};

const tableFtsInsert = (mcpSessionId: string, fileId: number, chunk: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_fts`);

    if (database && fileId > 0) {
        database.prepare(`INSERT INTO "${name}" (chunk, file_id) VALUES (?, CAST(? AS INTEGER))`).run(chunk, fileId);

        isResult = true;
    }

    return isResult;
};

const tableNodeCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_node`);

    if (database) {
        database.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER,
            name TEXT NOT NULL,
            UNIQUE (file_id, name)
        )`);

        isResult = true;
    }

    return isResult;
};

const tableNodeInsert = (mcpSessionId: string, fileId: number, name: string): boolean => {
    let isResult = false;

    const tableName = tableNameReplace(`${mcpSessionId}_rag_node`);

    if (database && fileId > 0) {
        database.prepare(`INSERT OR IGNORE INTO "${tableName}" (file_id, name) VALUES (CAST(? AS INTEGER), ?)`).run(fileId, name);

        isResult = true;
    }

    return isResult;
};

const tableNodeMatch = (mcpSessionId: string, termList: string[]): string[] => {
    const resultList: string[] = [];

    if (database) {
        const tableName = tableNameReplace(`${mcpSessionId}_rag_node`);

        const likeList: string[] = [];

        for (let a = 0; a < termList.length; a++) {
            const term = nodeNormalize(termList[a]);

            if (term.length >= nodeWordMin) {
                likeList.push(`%${term}%`);
            }
        }

        if (likeList.length > 0) {
            const clauseList: string[] = [];

            for (let a = 0; a < likeList.length; a++) {
                clauseList.push("name LIKE ?");
            }

            const queryList = database
                .prepare(`SELECT DISTINCT name FROM "${tableName}" WHERE ${clauseList.join(" OR ")} ORDER BY length(name) ASC`)
                .all(...likeList) as unknown as modelRag.IdatabaseQueryNode[];

            const nodeLogList: string[] = [];

            for (let a = 0; a < queryList.length; a++) {
                resultList.push(queryList[a].name);

                nodeLogList.push(queryList[a].name);
            }

            helperSrc.writeLog("Embedding.ts - tableNodeMatch()", nodeLogList.join(", "));
        }
    }

    return resultList;
};

const tableEdgeCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_edge`);

    if (database) {
        database.exec(
            `CREATE TABLE IF NOT EXISTS "${name}" (id INTEGER PRIMARY KEY, file_id INTEGER, source TEXT NOT NULL, verb TEXT NOT NULL, target TEXT NOT NULL, source_norm TEXT NOT NULL, target_norm TEXT NOT NULL)`
        );

        database.exec(`CREATE INDEX IF NOT EXISTS "${name}_source" ON "${name}" (source_norm)`);
        database.exec(`CREATE INDEX IF NOT EXISTS "${name}_target" ON "${name}" (target_norm)`);

        isResult = true;
    }

    return isResult;
};

const tableEdgeInsert = (mcpSessionId: string, fileId: number, source: string, verb: string, target: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_edge`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${name}" (file_id, source, verb, target, source_norm, target_norm) VALUES (CAST(? AS INTEGER), ?, ?, ?, ?, ?)`)
            .run(fileId, source, verb, target, nodeNormalize(source), nodeNormalize(target));

        isResult = true;
    }

    return isResult;
};

const tableEdgeTraverse = (mcpSessionId: string, seedList: string[]): modelRag.Irelation[] => {
    const resultList: modelRag.Irelation[] = [];

    if (database && seedList.length > 0) {
        const name = tableNameReplace(`${mcpSessionId}_rag_edge`);

        const queryList = database
            .prepare(
                `WITH RECURSIVE walk(node, depth) AS (
                    SELECT value, 0 FROM json_each(?)
                    UNION
                    SELECT step.next_node, walk.depth + 1
                    FROM (
                        SELECT source_norm AS node, target_norm AS next_node FROM "${name}"
                        UNION ALL
                        SELECT target_norm AS node, source_norm AS next_node FROM "${name}"
                    ) step
                    JOIN walk ON step.node = walk.node
                    WHERE walk.depth < ${graphHopMax}
                )
                SELECT DISTINCT source, verb, target FROM "${name}"
                WHERE source_norm IN (SELECT node FROM walk) OR target_norm IN (SELECT node FROM walk)`
            )
            .all(JSON.stringify(seedList)) as unknown as modelRag.Irelation[];

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            resultList.push({
                source: query.source,
                verb: query.verb,
                target: query.target
            });
        }
    }

    return resultList;
};

export const databaseCreate = (): boolean => {
    let isResult = false;

    database = new Database(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}sqlite/rag.sqlite`);
    sqliteVec.load(database);

    const queryRow = database.prepare("SELECT sqlite_version() AS sqlite_version, vec_version() AS vec_version;").get() as
        | Record<string, unknown>
        | undefined;

    if (queryRow) {
        helperSrc.writeLog(
            "Embedding.ts - databaseCreate()",
            `Sqlite version: ${queryRow["sqlite_version"]} - Vec version: ${queryRow["vec_version"]}`
        );

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

                let isFailed = false;

                const stageCitation = async (): Promise<void> => {
                    for (let a = 0; a < chunkList.length; a += batchLength) {
                        if (isFailed) {
                            break;
                        }

                        const chunkBatchList = chunkList.slice(a, a + batchLength);

                        const embeddingData = await embedding(uniqueId, "document", chunkBatchList);

                        if (Array.isArray(embeddingData.data) && embeddingData.data.length === chunkBatchList.length) {
                            if (database) {
                                database.exec("BEGIN");

                                for (let b = 0; b < chunkBatchList.length; b++) {
                                    tableCitationInsert(mcpSessionId, fileId, chunkBatchList[b], embeddingData.data[b].embedding);
                                    tableFtsInsert(mcpSessionId, fileId, chunkBatchList[b]);
                                }

                                database.exec("COMMIT");
                            }
                        } else {
                            isFailed = true;

                            break;
                        }
                    }
                };

                let chunkIndex = 0;

                const graphifyWorker = async (): Promise<void> => {
                    while (chunkIndex < chunkList.length && !isFailed) {
                        const chunk = chunkList[chunkIndex];

                        chunkIndex++;

                        const graphData = await graphifyExtract(uniqueId, chunk);

                        if (Array.isArray(graphData.relationList)) {
                            if (database) {
                                database.exec("BEGIN");

                                for (let a = 0; a < graphData.relationList.length; a++) {
                                    const relation = graphData.relationList[a];

                                    tableEdgeInsert(mcpSessionId, fileId, relation.source, relation.verb, relation.target);
                                    tableNodeInsert(mcpSessionId, fileId, nodeNormalize(relation.source));
                                    tableNodeInsert(mcpSessionId, fileId, nodeNormalize(relation.target));
                                }

                                database.exec("COMMIT");
                            }

                            relationInsertCount += graphData.relationList.length;
                        } else {
                            isFailed = true;
                        }
                    }
                };

                const stageRelation = async (): Promise<void> => {
                    const graphifyWorkerList: Promise<void>[] = [];

                    for (let a = 0; a < graphifyParallel; a++) {
                        graphifyWorkerList.push(graphifyWorker());
                    }

                    await Promise.all(graphifyWorkerList);
                };

                await Promise.all([stageCitation(), stageRelation()]);

                if (isFailed) {
                    result = "ko";
                } else {
                    result = "ok";
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

export const databaseSearch = (mcpSessionId: string, uniqueId: string, prompt: string, entityList: string[]): Promise<string> => {
    return instance.runWithContext(async () => {
        await login(uniqueId);

        let citationList: modelRag.Icitation[] = [];
        let graphList: modelRag.Irelation[] = [];

        const embeddingData = await embedding(uniqueId, "query", prompt);

        if (Array.isArray(embeddingData.data) && embeddingData.data.length > 0 && embeddingData.data[0].embedding.length > 0) {
            const buffer = Buffer.from(new Float32Array(embeddingData.data[0].embedding).buffer);

            const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
            const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);

            if (database) {
                const queryList = database.prepare(`SELECT id, name FROM "${tableNameRagFile}"`).all();
                const fileList = queryList as unknown as modelRag.Ifile[];

                let distanceBest = -1;

                if (entityList.length > 0) {
                    const entityEmbeddingData = await embedding(uniqueId, "query", entityList);
                    const isEntityEmbedding = Array.isArray(entityEmbeddingData.data) && entityEmbeddingData.data.length === entityList.length;

                    for (let a = 0; a < entityList.length; a++) {
                        let citation: modelRag.Icitation | undefined = undefined;

                        if (isEntityEmbedding && entityEmbeddingData.data[a].embedding.length > 0) {
                            const entityBuffer = Buffer.from(new Float32Array(entityEmbeddingData.data[a].embedding).buffer);
                            const entityCitationList = chunkRead(fileList, tableNameRag, candidatePool, entityBuffer);

                            if (entityCitationList.length > 0) {
                                if (distanceBest < 0 || entityCitationList[0].distance < distanceBest) {
                                    distanceBest = entityCitationList[0].distance;
                                }

                                if (entityCitationList[0].distance <= distanceMax) {
                                    citation = entityCitationList[0];
                                }
                            }
                        }

                        if (!citation) {
                            const ftsCitationList = ftsRead(mcpSessionId, fileList, [entityList[a]]);

                            if (ftsCitationList.length > 0) {
                                citation = ftsCitationList[0];
                            }
                        }

                        if (citation) {
                            let isPresent = false;

                            for (let b = 0; b < citationList.length; b++) {
                                if (citationList[b].fileName === citation.fileName && citationList[b].chunk === citation.chunk) {
                                    isPresent = true;
                                }
                            }

                            if (!isPresent) {
                                citationList.push(citation);
                            }
                        }
                    }
                } else {
                    const vectorCitationList = chunkRead(fileList, tableNameRag, candidatePool, buffer);

                    if (vectorCitationList.length > 0) {
                        distanceBest = vectorCitationList[0].distance;

                        for (let a = 0; a < vectorCitationList.length && citationList.length < citationLimit; a++) {
                            if (vectorCitationList[a].distance <= distanceMax) {
                                citationList.push(vectorCitationList[a]);
                            }
                        }
                    }
                }

                if (citationList.length > citationLimit) {
                    citationList = citationList.slice(0, citationLimit);
                }

                const seedList = tableNodeMatch(mcpSessionId, entityList);

                if (seedList.length > 0) {
                    graphList = tableEdgeTraverse(mcpSessionId, seedList);
                }

                helperSrc.writeLog(
                    "Embedding.ts - databaseSearch()",
                    `Prompt: ${prompt.substring(0, 80)} - DistanceBest: ${distanceBest.toFixed(4)} - Citation: ${citationList.length} - Graph: ${graphList.length}`
                );
            }
        }

        await logout(uniqueId);

        return JSON.stringify({ citationList, graphList });
    });
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    let result = "ko";

    const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
    const tableNameRagFts = tableNameReplace(`${mcpSessionId}_rag_fts`);
    const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);
    const tableNameRagNode = tableNameReplace(`${mcpSessionId}_rag_node`);
    const tableNameRagEdge = tableNameReplace(`${mcpSessionId}_rag_edge`);

    if (database && fileName) {
        const queryRow = database.prepare(`SELECT id FROM "${tableNameRagFile}" WHERE name = ?`).get(fileName) as Record<string, unknown> | undefined;

        if (queryRow) {
            const fileId = queryRow["id"] as number;

            database.prepare(`DELETE FROM "${tableNameRag}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagFts}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagFile}" WHERE id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagNode}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagEdge}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
        }

        result = "ok";
    }

    return result;
};

export const tableCreate = (mcpSessionId: string): boolean => {
    const isFileCreate = tableFileCreate(mcpSessionId);
    const isCitationCreate = tableCitationCreate(mcpSessionId);
    const isFtsCreate = tableFtsCreate(mcpSessionId);
    const isNodeCreate = tableNodeCreate(mcpSessionId);
    const isEdgeCreate = tableEdgeCreate(mcpSessionId);

    return isFileCreate && isCitationCreate && isFtsCreate && isNodeCreate && isEdgeCreate;
};

export const tableDrop = (mcpSessionId: string): boolean => {
    let isResult = false;

    const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
    const tableNameRagFts = tableNameReplace(`${mcpSessionId}_rag_fts`);
    const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);
    const tableNameRagRelation = tableNameReplace(`${mcpSessionId}_rag_relation`);
    const tableNameRagNode = tableNameReplace(`${mcpSessionId}_rag_node`);
    const tableNameRagEdge = tableNameReplace(`${mcpSessionId}_rag_edge`);

    if (database) {
        database.exec(`DROP TABLE IF EXISTS "${tableNameRag}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagFts}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagFile}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagRelation}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagNode}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagEdge}"`);

        isResult = true;
    }

    return isResult;
};
