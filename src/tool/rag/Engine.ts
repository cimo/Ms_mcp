import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

let database: Database.Database | undefined = undefined;
let queueStore: Promise<unknown> = Promise.resolve();

const chunkLength = 1000;
const chunkLengthMin = chunkLength / 10;
const distanceMax = 1.12;
const marginRelative = 0.1;
const graphifyParallel = 4;
const batchLength = 32;
const vectorDimension = 768;
const vectorChunkSize = 512;
const candidatePool = 256;
const citationLimit = 4;
const graphLimitPerSeed = 32;
const graphTokenBudget = 2000;
const vecMatchLimit = 8;
const seedLimit = 24;
const termMin = 3;

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
            helperSrc.writeLog("Engine.ts - login() - api(/login) - catch()", error.message);

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
            helperSrc.writeLog("Engine.ts - embedding() - catch()", error.message);

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
            helperSrc.writeLog("Engine.ts - graphifyExtract() - api(/api/ragGraphifyExtract) - catch()", error.message);

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
            helperSrc.writeLog("Engine.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

const utilCitationChunk = (text: string): string[] => {
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

const utilNodeNormalize = (text: string): string => {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
};

const utilReplaceTableName = (name: string): string => {
    return name.replace(/"/g, '""');
};

const utilTokenEstimate = (text: string): number => {
    return Math.ceil(text.length / 4);
};

const tableFileCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_file`);

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

    const name = utilReplaceTableName(`${mcpSessionId}_rag_file`);

    if (database) {
        const runPrepare = database.prepare(`INSERT OR IGNORE INTO "${name}" (name) VALUES (?)`).run(fileName);

        result = Number(runPrepare.lastInsertRowid);
    }

    return result;
};

const tableFileSelect = (mcpSessionId: string, fileName: string): number => {
    let result = 0;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_file`);

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

    const name = utilReplaceTableName(`${mcpSessionId}_rag`);

    if (database) {
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING vec0(id INTEGER PRIMARY KEY, embedding float[${vectorDimension}], file_id INTEGER PARTITION KEY, +chunk TEXT NOT NULL, +chunk_index INTEGER, chunk_size=${vectorChunkSize})`
        );

        isResult = true;
    }

    return isResult;
};

const tableCitationInsert = (mcpSessionId: string, fileId: number, chunk: string, chunkIndex: number, embedding: number[]): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${name}" (embedding, file_id, chunk, chunk_index) VALUES (?, CAST(? AS INTEGER), ?, CAST(? AS INTEGER))`)
            .run(Buffer.from(new Float32Array(embedding).buffer), fileId, chunk, chunkIndex);

        isResult = true;
    }

    return isResult;
};

const tableCitationSelectByIndex = (mcpSessionId: string, fileId: number, chunkIndex: number): string => {
    let result = "";

    if (database) {
        const name = utilReplaceTableName(`${mcpSessionId}_rag`);

        const queryRow = database
            .prepare(`SELECT chunk FROM "${name}" WHERE file_id = CAST(? AS INTEGER) AND chunk_index = CAST(? AS INTEGER) LIMIT 1`)
            .get(fileId, chunkIndex) as Record<string, unknown> | undefined;

        if (queryRow && typeof queryRow["chunk"] === "string") {
            result = queryRow["chunk"] as string;
        }
    }

    return result;
};

const logicCitationMatch = (fileList: modelRag.Ifile[], tableNameRag: string, limit: number, buffer: Buffer): modelRag.Icitation[] => {
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

const tableFtsCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_fts`);

    if (database) {
        database.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING fts5(chunk, file_id UNINDEXED, tokenize='trigram')`);

        isResult = true;
    }

    return isResult;
};

const tableFtsInsert = (mcpSessionId: string, fileId: number, chunk: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_fts`);

    if (database && fileId > 0) {
        database.prepare(`INSERT INTO "${name}" (chunk, file_id) VALUES (?, CAST(? AS INTEGER))`).run(chunk, fileId);

        isResult = true;
    }

    return isResult;
};

const logicFtsMatch = (mcpSessionId: string, fileList: modelRag.Ifile[], termList: string[]): modelRag.Icitation[] => {
    const resultList: modelRag.Icitation[] = [];

    if (database) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_fts`);

        const matchList: string[] = [];
        const seenObject: Record<string, boolean> = {};

        for (let a = 0; a < termList.length; a++) {
            const term = termList[a].trim().toLowerCase().replace(/"/g, '""');

            if (term.length >= termMin && !seenObject[term]) {
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
                .prepare(`SELECT chunk, file_id FROM "${tableName}" WHERE "${tableName}" MATCH ? ORDER BY rank LIMIT 1`)
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

const tableNodeCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_node`);

    if (database) {
        database.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER,
            name TEXT NOT NULL,
            name_norm TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT NOT NULL,
            UNIQUE (file_id, name_norm)
        )`);

        isResult = true;
    }

    return isResult;
};

