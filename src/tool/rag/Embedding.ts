import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: DatabaseSync | undefined = undefined;
const chunkLength = 400;
const vectorDimension = 768;
const vectorChunkSize = 512;

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

const embedding = async (uniqueId: string, text: string | string[]): Promise<modelRag.IapiEmbedding> => {
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

const tableFileInsert = (mcpSessionId: string, fileName: string): boolean => {
    let isResult = false;

    const name = tableNameReplace(`${mcpSessionId}_rag_file`);

    if (database) {
        database.prepare(`INSERT OR IGNORE INTO "${name}" (name) VALUES (?)`).run(fileName);

        isResult = true;
    }

    return isResult;
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

    if (database) {
        for (let a = 0; a < termList.length; a++) {
            const term = termList[a];

            const tableName = tableNameReplace(`${mcpSessionId}_rag_relation`);

            const queryList = database
                .prepare(`SELECT source, verb, target FROM "${tableName}" WHERE (LOWER(source) LIKE ? OR LOWER(target) LIKE ?)`)
                .all(`%${term}%`, `%${term}%`);

            for (let b = 0; b < queryList.length; b++) {
                let isDuplicate = false;

                const query = queryList[b];

                for (let c = 0; c < resultList.length; c++) {
                    if (
                        resultList[c].source === (query["source"] as string) &&
                        resultList[c].verb === (query["verb"] as string) &&
                        resultList[c].target === (query["target"] as string)
                    ) {
                        isDuplicate = true;

                        break;
                    }
                }

                if (!isDuplicate) {
                    resultList.push({
                        source: query["source"] as string,
                        verb: query["verb"] as string,
                        target: query["target"] as string
                    });
                }
            }
        }
    }

    return resultList;
};

const tokenize = (text: string): string[] => {
    const resultList: string[] = [];

    const textSplit = text.split(/\s+/);

    for (let a = 0; a < textSplit.length; a++) {
        const word = textSplit[a].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

        if (word.length > 1 && !resultList.includes(word)) {
            resultList.push(word);
        }
    }

    return resultList;
};

const chunk = (fileList: modelRag.Ifile[], tableNameRag: string, limitPerTable: number, buffer: Uint8Array<ArrayBuffer>): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (database) {
        for (let a = 0; a < fileList.length; a++) {
            const queryList = database
                .prepare(
                    `SELECT chunk, distance FROM "${tableNameRag}" WHERE file_id = CAST(? AS INTEGER) AND embedding MATCH ? ORDER BY distance LIMIT ${limitPerTable}`
                )
                .all(fileList[a].id, buffer);

            for (let b = 0; b < queryList.length; b++) {
                const query = queryList[b];

                if (query["chunk"]) {
                    resultList.push({
                        fileName: fileList[a].name,
                        chunk: query["chunk"] as string,
                        distance: query["distance"] as number
                    });
                }
            }
        }
    }

    return resultList;
};

const tfIdf = (prompt: string, citationList: modelRag.Icitation[]): string[] => {
    const resultList: string[] = [];

    const tokenChunckFrequencyObject = {} as Record<string, number>;

    for (let a = 0; a < citationList.length; a++) {
        const tokenChunkList = tokenize(citationList[a].chunk);

        for (let b = 0; b < tokenChunkList.length; b++) {
            const tokenChunk = tokenChunkList[b];

            tokenChunckFrequencyObject[tokenChunk] = (tokenChunckFrequencyObject[tokenChunk] || 0) + 1;
        }
    }

    const promptSplit = prompt.split(/\s+/);
    const promptFrequencyObject = {} as Record<string, number>;

    for (let a = 0; a < promptSplit.length; a++) {
        const word = promptSplit[a].replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

        if (word.length > 1) {
            promptFrequencyObject[word] = (promptFrequencyObject[word] || 0) + 1;
        }
    }

    const tokenPromptList = tokenize(prompt);

    const candidateCount = Math.max(1, citationList.length);

    for (let a = 0; a < tokenPromptList.length; a++) {
        const tokenPrompt = tokenPromptList[a];

        const frequencyCount = tokenChunckFrequencyObject[tokenPrompt] || 0;

        if (frequencyCount === 0) {
            continue;
        }

        const termFrequency = Math.log(promptFrequencyObject[tokenPrompt] || 1) + 1;
        const inverseDocumentFrequency = Math.log(candidateCount / frequencyCount);

        if (termFrequency * inverseDocumentFrequency > 0) {
            resultList.push(tokenPrompt);
        }
    }

    return resultList;
};

