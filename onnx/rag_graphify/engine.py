import sys
sys.dont_write_bytecode = True

import os
import re
import json
import ssl
import urllib.request
import numpy
import sentencepiece
from sentencepiece import sentencepiece_model_pb2 as sentencepieceModel

# Source
sys.path.append(f"{os.path.dirname(__file__)}/..")

from helper import onnxSessionBuild
from database import Database

class Engine:
    def _utilEnvironment(self):
        locale = self.ENV_NAME.split("_")[-1]

        if locale == "" or locale == "local":
            locale = "jp"

        protocol = "https" if locale == "jp" else "http"

        return f"{protocol}://{self.DOMAIN}:1046"

    def _utilTokenEstimate(self, text):
        return (len(text) + 3) // 4

    def _utilReplaceTableName(self, name):
        return name.replace('"', '""')

    def _utilNodeNormalize(self, text):
        return re.sub(r"\s+", " ", text.strip().lower())

    def _logicFileSelect(self, database, mcpSessionId, fileName):
        result = 0

        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        queryRow = database.execute(f'SELECT id FROM "{name}" WHERE name = %s', (fileName,)).fetchone()

        if queryRow is not None:
            result = queryRow[0]

        return result

    def _logicCitationMatch(self, database, mcpSessionId, fileList, limit, queryVector):
        resultList = []

        fileNameObject = {}

        for a in range(len(fileList)):
            fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        queryRowList = database.execute(
            f'SELECT chunk, file_id, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, limit)
        ).fetchall()

        for a in range(len(queryRowList)):
            chunk = queryRowList[a][0]
            fileId = queryRowList[a][1]

            if chunk and fileNameObject.get(fileId) is not None:
                resultList.append({"fileName": fileNameObject[fileId], "chunk": chunk, "distance": float(queryRowList[a][2])})

        return resultList

    def _logicCitationMatchByFile(self, database, mcpSessionId, fileList, fileId, queryVector):
        resultList = []

        fileNameObject = {}

        for a in range(len(fileList)):
            fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        queryRowList = database.execute(
            f'SELECT chunk, file_id, embedding <-> %s AS distance FROM "{tableName}" WHERE file_id = %s ORDER BY distance LIMIT 1',
            (queryVector, fileId)
        ).fetchall()

        for a in range(len(queryRowList)):
            chunk = queryRowList[a][0]
            fileIdRow = queryRowList[a][1]

            if chunk and fileNameObject.get(fileIdRow) is not None:
                resultList.append({"fileName": fileNameObject[fileIdRow], "chunk": chunk, "distance": float(queryRowList[a][2])})

        return resultList

    def _logicFtsMatch(self, database, mcpSessionId, fileList, termList):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_fts")

        termCleanList = []
        seenObject = {}

        for a in range(len(termList)):
            term = termList[a].strip().lower()

            if len(term) >= self.termMin and seenObject.get(term) is None:
                seenObject[term] = True

                termCleanList.append(term)

        if len(termCleanList) > 0:
            fileNameObject = {}

            for a in range(len(fileList)):
                fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

            clauseList = []
            likeParamList = []

            for a in range(len(termCleanList)):
                clauseList.append("chunk ILIKE %s")
                likeParamList.append(f"%{termCleanList[a]}%")

            orderText = " ".join(termCleanList)

            queryList = database.execute(
                f'SELECT chunk, file_id FROM "{tableName}" WHERE {" OR ".join(clauseList)} ORDER BY similarity(chunk, %s) DESC LIMIT 1',
                tuple(likeParamList) + (orderText,)
            ).fetchall()

            for a in range(len(queryList)):
                chunk = queryList[a][0]
                fileId = queryList[a][1]

                if chunk and fileNameObject.get(fileId) is not None:
                    resultList.append({"fileName": fileNameObject[fileId], "chunk": chunk, "distance": 0})

        return resultList

    def _logicNodeSelectByFile(self, database, mcpSessionId, fileId):
        resultList = []

        if fileId > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            queryList = database.execute(f'SELECT name, name_norm, description FROM "{tableName}" WHERE file_id = %s', (fileId,)).fetchall()

            for a in range(len(queryList)):
                resultList.append({"name": queryList[a][0], "nameNorm": queryList[a][1], "description": queryList[a][2]})

        return resultList

    def _logicNodeMatch(self, database, mcpSessionId, termList):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

        likeList = []

        for a in range(len(termList)):
            term = self._utilNodeNormalize(termList[a])

            if len(term) >= self.termMin:
                likeList.append(f"%{term}%")

        if len(likeList) > 0:
            clauseList = []

            for a in range(len(likeList)):
                clauseList.append("name_norm LIKE %s")

            queryList = database.execute(f'SELECT name_norm FROM "{tableName}" WHERE {" OR ".join(clauseList)} GROUP BY name_norm ORDER BY length(name_norm) ASC', tuple(likeList)).fetchall()

            for a in range(len(queryList)):
                resultList.append(queryList[a][0])

        return resultList

    def _logicNodeDetail(self, database, mcpSessionId, nameNormList):
        resultList = []

        if len(nameNormList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormList)))

            queryList = database.execute(
                f'SELECT DISTINCT ON (name_norm) name, type, description FROM "{tableName}" WHERE name_norm IN ({placeholder}) ORDER BY name_norm, length(description) DESC',
                tuple(nameNormList)
            ).fetchall()

            for a in range(len(queryList)):
                resultList.append({"name": queryList[a][0], "type": queryList[a][1], "description": queryList[a][2]})

        return resultList

    def _logicNodeFileList(self, database, mcpSessionId, nameNormList):
        resultList = []

        if len(nameNormList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormList)))

            queryList = database.execute(
                f'SELECT DISTINCT file_id FROM "{tableName}" WHERE name_norm IN ({placeholder})',
                tuple(nameNormList)
            ).fetchall()

            for a in range(len(queryList)):
                resultList.append(queryList[a][0])

        return resultList

    def _logicNodeVecMatch(self, database, mcpSessionId, queryVector):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        queryRowList = database.execute(
            f'SELECT name, name_norm, description, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.candidatePool)
        ).fetchall()

        candidateList = []

        for a in range(len(queryRowList)):
            candidateList.append({"name": queryRowList[a][0], "nameNorm": queryRowList[a][1], "description": queryRowList[a][2], "distance": float(queryRowList[a][3])})

        distanceBest = -1

        if len(candidateList) > 0:
            distanceBest = candidateList[0]["distance"]

        for a in range(len(candidateList)):
            if len(resultList) >= self.vectorMatchLimit:
                break

            if candidateList[a]["distance"] <= self.distanceMax and candidateList[a]["distance"] <= distanceBest + self.marginRelative:
                resultList.append(candidateList[a])

        return resultList

    def _logicNodeType(self, database, mcpSessionId, nameNormList):
        resultObject = {}

        if len(nameNormList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormList)))

            queryList = database.execute(f'SELECT name_norm, type FROM "{tableName}" WHERE name_norm IN ({placeholder}) AND type != \'\'', tuple(nameNormList)).fetchall()

            for a in range(len(queryList)):
                if resultObject.get(queryList[a][0]) is None:
                    resultObject[queryList[a][0]] = queryList[a][1]

        return resultObject

    def _logicEdgeSelectByFile(self, database, mcpSessionId, fileId):
        resultList = []

        if fileId > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            queryList = database.execute(f'SELECT id, description FROM "{tableName}" WHERE file_id = %s', (fileId,)).fetchall()

            for a in range(len(queryList)):
                resultList.append({"id": queryList[a][0], "description": queryList[a][1]})

        return resultList

    def _logicEdgeVecMatch(self, database, mcpSessionId, queryVector):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        queryRowList = database.execute(
            f'SELECT edge_id, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.candidatePool)
        ).fetchall()

        candidateList = []

        for a in range(len(queryRowList)):
            candidateList.append({"edgeId": queryRowList[a][0], "distance": float(queryRowList[a][1])})

        distanceBest = -1

        if len(candidateList) > 0:
            distanceBest = candidateList[0]["distance"]

        for a in range(len(candidateList)):
            if len(resultList) >= self.vectorMatchLimit:
                break

            if candidateList[a]["distance"] <= self.distanceMaxEdge and candidateList[a]["distance"] <= distanceBest + self.marginRelative:
                resultList.append(candidateList[a]["edgeId"])

        return resultList

    def _logicEdgeSelectByIdList(self, database, mcpSessionId, idList):
        resultList = []

        if len(idList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            placeholder = ",".join("%s" for a in range(len(idList)))

            queryList = database.execute(
                f'SELECT id, source, target, description, source_norm, target_norm FROM "{tableName}" WHERE id IN ({placeholder})',
                tuple(idList)
            ).fetchall()

            for a in range(len(queryList)):
                query = queryList[a]

                resultList.append({"id": query[0], "source": query[1], "target": query[2], "description": query[3], "sourceNorm": query[4], "targetNorm": query[5]})

        return resultList

    def _logicEdgeRelevance(self, database, mcpSessionId, queryVector):
        resultObject = {}

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        queryRowList = database.execute(
            f'SELECT edge_id, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.candidatePool)
        ).fetchall()

        for a in range(len(queryRowList)):
            resultObject[queryRowList[a][0]] = float(queryRowList[a][1])

        return resultObject

    def _logicEdgeTraverse(self, database, mcpSessionId, seedList):
        resultList = []

        if len(seedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            limit = len(seedList) * self.graphLimitPerSeed

            placeholder = ",".join("%s" for a in range(len(seedList)))

            queryList = database.execute(
                f'SELECT DISTINCT ON (source_norm, target_norm) id, source, target, description, source_norm, target_norm FROM "{tableName}" '
                f'WHERE source_norm IN ({placeholder}) OR target_norm IN ({placeholder}) '
                f'ORDER BY source_norm, target_norm, id LIMIT {limit}',
                tuple(seedList) + tuple(seedList)
            ).fetchall()

            for a in range(len(queryList)):
                query = queryList[a]

                resultList.append({
                    "source": query[1],
                    "target": query[2],
                    "description": query[3],
                    "edgeId": query[0],
                    "sourceNorm": query[4],
                    "targetNorm": query[5],
                    "relevance": 0,
                    "rank": 0
                })

        return resultList

    def _logicNodeDegree(self, database, mcpSessionId, nameNormList):
        resultObject = {}

        if len(nameNormList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            placeholder = ",".join("%s" for a in range(len(nameNormList)))

            queryList = database.execute(
                f'SELECT node, COUNT(*) AS degree FROM (SELECT source_norm AS node FROM "{tableName}" UNION ALL SELECT target_norm AS node FROM "{tableName}") AS nodeUnion WHERE node IN ({placeholder}) GROUP BY node',
                tuple(nameNormList)
            ).fetchall()

            for a in range(len(queryList)):
                resultObject[queryList[a][0]] = queryList[a][1]

        return resultObject

    def _tableFileCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)')

    def _tableFileInsert(self, database, mcpSessionId, fileName):
        result = 0

        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        queryRow = database.execute(f'INSERT INTO "{name}" (name) VALUES (%s) ON CONFLICT (name) DO NOTHING RETURNING id', (fileName,)).fetchone()

        if queryRow is not None:
            result = queryRow[0]

        return result

    def _tableCitationCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, chunk TEXT NOT NULL, embedding vector({self.vectorDimension}))')

    def _tableCitationInsert(self, database, mcpSessionId, fileId, chunk, embeddingList):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{name}" (file_id, chunk, embedding) VALUES (%s, %s, %s)', (fileId, chunk, embedding))

    def _tableFtsCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_fts")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, chunk TEXT NOT NULL)')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_chunk" ON "{name}" USING gin (chunk gin_trgm_ops)')

    def _tableFtsInsert(self, database, mcpSessionId, fileId, chunk):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_fts")

        if fileId > 0:
            database.execute(f'INSERT INTO "{name}" (chunk, file_id) VALUES (%s, %s)', (chunk, fileId))

    def _tableNodeCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, name TEXT NOT NULL, name_norm TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, UNIQUE (file_id, name_norm))')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_norm" ON "{name}" USING gin (name_norm gin_trgm_ops)')

    def _tableNodeInsert(self, database, mcpSessionId, fileId, name, type, description):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

        if fileId > 0:
            database.execute(
                f'INSERT INTO "{tableName}" (file_id, name, name_norm, type, description) VALUES (%s, %s, %s, %s, %s) '
                f'ON CONFLICT (file_id, name_norm) DO UPDATE SET description = excluded.description WHERE "{tableName}".description = \'\'',
                (fileId, name, self._utilNodeNormalize(name), type, description)
            )

    def _tableNodeVecCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, name TEXT NOT NULL, name_norm TEXT NOT NULL, description TEXT NOT NULL, embedding vector({self.vectorDimension}))')

    def _tableNodeVecInsert(self, database, mcpSessionId, fileId, name, nameNorm, description, embeddingList):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{tableName}" (file_id, name, name_norm, description, embedding) VALUES (%s, %s, %s, %s, %s)', (fileId, name, nameNorm, description, embedding))

    def _tableEdgeCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, source TEXT NOT NULL, target TEXT NOT NULL, description TEXT NOT NULL, source_norm TEXT NOT NULL, target_norm TEXT NOT NULL)')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_source" ON "{name}" (source_norm)')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_target" ON "{name}" (target_norm)')

    def _tableEdgeInsert(self, database, mcpSessionId, fileId, relation):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

        if fileId > 0:
            database.execute(
                f'INSERT INTO "{name}" (file_id, source, target, description, source_norm, target_norm) VALUES (%s, %s, %s, %s, %s, %s)',
                (fileId, relation["source"], relation["target"], relation["description"], self._utilNodeNormalize(relation["source"]), self._utilNodeNormalize(relation["target"]))
            )

    def _tableEdgeVecCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, edge_id INTEGER, embedding vector({self.vectorDimension}))')

    def _tableEdgeVecInsert(self, database, mcpSessionId, fileId, edgeId, embeddingList):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{tableName}" (file_id, edge_id, embedding) VALUES (%s, %s, %s)', (fileId, edgeId, embedding))

    def _tableCreate(self, database, mcpSessionId):
        database.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (mcpSessionId,))

        self._tableFileCreate(database, mcpSessionId)
        self._tableCitationCreate(database, mcpSessionId)
        self._tableFtsCreate(database, mcpSessionId)
        self._tableNodeCreate(database, mcpSessionId)
        self._tableNodeVecCreate(database, mcpSessionId)
        self._tableEdgeCreate(database, mcpSessionId)
        self._tableEdgeVecCreate(database, mcpSessionId)

        database.commit()

    def _tableDelete(self, database, mcpSessionId, fileName):
        tableNameRagEdgeVec = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")
        tableNameRagEdge = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")
        tableNameRagNodeVec = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")
        tableNameRagNode = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")
        tableNameRagFts = self._utilReplaceTableName(f"{mcpSessionId}_rag_fts")
        tableNameRag = self._utilReplaceTableName(f"{mcpSessionId}_rag")
        tableNameRagFile = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        existsRow = database.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = %s)", (f"{mcpSessionId}_rag_file",)).fetchone()

        if fileName != "" and existsRow[0]:
            queryRow = database.execute(f'SELECT id FROM "{tableNameRagFile}" WHERE name = %s', (fileName,)).fetchone()

            if queryRow is not None:
                fileId = queryRow[0]

                database.execute(f'DELETE FROM "{tableNameRagEdgeVec}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagEdge}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagNodeVec}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagNode}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagFts}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRag}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagFile}" WHERE id = %s', (fileId,))

                database.commit()

    def _wordSplit(self, text):
        resultList = []

        for match in re.finditer(r"\w+(?:[-_]\w+)*|[^\w\s]", text):
            resultList.append({"text": match.group(0), "start": match.start(), "end": match.end()})

        return resultList

    def _tokenizeWord(self, text):
        resultList = []

        for segment in re.findall(r"\d|\D+", text):
            for tokenId in self.sentencepiece.encode(segment, out_type=int):
                resultList.append(tokenId)

        return resultList

    def _predict(self, text):
        resultList = []

        wordList = self._wordSplit(text)

        if len(wordList) > self.maxLength:
            wordList = wordList[0:self.maxLength]

        numWords = len(wordList)

        if numWords == 0:
            return resultList

        inputIdList = [self.clsId]
        wordsMaskList = [0]

        for a in range(len(self.typeAllowList)):
            inputIdList.append(self.entId)
            wordsMaskList.append(0)

            for tokenId in self._tokenizeWord(self.typeAllowList[a]):
                inputIdList.append(tokenId)
                wordsMaskList.append(0)

        inputIdList.append(self.sepId)
        wordsMaskList.append(0)

        for a in range(numWords):
            subwordList = self._tokenizeWord(wordList[a]["text"])

            for b in range(len(subwordList)):
                inputIdList.append(subwordList[b])
                wordsMaskList.append(a + 1 if b == 0 else 0)

        inputIdList.append(self.eosId)
        wordsMaskList.append(0)

        inputIds = numpy.array([inputIdList], dtype=numpy.int64)
        attentionMask = numpy.ones((1, len(inputIdList)), dtype=numpy.int64)
        wordsMask = numpy.array([wordsMaskList], dtype=numpy.int64)
        textLengths = numpy.array([[numWords]], dtype=numpy.int64)

        spanIdxList = []
        spanMaskList = []

        for a in range(numWords):
            for b in range(self.maxWidth):
                end = a + b

                spanIdxList.append([a, end])
                spanMaskList.append(end <= numWords - 1)

        spanIdx = numpy.array([spanIdxList], dtype=numpy.int64)
        spanMask = numpy.array([spanMaskList], dtype=bool)

        feedObject = {
            "input_ids": inputIds,
            "attention_mask": attentionMask,
            "words_mask": wordsMask,
            "text_lengths": textLengths,
            "span_idx": spanIdx,
            "span_mask": spanMask
        }

        logits = self.session.run(["logits"], feedObject)[0]

        probability = 1.0 / (1.0 + numpy.exp(-logits[0]))

        candidateList = []

        for a in range(numWords):
            for b in range(self.maxWidth):
                end = a + b

                if end > numWords - 1:
                    continue

                for c in range(len(self.typeAllowList)):
                    score = float(probability[a][b][c])

                    if score > self.scoreMin:
                        candidateList.append({
                            "wordStart": a,
                            "wordEnd": end,
                            "label": self.typeAllowList[c],
                            "score": score
                        })

        candidateList.sort(key=lambda candidate: candidate["score"], reverse=True)

        takenList = []

        for a in range(len(candidateList)):
            candidate = candidateList[a]

            isOverlap = False

            for b in range(len(takenList)):
                taken = takenList[b]

                if candidate["wordStart"] <= taken["wordEnd"] and taken["wordStart"] <= candidate["wordEnd"]:
                    isOverlap = True

                    break

            if not isOverlap:
                takenList.append(candidate)

                charStart = wordList[candidate["wordStart"]]["start"]
                charEnd = wordList[candidate["wordEnd"]]["end"]

                resultList.append({
                    "start": charStart,
                    "end": charEnd,
                    "text": text[charStart:charEnd],
                    "label": candidate["label"],
                    "score": candidate["score"]
                })

        resultList.sort(key=lambda entity: entity["start"])

        return resultList

    def _sentenceSplit(self, text):
        resultList = []

        cursor = 0

        for match in re.finditer(r"[^.!?\n]+[.!?\n]?", text):
            sentence = match.group(0).strip()

            if sentence != "":
                resultList.append({"text": sentence, "start": match.start(), "end": match.end()})

            cursor = match.end()

        if cursor < len(text):
            rest = text[cursor:].strip()

            if rest != "":
                resultList.append({"text": rest, "start": cursor, "end": len(text)})

        return resultList

    def _entity(self, entityPredictList, sentenceList):
        resultList = []

        seenObject = {}

        for a in range(len(entityPredictList)):
            entity = entityPredictList[a]

            name = entity["text"].strip()

            if len(name) < self.nameMinLength or name.lower().find("http") != -1:
                continue

            nameNorm = self._utilNodeNormalize(name)

            entity["nameNorm"] = nameNorm

            description = ""

            for b in range(len(sentenceList)):
                if entity["start"] >= sentenceList[b]["start"] and entity["start"] < sentenceList[b]["end"]:
                    description = sentenceList[b]["text"]

                    break

            if seenObject.get(nameNorm) is None:
                seenObject[nameNorm] = True

                resultList.append({"name": name, "type": entity["label"], "description": description})

        return resultList

    def _relation(self, entityPredictList, sentenceList):
        resultList = []

        seenObject = {}

        for a in range(len(sentenceList)):
            sentence = sentenceList[a]

            sentenceEntityList = []

            for b in range(len(entityPredictList)):
                entity = entityPredictList[b]

                if entity.get("nameNorm") is None:
                    continue

                if entity["start"] >= sentence["start"] and entity["start"] < sentence["end"]:
                    sentenceEntityList.append(entity)

            sentenceEntityList.sort(key=lambda entity: entity["start"])

            for b in range(len(sentenceEntityList) - 1):
                source = sentenceEntityList[b]
                target = sentenceEntityList[b + 1]

                if source["nameNorm"] == target["nameNorm"]:
                    continue

                gap = target["start"] - source["end"]

                if gap < 0 or gap > self.relationGapMax:
                    continue

                key = source["nameNorm"] + "|" + target["nameNorm"]

                if seenObject.get(key) is None:
                    seenObject[key] = True

                    resultList.append({
                        "source": source["text"].strip(),
                        "target": target["text"].strip(),
                        "description": sentence["text"]
                    })

        return resultList

    def _chunk(self, text):
        resultList = []

        chunkText = ""

        for word in text.split():
            if chunkText == "":
                chunkText = word
            elif len(chunkText) + len(word) + 1 > self.chunkLength:
                resultList.append(chunkText)

                chunkText = word
            else:
                chunkText = f"{chunkText} {word}"

        if chunkText != "":
            resultList.append(chunkText)

        cleanList = []

        for a in range(len(resultList)):
            clean = re.sub(r"https?://\S+", "", resultList[a])
            clean = re.sub(r"\s+", " ", clean).strip()

            if len(clean) >= self.chunkLengthMin:
                cleanList.append(clean)

        return cleanList

    def embedding(self, cookie, uniqueId, mode, text):
        inputList = text if isinstance(text, list) else [text]

        inputPrefixList = []

        for a in range(len(inputList)):
            if mode == "document":
                inputPrefixList.append(f"title: none | text: {inputList[a]}")
            else:
                inputPrefixList.append(f"task: search result | query: {inputList[a]}")

        body = json.dumps({"input": inputPrefixList}).encode("utf-8")

        request = urllib.request.Request(f"{self.urlApi}/api/embedding", data=body, method="POST")

        request.add_header("Content-Type", "application/json")
        request.add_header("Authorization", f"Bearer {uniqueId}")

        if cookie != "":
            request.add_header("Cookie", cookie)

        response = urllib.request.urlopen(request, context=self.sslContext)

        data = json.loads(response.read().decode("utf-8"))

        stdout = json.loads(data["response"]["stdout"])

        return stdout

    def process(self, text):
        chunkList = self._chunk(text)

        entitySeenObject = {}
        relationSeenObject = {}

        entityList = []
        relationList = []

        for a in range(len(chunkList)):
            chunk = chunkList[a]

            entityPredictList = self._predict(chunk)

            sentenceList = self._sentenceSplit(chunk)

            chunkEntityList = self._entity(entityPredictList, sentenceList)
            chunkRelationList = self._relation(entityPredictList, sentenceList)

            for b in range(len(chunkEntityList)):
                nameNorm = self._utilNodeNormalize(chunkEntityList[b]["name"])

                if entitySeenObject.get(nameNorm) is None:
                    entitySeenObject[nameNorm] = True

                    entityList.append(chunkEntityList[b])

            for b in range(len(chunkRelationList)):
                relation = chunkRelationList[b]

                key = self._utilNodeNormalize(relation["source"]) + "|" + self._utilNodeNormalize(relation["target"])

                if relationSeenObject.get(key) is None:
                    relationSeenObject[key] = True

                    relationList.append(relation)

        result = {
            "entityList": entityList,
            "relationList": relationList
        }

        return result

    def _storeCitation(self, database, cookie, mcpSessionId, uniqueId, fileId, chunkList):
        isFailed = False

        for a in range(0, len(chunkList), self.batchLength):
            chunkBatchList = chunkList[a:a + self.batchLength]

            embeddingData = self.embedding(cookie, uniqueId, "document", chunkBatchList)

            if isinstance(embeddingData.get("data"), list) and len(embeddingData["data"]) == len(chunkBatchList):
                for b in range(len(chunkBatchList)):
                    self._tableCitationInsert(database, mcpSessionId, fileId, chunkBatchList[b], embeddingData["data"][b]["embedding"])
                    self._tableFtsInsert(database, mcpSessionId, fileId, chunkBatchList[b])

                database.commit()
            else:
                isFailed = True

                break

        return isFailed

    def _storeRelation(self, database, mcpSessionId, fileId, chunkList):
        for a in range(len(chunkList)):
            graphData = self.process(chunkList[a])

            for b in range(len(graphData["entityList"])):
                entity = graphData["entityList"][b]

                self._tableNodeInsert(database, mcpSessionId, fileId, entity["name"], entity["type"], entity["description"])

            for b in range(len(graphData["relationList"])):
                relation = graphData["relationList"][b]

                self._tableEdgeInsert(database, mcpSessionId, fileId, relation)
                self._tableNodeInsert(database, mcpSessionId, fileId, relation["source"], "concept", "")
                self._tableNodeInsert(database, mcpSessionId, fileId, relation["target"], "concept", "")

            database.commit()

    def _storeNodeVector(self, database, cookie, mcpSessionId, uniqueId, fileId):
        isFailed = False

        nodeBuildList = self._logicNodeSelectByFile(database, mcpSessionId, fileId)

        for a in range(0, len(nodeBuildList), self.batchLength):
            if isFailed:
                break

            nodeBatchList = nodeBuildList[a:a + self.batchLength]

            nodeTextList = []

            for b in range(len(nodeBatchList)):
                if nodeBatchList[b]["description"] == "":
                    nodeTextList.append(nodeBatchList[b]["name"])
                else:
                    nodeTextList.append(f"{nodeBatchList[b]['name']}: {nodeBatchList[b]['description']}")

            nodeEmbeddingData = self.embedding(cookie, uniqueId, "document", nodeTextList)

            if isinstance(nodeEmbeddingData.get("data"), list) and len(nodeEmbeddingData["data"]) == len(nodeBatchList):
                for b in range(len(nodeBatchList)):
                    self._tableNodeVecInsert(database, mcpSessionId, fileId, nodeBatchList[b]["name"], nodeBatchList[b]["nameNorm"], nodeBatchList[b]["description"], nodeEmbeddingData["data"][b]["embedding"])

                database.commit()
            else:
                isFailed = True

        return isFailed

    def _storeEdgeVector(self, database, cookie, mcpSessionId, uniqueId, fileId):
        isFailed = False

        edgeBuildList = self._logicEdgeSelectByFile(database, mcpSessionId, fileId)

        for a in range(0, len(edgeBuildList), self.batchLength):
            if isFailed:
                break

            edgeBatchList = edgeBuildList[a:a + self.batchLength]

            edgeTextList = []

            for b in range(len(edgeBatchList)):
                edgeTextList.append(f"{edgeBatchList[b]['description']}".strip())

            edgeEmbeddingData = self.embedding(cookie, uniqueId, "document", edgeTextList)

            if isinstance(edgeEmbeddingData.get("data"), list) and len(edgeEmbeddingData["data"]) == len(edgeBatchList):
                for b in range(len(edgeBatchList)):
                    self._tableEdgeVecInsert(database, mcpSessionId, fileId, edgeBatchList[b]["id"], edgeEmbeddingData["data"][b]["embedding"])

                database.commit()
            else:
                isFailed = True

        return isFailed

    def store(self, cookie, mcpSessionId, uniqueId, fileName):
        result = "ko"

        database = Database()

        self._tableCreate(database, mcpSessionId)

        fileIdStored = self._logicFileSelect(database, mcpSessionId, fileName)

        if fileIdStored > 0:
            result = "ok"
        else:
            fileId = self._tableFileInsert(database, mcpSessionId, fileName)

            database.commit()

            fileNameOnly = fileName.split("/")[-1]
            baseName = re.sub(r"\.[^/.]+$", "", fileNameOnly.strip())

            inputFolder = f"{self.pathFileInput}{mcpSessionId}/document/{baseName}/"

            pathResult = f"{inputFolder}result.md"

            if os.path.exists(pathResult):
                with open(pathResult, "r", encoding="utf-8") as file:
                    fileContent = file.read()

                chunkList = self._chunk(fileContent)

                isFailed = len(chunkList) == 0

                if not isFailed:
                    isFailed = self._storeCitation(database, cookie, mcpSessionId, uniqueId, fileId, chunkList)

                if not isFailed:
                    self._storeRelation(database, mcpSessionId, fileId, chunkList)

                if not isFailed:
                    isFailed = self._storeNodeVector(database, cookie, mcpSessionId, uniqueId, fileId)

                if not isFailed:
                    isFailed = self._storeEdgeVector(database, cookie, mcpSessionId, uniqueId, fileId)

                if isFailed:
                    result = "ko"
                else:
                    result = "ok"

            if result == "ok":
                with open(f"{inputFolder}.rag_done", "w") as file:
                    file.write("")
            else:
                self._tableDelete(database, mcpSessionId, fileName)

                if os.path.isdir(inputFolder):
                    with open(f"{inputFolder}.fail", "w") as file:
                        file.write("")

        database.close()

        return result

    def _searchCitation(self, database, mcpSessionId, fileList, promptVector, entityFileIdList):
        citationList = []

        isCitationSemantic = False

        seenObject = {}

        if promptVector is not None:
            promptCitationList = self._logicCitationMatch(database, mcpSessionId, fileList, self.candidatePool, promptVector)

            distanceBest = -1

            if len(promptCitationList) > 0:
                distanceBest = promptCitationList[0]["distance"]

            for a in range(len(promptCitationList)):
                candidate = promptCitationList[a]

                if candidate["distance"] <= self.distanceMax and candidate["distance"] <= distanceBest + self.marginGlobal:
                    key = candidate["fileName"] + "|" + candidate["chunk"]

                    if seenObject.get(key) is None:
                        seenObject[key] = True

                        citationList.append(candidate)

                        isCitationSemantic = True

        if promptVector is not None:
            for a in range(len(entityFileIdList)):
                fileCitationList = self._logicCitationMatchByFile(database, mcpSessionId, fileList, entityFileIdList[a], promptVector)

                for b in range(len(fileCitationList)):
                    candidate = fileCitationList[b]

                    key = candidate["fileName"] + "|" + candidate["chunk"]

                    if seenObject.get(key) is None:
                        seenObject[key] = True

                        citationList.append(candidate)

        distanceGlobalBest = -1

        for a in range(len(citationList)):
            if distanceGlobalBest < 0 or citationList[a]["distance"] < distanceGlobalBest:
                distanceGlobalBest = citationList[a]["distance"]

        filteredList = []

        for a in range(len(citationList)):
            if citationList[a]["distance"] <= distanceGlobalBest + self.marginGlobal:
                filteredList.append(citationList[a])

        filteredList.sort(key=lambda citation: citation["distance"])

        citationList = filteredList

        return citationList, isCitationSemantic

    def _searchSeed(self, database, mcpSessionId, entityList, entityEmbeddingData, isEntityEmbedding):
        seedObject = {}
        seedList = []

        if len(entityList) > 0:
            for a in range(len(entityList)):
                if isEntityEmbedding and len(entityEmbeddingData["data"][a]["embedding"]) > 0:
                    nodeVector = numpy.array(entityEmbeddingData["data"][a]["embedding"], dtype=numpy.float32)
                    nodeMatchList = self._logicNodeVecMatch(database, mcpSessionId, nodeVector)

                    for b in range(len(nodeMatchList)):
                        if seedObject.get(nodeMatchList[b]["nameNorm"]) is None:
                            seedObject[nodeMatchList[b]["nameNorm"]] = True
                            seedList.append(nodeMatchList[b]["nameNorm"])

        seedLikeList = self._logicNodeMatch(database, mcpSessionId, entityList)

        for a in range(len(seedLikeList)):
            if seedObject.get(seedLikeList[a]) is None:
                seedObject[seedLikeList[a]] = True
                seedList.append(seedLikeList[a])

        nodeList = self._logicNodeDetail(database, mcpSessionId, seedList)

        entityFileIdList = self._logicNodeFileList(database, mcpSessionId, seedList)

        return nodeList, seedObject, seedList, entityFileIdList

    def _searchTheme(self, database, cookie, mcpSessionId, uniqueId, themeList, seedObject, seedList):
        graphCandidateList = []

        if len(themeList) > 0:
            themeEmbeddingData = self.embedding(cookie, uniqueId, "query", themeList)
            isThemeEmbedding = isinstance(themeEmbeddingData.get("data"), list) and len(themeEmbeddingData["data"]) == len(themeList)

            edgeIdObject = {}
            edgeIdList = []

            for a in range(len(themeList)):
                if isThemeEmbedding and len(themeEmbeddingData["data"][a]["embedding"]) > 0:
                    edgeVector = numpy.array(themeEmbeddingData["data"][a]["embedding"], dtype=numpy.float32)
                    edgeMatchList = self._logicEdgeVecMatch(database, mcpSessionId, edgeVector)

                    for b in range(len(edgeMatchList)):
                        if edgeIdObject.get(edgeMatchList[b]) is None:
                            edgeIdObject[edgeMatchList[b]] = True
                            edgeIdList.append(edgeMatchList[b])

            edgeFullList = self._logicEdgeSelectByIdList(database, mcpSessionId, edgeIdList)

            for a in range(len(edgeFullList)):
                edgeFull = edgeFullList[a]

                graphCandidateList.append({
                    "source": edgeFull["source"],
                    "target": edgeFull["target"],
                    "description": edgeFull["description"],
                    "edgeId": edgeFull["id"],
                    "sourceNorm": edgeFull["sourceNorm"],
                    "targetNorm": edgeFull["targetNorm"],
                    "relevance": 0,
                    "rank": 0
                })

                if seedObject.get(edgeFull["sourceNorm"]) is None:
                    seedObject[edgeFull["sourceNorm"]] = True
                    seedList.append(edgeFull["sourceNorm"])

                if seedObject.get(edgeFull["targetNorm"]) is None:
                    seedObject[edgeFull["targetNorm"]] = True
                    seedList.append(edgeFull["targetNorm"])

        return graphCandidateList

    def _searchGraph(self, database, mcpSessionId, graphCandidateList, promptVector):
        graphList = []

        graphSeenObject = {}
        graphDedupList = []
        nodeNormObject = {}
        nodeNormList = []

        for a in range(len(graphCandidateList)):
            candidate = graphCandidateList[a]

            key = f"{candidate['sourceNorm']}|{candidate['targetNorm']}"

            if graphSeenObject.get(key) is None:
                graphSeenObject[key] = True
                graphDedupList.append(candidate)

                if nodeNormObject.get(candidate["sourceNorm"]) is None:
                    nodeNormObject[candidate["sourceNorm"]] = True
                    nodeNormList.append(candidate["sourceNorm"])

                if nodeNormObject.get(candidate["targetNorm"]) is None:
                    nodeNormObject[candidate["targetNorm"]] = True
                    nodeNormList.append(candidate["targetNorm"])

        degreeObject = self._logicNodeDegree(database, mcpSessionId, nodeNormList)

        relevanceObject = {}

        if promptVector is not None:
            relevanceObject = self._logicEdgeRelevance(database, mcpSessionId, promptVector)

        for a in range(len(graphDedupList)):
            degreeSource = 0
            degreeTarget = 0

            if degreeObject.get(graphDedupList[a]["sourceNorm"]) is not None:
                degreeSource = degreeObject[graphDedupList[a]["sourceNorm"]]

            if degreeObject.get(graphDedupList[a]["targetNorm"]) is not None:
                degreeTarget = degreeObject[graphDedupList[a]["targetNorm"]]

            graphDedupList[a]["rank"] = degreeSource + degreeTarget

            relevance = self.distanceMaxEdge + 1

            if relevanceObject.get(graphDedupList[a]["edgeId"]) is not None:
                relevance = relevanceObject[graphDedupList[a]["edgeId"]]

            graphDedupList[a]["relevance"] = relevance

        graphDedupList.sort(key=lambda candidate: (candidate["relevance"], -candidate["rank"]))

        relevanceBest = -1

        for a in range(len(graphDedupList)):
            if graphDedupList[a]["relevance"] <= self.distanceMaxEdge:
                relevanceBest = graphDedupList[a]["relevance"]

                break

        graphTokenTotal = 0

        for a in range(len(graphDedupList)):
            candidate = graphDedupList[a]

            if relevanceBest < 0:
                break

            if candidate["relevance"] > self.distanceMaxEdge or candidate["relevance"] > relevanceBest + self.marginGlobal:
                continue

            tokenCount = self._utilTokenEstimate(f"{candidate['source']} {candidate['target']} {candidate['description']}")

            if graphTokenTotal + tokenCount <= self.graphTokenBudget:
                graphTokenTotal += tokenCount

                graphList.append({
                    "source": candidate["source"],
                    "target": candidate["target"],
                    "description": candidate["description"]
                })

        return graphList

    def search(self, cookie, mcpSessionId, uniqueId, prompt, entityList, themeList):
        result = {"citationList": [], "nodeList": [], "graphList": []}

        database = Database()

        tableNameRagFile = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        existsRow = database.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = %s)", (f"{mcpSessionId}_rag_file",)).fetchone()

        if existsRow[0]:
            fileQueryList = database.execute(f'SELECT id, name FROM "{tableNameRagFile}"').fetchall()

            fileList = []

            for a in range(len(fileQueryList)):
                fileList.append({"id": fileQueryList[a][0], "name": fileQueryList[a][1]})

            promptEmbeddingData = self.embedding(cookie, uniqueId, "query", prompt)

            promptVector = None

            if isinstance(promptEmbeddingData.get("data"), list) and len(promptEmbeddingData["data"]) > 0 and len(promptEmbeddingData["data"][0]["embedding"]) > 0:
                promptVector = numpy.array(promptEmbeddingData["data"][0]["embedding"], dtype=numpy.float32)

            entityEmbeddingData = {}
            isEntityEmbedding = False

            if len(entityList) > 0:
                entityEmbeddingData = self.embedding(cookie, uniqueId, "query", entityList)
                isEntityEmbedding = isinstance(entityEmbeddingData.get("data"), list) and len(entityEmbeddingData["data"]) == len(entityList)

            nodeList, seedObject, seedList, entityFileIdList = self._searchSeed(database, mcpSessionId, entityList, entityEmbeddingData, isEntityEmbedding)

            citationList, isCitationSemantic = self._searchCitation(database, mcpSessionId, fileList, promptVector, entityFileIdList)

            isInDomain = isCitationSemantic or len(seedList) > 0

            if isInDomain:
                graphCandidateList = self._searchTheme(database, cookie, mcpSessionId, uniqueId, themeList, seedObject, seedList)

                if len(seedList) > 0:
                    seedSlice = seedList[0:self.seedLimit]
                    traverseList = self._logicEdgeTraverse(database, mcpSessionId, seedSlice)

                    for a in range(len(traverseList)):
                        graphCandidateList.append(traverseList[a])

                graphList = self._searchGraph(database, mcpSessionId, graphCandidateList, promptVector)

                result = {
                    "citationList": citationList,
                    "nodeList": nodeList,
                    "graphList": graphList
                }

        database.close()

        return result

    def delete(self, mcpSessionId, fileName):
        result = "ko"

        database = Database()

        self._tableDelete(database, mcpSessionId, fileName)

        if fileName != "":
            result = "ok"

        database.close()

        return result

    def __init__(self):
        self.ENV_NAME = os.environ.get("ENV_NAME", "")
        self.DOMAIN = os.environ.get("DOMAIN", "")
        PATH_ROOT = os.environ.get("PATH_ROOT", "")
        self.PATH_CERTIFICATE_PEM = os.environ.get("MS_M_PATH_CERTIFICATE_PEM", "")
        PATH_FILE = os.environ.get("MS_M_PATH_FILE", "")

        self.pathModel = f"{os.path.dirname(__file__)}/model/"
        self.pathFileInput = f"{PATH_ROOT}{PATH_FILE}input/"
        self.urlApi = self._utilEnvironment()
        self.sslContext = ssl.create_default_context(cafile=self.PATH_CERTIFICATE_PEM)

        self.typeAllowList = ["person", "organization", "place", "category", "event"]
        self.chunkLength = 1000
        self.chunkLengthMin = 100
        self.nameMinLength = 3
        self.scoreMin = 0.4
        self.relationGapMax = 60

        self.distanceMax = 1.00
        self.distanceMaxEdge = 1.20
        self.marginRelative = 0.1
        self.marginGlobal = 0.15
        self.vectorDimension = 768
        self.vectorMatchLimit = 8
        self.graphLimitPerSeed = 32
        self.graphTokenBudget = 2000
        self.batchLength = 32
        self.candidatePool = 256
        self.citationLimit = 4
        self.seedLimit = 24
        self.termMin = 3

        self.entId = 250103
        self.sepId = 250104
        self.clsId = 1
        self.eosId = 2
        self.maxWidth = 12
        self.maxLength = 384

        proto = sentencepieceModel.ModelProto()

        with open(f"{self.pathModel}spm.model", "rb") as file:
            proto.ParseFromString(file.read())

        proto.normalizer_spec.add_dummy_prefix = False

        self.sentencepiece = sentencepiece.SentencePieceProcessor()
        self.sentencepiece.LoadFromSerializedProto(proto.SerializeToString())

        self.session = onnxSessionBuild(f"{self.pathModel}fp32.onnx")

        database = Database(True)
        database.close()