const tableNodeInsert = (mcpSessionId: string, fileId: number, name: string, type: string, description: string): boolean => {
    let isResult = false;

    const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node`);

    if (database && fileId > 0) {
        database
            .prepare(
                `INSERT INTO "${tableName}" (file_id, name, name_norm, type, description) VALUES (CAST(? AS INTEGER), ?, ?, ?, ?)
                ON CONFLICT (file_id, name_norm) DO UPDATE SET description = excluded.description WHERE "${tableName}".description = ''`
            )
            .run(fileId, name, utilNodeNormalize(name), type, description);

        isResult = true;
    }

    return isResult;
};

const tableNodeSelectByFile = (mcpSessionId: string, fileId: number): modelRag.IdatabaseQueryNodeVec[] => {
    const resultList: modelRag.IdatabaseQueryNodeVec[] = [];

    if (database && fileId > 0) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node`);

        const queryList = database
            .prepare(`SELECT name, name_norm, description FROM "${tableName}" WHERE file_id = CAST(? AS INTEGER)`)
            .all(fileId) as unknown as modelRag.IdatabaseQueryNodeVec[];

        for (let a = 0; a < queryList.length; a++) {
            resultList.push(queryList[a]);
        }
    }

    return resultList;
};

const logicNodeMatch = (mcpSessionId: string, termList: string[]): string[] => {
    const resultList: string[] = [];

    if (database) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node`);

        const likeList: string[] = [];

        for (let a = 0; a < termList.length; a++) {
            const term = utilNodeNormalize(termList[a]);

            if (term.length >= termMin) {
                likeList.push(`%${term}%`);
            }
        }

        if (likeList.length > 0) {
            const clauseList: string[] = [];

            for (let a = 0; a < likeList.length; a++) {
                clauseList.push("name_norm LIKE ?");
            }

            const queryList = database
                .prepare(`SELECT DISTINCT name_norm FROM "${tableName}" WHERE ${clauseList.join(" OR ")} ORDER BY length(name_norm) ASC`)
                .all(...likeList) as unknown as modelRag.IdatabaseQueryNode[];

            for (let a = 0; a < queryList.length; a++) {
                resultList.push(queryList[a].name_norm);
            }
        }
    }

    return resultList;
};

const tableNodeVecCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_node_vec`);

    if (database) {
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING vec0(id INTEGER PRIMARY KEY, embedding float[${vectorDimension}], +file_id INTEGER, +name TEXT NOT NULL, +name_norm TEXT NOT NULL, +description TEXT NOT NULL, chunk_size=${vectorChunkSize})`
        );

        isResult = true;
    }

    return isResult;
};

const tableNodeVecInsert = (
    mcpSessionId: string,
    fileId: number,
    name: string,
    nameNorm: string,
    description: string,
    embedding: number[]
): boolean => {
    let isResult = false;

    const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node_vec`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${tableName}" (embedding, file_id, name, name_norm, description) VALUES (?, CAST(? AS INTEGER), ?, ?, ?)`)
            .run(Buffer.from(new Float32Array(embedding).buffer), fileId, name, nameNorm, description);

        isResult = true;
    }

    return isResult;
};