const filter = (importantWordList: string[], citationList: modelRag.Icitation[]): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (importantWordList.length > 0) {
        const requireMatchCount = importantWordList.length >= 3 ? 2 : 1;

        for (let a = 0; a < citationList.length; a++) {
            const tokenChunkList = tokenize(citationList[a].chunk);

            let matchCount = 0;

            for (let b = 0; b < importantWordList.length; b++) {
                if (tokenChunkList.includes(importantWordList[b])) {
                    matchCount++;
                }
            }

            if (matchCount >= requireMatchCount) {
                resultList.push(citationList[a]);
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

        await login(uniqueId);

        tableCitationCreate(mcpSessionId);
        tableFileCreate(mcpSessionId);
        tableRelationCreate(mcpSessionId);

        const tableName = tableNameReplace(`${mcpSessionId}_rag_file`);

        if (database) {
            const queryRow = database.prepare(`SELECT id FROM "${tableName}" WHERE name = ?`).get(fileName);

            if (queryRow) {
                result = "ok";

                return result;
            } else {
                tableFileInsert(mcpSessionId, fileName);
            }
        }

        const fileId = tableFileSelect(mcpSessionId, fileName);

        const fileDetail = helperSrc.fileDetail(fileName);

        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        const fileReadStream = await helperSrc.fileReadStream(`${inputFolder}result.md`);

        if (Buffer.isBuffer(fileReadStream)) {
            const fileReadStreamContent = fileReadStream.toString();

            for (let a = 0; a < fileReadStreamContent.length; a += chunkLength) {
                const fileReadStreamContentChunk = fileReadStreamContent.slice(a, a + chunkLength);

                const embeddingData = await embedding(uniqueId, fileReadStreamContentChunk);

                if (embeddingData.data.length > 0 && embeddingData.data[0].embedding.length > 0) {
                    tableCitationInsert(mcpSessionId, fileId, fileReadStreamContentChunk, embeddingData.data[0].embedding);

                    const graphData = await graphifyExtract(uniqueId, fileReadStreamContentChunk);

                    if (Array.isArray(graphData.relationList)) {
                        for (let b = 0; b < graphData.relationList.length; b++) {
                            const graphRelation = graphData.relationList[b];

                            tableRelationInsert(mcpSessionId, fileId, graphRelation.source, graphRelation.verb, graphRelation.target);
                        }
                    }

                    result = "ok";
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

        const citationFilteredList: modelRag.Icitation[] = [];

        const embeddingData = await embedding(uniqueId, prompt);

        if (embeddingData.data.length > 0 && embeddingData.data[0].embedding.length > 0) {
            const buffer = new Uint8Array(new Float32Array(embeddingData.data[0].embedding).buffer);

            const tableNameRag = tableNameReplace(`${mcpSessionId}_rag`);
            const tableNameRagFile = tableNameReplace(`${mcpSessionId}_rag_file`);

            if (database) {
                const queryList = database.prepare(`SELECT id, name FROM "${tableNameRagFile}"`).all();
                const fileList = queryList as unknown as modelRag.Ifile[];
                const totalLimit = Math.max(6, fileList.length);
                const limitPerTable = Math.max(2, Math.ceil(totalLimit / Math.max(1, fileList.length)));

                let citationList = chunk(fileList, tableNameRag, limitPerTable, buffer);

                const importantWordList = tfIdf(prompt, citationList);

                citationList = filter(importantWordList, citationList)
                    .sort((a, b) => a.distance - b.distance)
                    .slice(0, totalLimit);

                for (let a = 0; a < citationList.length; a++) {
                    citationFilteredList.push({
                        fileName: citationList[a].fileName,
                        chunk: citationList[a].chunk,
                        distance: citationList[a].distance
                    });
                }
            }
        }

        await logout(uniqueId);

        return JSON.stringify({ citationList: citationFilteredList, relationList: tableRelationSelect(mcpSessionId, prompt) });
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