const logicNodeVecMatch = (mcpSessionId: string, buffer: Buffer): modelRag.IdatabaseQueryNodeVec[] => {
    const resultList: modelRag.IdatabaseQueryNodeVec[] = [];

    if (database) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node_vec`);

        const queryList = database
            .prepare(
                `SELECT name, name_norm, description, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${candidatePool}`
            )
            .all(buffer) as unknown as modelRag.IdatabaseQueryNodeVec[];

        let distanceBest = -1;

        if (queryList.length > 0) {
            distanceBest = queryList[0].distance;
        }

        for (let a = 0; a < queryList.length && resultList.length < vecMatchLimit; a++) {
            if (queryList[a].distance <= distanceMax && queryList[a].distance <= distanceBest + marginRelative) {
                resultList.push(queryList[a]);
            }
        }
    }

    return resultList;
};

const tableEdgeCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

    if (database) {
        database.exec(
            `CREATE TABLE IF NOT EXISTS "${name}" (id INTEGER PRIMARY KEY, file_id INTEGER, chunk_index INTEGER, source TEXT NOT NULL, verb TEXT NOT NULL, target TEXT NOT NULL, description TEXT NOT NULL, keyword TEXT NOT NULL, source_norm TEXT NOT NULL, target_norm TEXT NOT NULL)`
        );

        database.exec(`CREATE INDEX IF NOT EXISTS "${name}_source" ON "${name}" (source_norm)`);
        database.exec(`CREATE INDEX IF NOT EXISTS "${name}_target" ON "${name}" (target_norm)`);

        isResult = true;
    }

    return isResult;
};

const tableEdgeInsert = (mcpSessionId: string, fileId: number, chunkIndex: number, relation: modelRag.Irelation): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

    if (database && fileId > 0) {
        database
            .prepare(
                `INSERT INTO "${name}" (file_id, chunk_index, source, verb, target, description, keyword, source_norm, target_norm) VALUES (CAST(? AS INTEGER), CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                fileId,
                chunkIndex,
                relation.source,
                relation.verb,
                relation.target,
                relation.description,
                relation.keyword,
                utilNodeNormalize(relation.source),
                utilNodeNormalize(relation.target)
            );

        isResult = true;
    }

    return isResult;
};

const tableEdgeSelectByFile = (mcpSessionId: string, fileId: number): modelRag.IdatabaseQueryEdgeBuild[] => {
    const resultList: modelRag.IdatabaseQueryEdgeBuild[] = [];

    if (database && fileId > 0) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

        const queryList = database
            .prepare(`SELECT id, verb, description, keyword FROM "${tableName}" WHERE file_id = CAST(? AS INTEGER)`)
            .all(fileId) as unknown as modelRag.IdatabaseQueryEdgeBuild[];

        for (let a = 0; a < queryList.length; a++) {
            resultList.push(queryList[a]);
        }
    }

    return resultList;
};

const tableEdgeSelectByIdList = (mcpSessionId: string, idList: number[]): modelRag.IdatabaseQueryEdgeFull[] => {
    const resultList: modelRag.IdatabaseQueryEdgeFull[] = [];

    if (database && idList.length > 0) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

        const queryList = database
            .prepare(
                `SELECT id, source, verb, target, description, keyword, source_norm, target_norm, file_id, chunk_index FROM "${tableName}" WHERE id IN (SELECT value FROM json_each(?))`
            )
            .all(JSON.stringify(idList)) as unknown as modelRag.IdatabaseQueryEdgeFull[];

        for (let a = 0; a < queryList.length; a++) {
            resultList.push(queryList[a]);
        }
    }

    return resultList;
};

const logicEdgeTraverse = (mcpSessionId: string, seedList: string[]): modelRag.IgraphCandidate[] => {
    const resultList: modelRag.IgraphCandidate[] = [];

    if (database && seedList.length > 0) {
        const name = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

        const limit = seedList.length * graphLimitPerSeed;

        const queryList = database
            .prepare(
                `SELECT MIN(id) AS id, source, verb, target, MIN(description) AS description, MIN(file_id) AS file_id, MIN(chunk_index) AS chunk_index, source_norm, target_norm FROM "${name}"
                WHERE source_norm IN (SELECT value FROM json_each(?)) OR target_norm IN (SELECT value FROM json_each(?))
                GROUP BY source_norm, verb, target_norm
                LIMIT ${limit}`
            )
            .all(JSON.stringify(seedList), JSON.stringify(seedList)) as unknown as modelRag.IdatabaseQueryEdge[];

        for (let a = 0; a < queryList.length; a++) {
            const query = queryList[a];

            resultList.push({
                source: query.source,
                verb: query.verb,
                target: query.target,
                description: query.description,
                chunk: tableCitationSelectByIndex(mcpSessionId, query.file_id, query.chunk_index),
                edgeId: query.id,
                sourceNorm: query.source_norm,
                targetNorm: query.target_norm,
                relevance: 0,
                rank: 0
            });
        }
    }

    return resultList;
};

const logicNodeDegree = (mcpSessionId: string, nameNormList: string[]): Record<string, number> => {
    const resultObject: Record<string, number> = {};

    if (database && nameNormList.length > 0) {
        const name = utilReplaceTableName(`${mcpSessionId}_rag_edge`);

        const queryList = database
            .prepare(
                `SELECT node, COUNT(*) AS degree FROM (
                    SELECT source_norm AS node FROM "${name}"
                    UNION ALL
                    SELECT target_norm AS node FROM "${name}"
                ) WHERE node IN (SELECT value FROM json_each(?)) GROUP BY node`
            )
            .all(JSON.stringify(nameNormList)) as unknown as modelRag.IdatabaseQueryDegree[];

        for (let a = 0; a < queryList.length; a++) {
            resultObject[queryList[a].node] = queryList[a].degree;
        }
    }

    return resultObject;
};

const logicNodeType = (mcpSessionId: string, nameNormList: string[]): Record<string, string> => {
    const resultObject: Record<string, string> = {};

    if (database && nameNormList.length > 0) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_node`);

        const queryList = database
            .prepare(`SELECT name_norm, type FROM "${tableName}" WHERE name_norm IN (SELECT value FROM json_each(?)) AND type != ''`)
            .all(JSON.stringify(nameNormList)) as unknown as modelRag.IdatabaseQueryNodeType[];

        for (let a = 0; a < queryList.length; a++) {
            if (!resultObject[queryList[a].name_norm]) {
                resultObject[queryList[a].name_norm] = queryList[a].type;
            }
        }
    }

    return resultObject;
};

const logicEdgeRelevance = (mcpSessionId: string, buffer: Buffer): Record<number, number> => {
    const resultObject: Record<number, number> = {};

    if (database) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);

        const queryList = database
            .prepare(`SELECT edge_id, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${candidatePool}`)
            .all(buffer) as unknown as modelRag.IdatabaseQueryEdgeVec[];

        for (let a = 0; a < queryList.length; a++) {
            resultObject[queryList[a].edge_id] = queryList[a].distance;
        }
    }

    return resultObject;
};

const tableEdgeVecCreate = (mcpSessionId: string): boolean => {
    let isResult = false;

    const name = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);

    if (database) {
        database.exec(
            `CREATE VIRTUAL TABLE IF NOT EXISTS "${name}" USING vec0(id INTEGER PRIMARY KEY, embedding float[${vectorDimension}], +file_id INTEGER, +edge_id INTEGER, chunk_size=${vectorChunkSize})`
        );

        isResult = true;
    }

    return isResult;
};

const tableEdgeVecInsert = (mcpSessionId: string, fileId: number, edgeId: number, embedding: number[]): boolean => {
    let isResult = false;

    const tableName = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);

    if (database && fileId > 0) {
        database
            .prepare(`INSERT INTO "${tableName}" (embedding, file_id, edge_id) VALUES (?, CAST(? AS INTEGER), CAST(? AS INTEGER))`)
            .run(Buffer.from(new Float32Array(embedding).buffer), fileId, edgeId);

        isResult = true;
    }

    return isResult;
};

const logicEdgeVecMatch = (mcpSessionId: string, buffer: Buffer): number[] => {
    const resultList: number[] = [];

    if (database) {
        const tableName = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);

        const queryList = database
            .prepare(`SELECT edge_id, distance FROM "${tableName}" WHERE embedding MATCH ? ORDER BY distance LIMIT ${candidatePool}`)
            .all(buffer) as unknown as modelRag.IdatabaseQueryEdgeVec[];

        let distanceBest = -1;

        if (queryList.length > 0) {
            distanceBest = queryList[0].distance;
        }

        for (let a = 0; a < queryList.length && resultList.length < vecMatchLimit; a++) {
            if (queryList[a].distance <= distanceMax && queryList[a].distance <= distanceBest + marginRelative) {
                resultList.push(queryList[a].edge_id);
            }
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
        helperSrc.writeLog("Engine.ts - databaseCreate()", `Sqlite version: ${queryRow["sqlite_version"]} - Vec version: ${queryRow["vec_version"]}`);

        isResult = true;
    }

    return isResult;
};

export const databaseStore = (mcpSessionId: string, uniqueId: string, fileName: string): Promise<string> => {
    return instance.runWithContext(async () => {
        const storePrevious = queueStore;

        let storeNext: (value: unknown) => void = () => {};

        queueStore = new Promise((resolve) => {
            storeNext = resolve;
        });

        await storePrevious;

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

                const utilCitationChunkList = utilCitationChunk(fileReadStreamContent);

                const chunkList: string[] = [];

                for (let a = 0; a < utilCitationChunkList.length; a++) {
                    const chunkClean = utilCitationChunkList[a]
                        .replace(/https?:\/\/\S+/g, "")
                        .replace(/\s+/g, " ")
                        .trim();

                    if (chunkClean.length >= chunkLengthMin) {
                        chunkList.push(chunkClean);
                    }
                }

                let isFailed = chunkList.length === 0;

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
                                    tableCitationInsert(mcpSessionId, fileId, chunkBatchList[b], a + b, embeddingData.data[b].embedding);
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
                        const index = chunkIndex;

                        const chunk = chunkList[index];

                        chunkIndex++;

                        const graphData = await graphifyExtract(uniqueId, chunk);

                        if (Array.isArray(graphData.relationList) && Array.isArray(graphData.entityList)) {
                            if (database) {
                                database.exec("BEGIN");

                                for (let a = 0; a < graphData.entityList.length; a++) {
                                    const entity = graphData.entityList[a];

                                    tableNodeInsert(mcpSessionId, fileId, entity.name, entity.type, entity.description);
                                }

                                for (let a = 0; a < graphData.relationList.length; a++) {
                                    const relation = graphData.relationList[a];

                                    tableEdgeInsert(mcpSessionId, fileId, index, relation);
                                    tableNodeInsert(mcpSessionId, fileId, relation.source, "concept", "");
                                    tableNodeInsert(mcpSessionId, fileId, relation.target, "concept", "");
                                }

                                database.exec("COMMIT");
                            }
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

                if (!isFailed) {
                    const nodeBuildList = tableNodeSelectByFile(mcpSessionId, fileId);

                    for (let a = 0; a < nodeBuildList.length && !isFailed; a += batchLength) {
                        const nodeBatchList = nodeBuildList.slice(a, a + batchLength);

                        const nodeTextList: string[] = [];

                        for (let b = 0; b < nodeBatchList.length; b++) {
                            if (nodeBatchList[b].description === "") {
                                nodeTextList.push(nodeBatchList[b].name);
                            } else {
                                nodeTextList.push(`${nodeBatchList[b].name}: ${nodeBatchList[b].description}`);
                            }
                        }

                        const nodeEmbeddingData = await embedding(uniqueId, "document", nodeTextList);

                        if (Array.isArray(nodeEmbeddingData.data) && nodeEmbeddingData.data.length === nodeBatchList.length) {
                            if (database) {
                                database.exec("BEGIN");

                                for (let b = 0; b < nodeBatchList.length; b++) {
                                    tableNodeVecInsert(
                                        mcpSessionId,
                                        fileId,
                                        nodeBatchList[b].name,
                                        nodeBatchList[b].name_norm,
                                        nodeBatchList[b].description,
                                        nodeEmbeddingData.data[b].embedding
                                    );
                                }

                                database.exec("COMMIT");
                            }
                        } else {
                            isFailed = true;
                        }
                    }
                }

                if (!isFailed) {
                    const edgeBuildList = tableEdgeSelectByFile(mcpSessionId, fileId);

                    for (let a = 0; a < edgeBuildList.length && !isFailed; a += batchLength) {
                        const edgeBatchList = edgeBuildList.slice(a, a + batchLength);

                        const edgeTextList: string[] = [];

                        for (let b = 0; b < edgeBatchList.length; b++) {
                            edgeTextList.push(`${edgeBatchList[b].verb} ${edgeBatchList[b].keyword} ${edgeBatchList[b].description}`.trim());
                        }

                        const edgeEmbeddingData = await embedding(uniqueId, "document", edgeTextList);

                        if (Array.isArray(edgeEmbeddingData.data) && edgeEmbeddingData.data.length === edgeBatchList.length) {
                            if (database) {
                                database.exec("BEGIN");

                                for (let b = 0; b < edgeBatchList.length; b++) {
                                    tableEdgeVecInsert(mcpSessionId, fileId, edgeBatchList[b].id, edgeEmbeddingData.data[b].embedding);
                                }

                                database.exec("COMMIT");
                            }
                        } else {
                            isFailed = true;
                        }
                    }
                }

                if (isFailed) {
                    result = "ko";
                } else {
                    result = "ok";
                }
            } else {
                helperSrc.writeLog("Engine.ts - databaseStore() - fileReadStream()", fileReadStream.toString());
            }

            if (result === "ok") {
                const fileWriteStreamDone = await helperSrc.fileWriteStream(`${inputFolder}.done`, Buffer.from(""));

                if (typeof fileWriteStreamDone !== "boolean") {
                    helperSrc.writeLog("Engine.ts - databaseStore() - fileWriteStream(.done)", fileWriteStreamDone.toString());
                }
            } else {
                await databaseDelete(mcpSessionId, fileName);

                const fileWriteStreamFail = await helperSrc.fileWriteStream(`${inputFolder}.fail`, Buffer.from(""));

                if (typeof fileWriteStreamFail !== "boolean") {
                    helperSrc.writeLog("Engine.ts - databaseStore() - fileWriteStream(.fail)", fileWriteStreamFail.toString());
                }
            }

            await logout(uniqueId);
        }

        storeNext(undefined);

        return result;
    });
};

export const databaseSearch = (
    mcpSessionId: string,
    uniqueId: string,
    prompt: string,
    entityList: string[],
    themeList: string[]
): Promise<string> => {
    return instance.runWithContext(async () => {
        let citationList: modelRag.Icitation[] = [];
        const nodeList: modelRag.Inode[] = [];
        const graphList: modelRag.IgraphRelation[] = [];

        const tableNameRag = utilReplaceTableName(`${mcpSessionId}_rag`);
        const tableNameRagFile = utilReplaceTableName(`${mcpSessionId}_rag_file`);

        if (database) {
            const queryList = database.prepare(`SELECT id, name FROM "${tableNameRagFile}"`).all();
            const fileList = queryList as unknown as modelRag.Ifile[];

            const promptEmbeddingData = await embedding(uniqueId, "query", prompt);

            let promptBuffer: Buffer | undefined = undefined;

            if (Array.isArray(promptEmbeddingData.data) && promptEmbeddingData.data.length > 0 && promptEmbeddingData.data[0].embedding.length > 0) {
                promptBuffer = Buffer.from(new Float32Array(promptEmbeddingData.data[0].embedding).buffer);
            }

            let entityEmbeddingData = {} as modelRag.IapiEmbedding;
            let isEntityEmbedding = false;

            if (entityList.length > 0) {
                entityEmbeddingData = await embedding(uniqueId, "query", entityList);
                isEntityEmbedding = Array.isArray(entityEmbeddingData.data) && entityEmbeddingData.data.length === entityList.length;
            }

            if (entityList.length > 0) {
                for (let a = 0; a < entityList.length; a++) {
                    let citation: modelRag.Icitation | undefined = undefined;

                    if (isEntityEmbedding && entityEmbeddingData.data[a].embedding.length > 0) {
                        const entityBuffer = Buffer.from(new Float32Array(entityEmbeddingData.data[a].embedding).buffer);
                        const entityCitationList = logicCitationMatch(fileList, tableNameRag, 1, entityBuffer);

                        if (entityCitationList.length > 0) {
                            if (entityCitationList[0].distance <= distanceMax) {
                                citation = entityCitationList[0];
                            }
                        }
                    }

                    if (!citation) {
                        const ftsCitationList = logicFtsMatch(mcpSessionId, fileList, [entityList[a]]);

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
                if (promptBuffer) {
                    const vectorCitationList = logicCitationMatch(fileList, tableNameRag, candidatePool, promptBuffer);

                    if (vectorCitationList.length > 0) {
                        for (let a = 0; a < vectorCitationList.length && citationList.length < citationLimit; a++) {
                            if (vectorCitationList[a].distance <= distanceMax) {
                                citationList.push(vectorCitationList[a]);
                            }
                        }
                    }
                }
            }

            if (citationList.length > citationLimit) {
                citationList = citationList.slice(0, citationLimit);
            }

            const seedObject: Record<string, boolean> = {};
            const seedList: string[] = [];

            const graphCandidateList: modelRag.IgraphCandidate[] = [];

            if (entityList.length > 0) {
                for (let a = 0; a < entityList.length; a++) {
                    if (isEntityEmbedding && entityEmbeddingData.data[a].embedding.length > 0) {
                        const nodeBuffer = Buffer.from(new Float32Array(entityEmbeddingData.data[a].embedding).buffer);
                        const nodeMatchList = logicNodeVecMatch(mcpSessionId, nodeBuffer);

                        for (let b = 0; b < nodeMatchList.length; b++) {
                            if (!seedObject[nodeMatchList[b].name_norm]) {
                                seedObject[nodeMatchList[b].name_norm] = true;
                                seedList.push(nodeMatchList[b].name_norm);
                                nodeList.push({ name: nodeMatchList[b].name, type: "", description: nodeMatchList[b].description });
                            }
                        }
                    }
                }
            }

            const nodeTypeNormList: string[] = [];

            for (let a = 0; a < nodeList.length; a++) {
                nodeTypeNormList.push(utilNodeNormalize(nodeList[a].name));
            }

            const nodeTypeObject = logicNodeType(mcpSessionId, nodeTypeNormList);

            for (let a = 0; a < nodeList.length; a++) {
                const nameNorm = utilNodeNormalize(nodeList[a].name);

                if (nodeTypeObject[nameNorm]) {
                    nodeList[a].type = nodeTypeObject[nameNorm];
                }
            }

            const seedLikeList = logicNodeMatch(mcpSessionId, entityList);

            for (let a = 0; a < seedLikeList.length; a++) {
                if (!seedObject[seedLikeList[a]]) {
                    seedObject[seedLikeList[a]] = true;
                    seedList.push(seedLikeList[a]);
                }
            }

            if (themeList.length > 0) {
                const themeEmbeddingData = await embedding(uniqueId, "query", themeList);
                const isThemeEmbedding = Array.isArray(themeEmbeddingData.data) && themeEmbeddingData.data.length === themeList.length;

                const edgeIdObject: Record<number, boolean> = {};
                const edgeIdList: number[] = [];

                for (let a = 0; a < themeList.length; a++) {
                    if (isThemeEmbedding && themeEmbeddingData.data[a].embedding.length > 0) {
                        const edgeBuffer = Buffer.from(new Float32Array(themeEmbeddingData.data[a].embedding).buffer);
                        const edgeMatchList = logicEdgeVecMatch(mcpSessionId, edgeBuffer);

                        for (let b = 0; b < edgeMatchList.length; b++) {
                            if (!edgeIdObject[edgeMatchList[b]]) {
                                edgeIdObject[edgeMatchList[b]] = true;
                                edgeIdList.push(edgeMatchList[b]);
                            }
                        }
                    }
                }

                const edgeFullList = tableEdgeSelectByIdList(mcpSessionId, edgeIdList);

                for (let a = 0; a < edgeFullList.length; a++) {
                    const edgeFull = edgeFullList[a];

                    graphCandidateList.push({
                        source: edgeFull.source,
                        verb: edgeFull.verb,
                        target: edgeFull.target,
                        description: edgeFull.description,
                        chunk: tableCitationSelectByIndex(mcpSessionId, edgeFull.file_id, edgeFull.chunk_index),
                        edgeId: edgeFull.id,
                        sourceNorm: edgeFull.source_norm,
                        targetNorm: edgeFull.target_norm,
                        relevance: 0,
                        rank: 0
                    });

                    if (!seedObject[edgeFull.source_norm]) {
                        seedObject[edgeFull.source_norm] = true;
                        seedList.push(edgeFull.source_norm);
                    }

                    if (!seedObject[edgeFull.target_norm]) {
                        seedObject[edgeFull.target_norm] = true;
                        seedList.push(edgeFull.target_norm);
                    }
                }
            }

            if (seedList.length > 0) {
                const seedSlice = seedList.slice(0, seedLimit);
                const traverseList = logicEdgeTraverse(mcpSessionId, seedSlice);

                for (let a = 0; a < traverseList.length; a++) {
                    graphCandidateList.push(traverseList[a]);
                }
            }

            const graphSeenObject: Record<string, boolean> = {};
            const graphDedupList: modelRag.IgraphCandidate[] = [];
            const nodeNormObject: Record<string, boolean> = {};
            const nodeNormList: string[] = [];

            for (let a = 0; a < graphCandidateList.length; a++) {
                const candidate = graphCandidateList[a];
                const key = `${candidate.sourceNorm}|${candidate.verb}|${candidate.targetNorm}`;

                if (!graphSeenObject[key]) {
                    graphSeenObject[key] = true;
                    graphDedupList.push(candidate);

                    if (!nodeNormObject[candidate.sourceNorm]) {
                        nodeNormObject[candidate.sourceNorm] = true;
                        nodeNormList.push(candidate.sourceNorm);
                    }

                    if (!nodeNormObject[candidate.targetNorm]) {
                        nodeNormObject[candidate.targetNorm] = true;
                        nodeNormList.push(candidate.targetNorm);
                    }
                }
            }

            const degreeObject = logicNodeDegree(mcpSessionId, nodeNormList);

            let relevanceObject: Record<number, number> = {};

            if (promptBuffer) {
                relevanceObject = logicEdgeRelevance(mcpSessionId, promptBuffer);
            }

            for (let a = 0; a < graphDedupList.length; a++) {
                let degreeSource = 0;
                let degreeTarget = 0;

                if (degreeObject[graphDedupList[a].sourceNorm]) {
                    degreeSource = degreeObject[graphDedupList[a].sourceNorm];
                }

                if (degreeObject[graphDedupList[a].targetNorm]) {
                    degreeTarget = degreeObject[graphDedupList[a].targetNorm];
                }

                graphDedupList[a].rank = degreeSource + degreeTarget;

                let relevance = distanceMax + 1;

                if (relevanceObject[graphDedupList[a].edgeId] !== undefined) {
                    relevance = relevanceObject[graphDedupList[a].edgeId];
                }

                graphDedupList[a].relevance = relevance;
            }

            graphDedupList.sort((first, second) => {
                let result = 0;

                if (first.relevance !== second.relevance) {
                    result = first.relevance - second.relevance;
                } else {
                    result = second.rank - first.rank;
                }

                return result;
            });

            let graphTokenTotal = 0;

            for (let a = 0; a < graphDedupList.length; a++) {
                const candidate = graphDedupList[a];
                const tokenCount = utilTokenEstimate(`${candidate.source} ${candidate.verb} ${candidate.target} ${candidate.description}`);

                if (graphTokenTotal + tokenCount <= graphTokenBudget) {
                    graphTokenTotal += tokenCount;

                    graphList.push({
                        source: candidate.source,
                        verb: candidate.verb,
                        target: candidate.target,
                        description: candidate.description,
                        chunk: candidate.chunk
                    });
                }
            }
        }

        return JSON.stringify({ citationList, nodeList, graphList });
    });
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    let result = "ko";

    const tableNameRagEdgeVec = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);
    const tableNameRagEdge = utilReplaceTableName(`${mcpSessionId}_rag_edge`);
    const tableNameRagNodeVec = utilReplaceTableName(`${mcpSessionId}_rag_node_vec`);
    const tableNameRagNode = utilReplaceTableName(`${mcpSessionId}_rag_node`);
    const tableNameRagFts = utilReplaceTableName(`${mcpSessionId}_rag_fts`);
    const tableNameRag = utilReplaceTableName(`${mcpSessionId}_rag`);
    const tableNameRagFile = utilReplaceTableName(`${mcpSessionId}_rag_file`);

    if (database && fileName) {
        const queryRow = database.prepare(`SELECT id FROM "${tableNameRagFile}" WHERE name = ?`).get(fileName) as Record<string, unknown> | undefined;

        if (queryRow) {
            const fileId = queryRow["id"] as number;

            database.prepare(`DELETE FROM "${tableNameRagEdgeVec}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagEdge}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagNodeVec}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagNode}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagFts}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRag}" WHERE file_id = CAST(? AS INTEGER)`).run(fileId);
            database.prepare(`DELETE FROM "${tableNameRagFile}" WHERE id = CAST(? AS INTEGER)`).run(fileId);
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
    const isNodeVecCreate = tableNodeVecCreate(mcpSessionId);
    const isEdgeCreate = tableEdgeCreate(mcpSessionId);
    const isEdgeVecCreate = tableEdgeVecCreate(mcpSessionId);

    return isFileCreate && isCitationCreate && isFtsCreate && isNodeCreate && isNodeVecCreate && isEdgeCreate && isEdgeVecCreate;
};

export const tableDrop = (mcpSessionId: string): boolean => {
    let isResult = false;

    const tableNameRagEdgeVec = utilReplaceTableName(`${mcpSessionId}_rag_edge_vec`);
    const tableNameRagEdge = utilReplaceTableName(`${mcpSessionId}_rag_edge`);
    const tableNameRagNodeVec = utilReplaceTableName(`${mcpSessionId}_rag_node_vec`);
    const tableNameRagNode = utilReplaceTableName(`${mcpSessionId}_rag_node`);
    const tableNameRagFts = utilReplaceTableName(`${mcpSessionId}_rag_fts`);
    const tableNameRag = utilReplaceTableName(`${mcpSessionId}_rag`);
    const tableNameRagFile = utilReplaceTableName(`${mcpSessionId}_rag_file`);

    if (database) {
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagEdgeVec}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagEdge}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagNodeVec}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagNode}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagFts}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRag}"`);
        database.exec(`DROP TABLE IF EXISTS "${tableNameRagFile}"`);

        isResult = true;
    }

    return isResult;
};
