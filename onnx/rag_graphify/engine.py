import sys
sys.dont_write_bytecode = True

import os
import re
import time
import json
import ssl
import urllib.request
import numpy
import sentencepiece
from sentencepiece import sentencepiece_model_pb2 as sentencepieceModel

# Source
from database import Database

sys.path.append(f"{os.path.dirname(__file__)}/..")
from helper import onnxSessionBuild

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

            queryList = database.execute(f'SELECT name, name_normalized, description FROM "{tableName}" WHERE file_id = %s', (fileId,)).fetchall()

            for a in range(len(queryList)):
                resultList.append({"name": queryList[a][0], "nameNormalized": queryList[a][1], "description": queryList[a][2]})

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
                clauseList.append("name_normalized LIKE %s")

            queryList = database.execute(f'SELECT name_normalized FROM "{tableName}" WHERE {" OR ".join(clauseList)} GROUP BY name_normalized ORDER BY length(name_normalized) ASC', tuple(likeList)).fetchall()

            for a in range(len(queryList)):
                resultList.append(queryList[a][0])

        return resultList

    def _logicNodeDetail(self, database, mcpSessionId, nameNormalizedList):
        resultList = []

        if len(nameNormalizedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormalizedList)))

            queryList = database.execute(
                f'SELECT DISTINCT ON (name_normalized) name, type, description FROM "{tableName}" WHERE name_normalized IN ({placeholder}) ORDER BY name_normalized, length(description) DESC',
                tuple(nameNormalizedList)
            ).fetchall()

            for a in range(len(queryList)):
                resultList.append({"name": queryList[a][0], "type": queryList[a][1], "description": queryList[a][2]})

        return resultList

    def _logicNodeFileList(self, database, mcpSessionId, nameNormalizedList):
        resultList = []

        if len(nameNormalizedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormalizedList)))

            queryList = database.execute(
                f'SELECT DISTINCT file_id FROM "{tableName}" WHERE name_normalized IN ({placeholder})',
                tuple(nameNormalizedList)
            ).fetchall()

            for a in range(len(queryList)):
                resultList.append(queryList[a][0])

        return resultList

    def _logicNodeType(self, database, mcpSessionId, nameNormalizedList):
        resultObject = {}

        if len(nameNormalizedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormalizedList)))

            queryList = database.execute(f'SELECT name_normalized, type FROM "{tableName}" WHERE name_normalized IN ({placeholder}) AND type != \'\'', tuple(nameNormalizedList)).fetchall()

            for a in range(len(queryList)):
                if resultObject.get(queryList[a][0]) is None:
                    resultObject[queryList[a][0]] = queryList[a][1]

        return resultObject

    def _logicNodeDegree(self, database, mcpSessionId, nameNormalizedList):
        resultObject = {}

        if len(nameNormalizedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            placeholder = ",".join("%s" for a in range(len(nameNormalizedList)))

            queryList = database.execute(
                f'SELECT node, COUNT(*) AS degree FROM (SELECT source_normalized AS node FROM "{tableName}" UNION ALL SELECT target_normalized AS node FROM "{tableName}") AS nodeUnion WHERE node IN ({placeholder}) GROUP BY node',
                tuple(nameNormalizedList)
            ).fetchall()

            for a in range(len(queryList)):
                resultObject[queryList[a][0]] = queryList[a][1]

        return resultObject

    def _logicNodeVecMatch(self, database, mcpSessionId, queryVector):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        queryRowList = database.execute(
            f'SELECT name, name_normalized, description, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.candidatePool)
        ).fetchall()

        candidateList = []

        for a in range(len(queryRowList)):
            candidateList.append({"name": queryRowList[a][0], "nameNormalized": queryRowList[a][1], "description": queryRowList[a][2], "distance": float(queryRowList[a][3])})

        distanceBest = -1

        if len(candidateList) > 0:
            distanceBest = candidateList[0]["distance"]

        for a in range(len(candidateList)):
            if len(resultList) >= self.vectorMatchLimit:
                break

            if candidateList[a]["distance"] <= self.distanceMax and candidateList[a]["distance"] <= distanceBest + self.marginRelative:
                resultList.append(candidateList[a])

        return resultList

    def _logicEdgeSelectByFile(self, database, mcpSessionId, fileId):
        resultList = []

        if fileId > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            queryList = database.execute(f'SELECT id, description FROM "{tableName}" WHERE file_id = %s', (fileId,)).fetchall()

            for a in range(len(queryList)):
                resultList.append({"id": queryList[a][0], "description": queryList[a][1]})

        return resultList

    def _logicEdgeSelectByIdList(self, database, mcpSessionId, idList):
        resultList = []

        if len(idList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            placeholder = ",".join("%s" for a in range(len(idList)))

            queryList = database.execute(
                f'SELECT id, source, target, description, source_normalized, target_normalized FROM "{tableName}" WHERE id IN ({placeholder})',
                tuple(idList)
            ).fetchall()

            for a in range(len(queryList)):
                query = queryList[a]

                resultList.append({"id": query[0], "source": query[1], "target": query[2], "description": query[3], "sourceNormalized": query[4], "targetNormalized": query[5]})

        return resultList

    def _logicEdgeTraverse(self, database, mcpSessionId, seedList):
        resultList = []

        if len(seedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            limit = len(seedList) * self.graphLimitPerSeed

            placeholder = ",".join("%s" for a in range(len(seedList)))

            queryList = database.execute(
                f'SELECT DISTINCT ON (source_normalized, target_normalized) id, source, target, description, source_normalized, target_normalized FROM "{tableName}" '
                f'WHERE source_normalized IN ({placeholder}) OR target_normalized IN ({placeholder}) '
                f'ORDER BY source_normalized, target_normalized, id LIMIT {limit}',
                tuple(seedList) + tuple(seedList)
            ).fetchall()

            for a in range(len(queryList)):
                query = queryList[a]

                resultList.append({
                    "source": query[1],
                    "target": query[2],
                    "description": query[3],
                    "edgeId": query[0],
                    "sourceNormalized": query[4],
                    "targetNormalized": query[5],
                    "relevance": 0,
                    "rank": 0
                })

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

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, name TEXT NOT NULL, name_normalized TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, UNIQUE (file_id, name_normalized))')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_normalized" ON "{name}" USING gin (name_normalized gin_trgm_ops)')

    def _tableNodeInsert(self, database, mcpSessionId, fileId, name, type, description):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

        if fileId > 0:
            database.execute(
                f'INSERT INTO "{tableName}" (file_id, name, name_normalized, type, description) VALUES (%s, %s, %s, %s, %s) '
                f'ON CONFLICT (file_id, name_normalized) DO UPDATE SET description = excluded.description WHERE "{tableName}".description = \'\'',
                (fileId, name, self._utilNodeNormalize(name), type, description)
            )

    def _tableNodeVecCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, name TEXT NOT NULL, name_normalized TEXT NOT NULL, description TEXT NOT NULL, embedding vector({self.vectorDimension}))')

    def _tableNodeVecInsert(self, database, mcpSessionId, fileId, name, nameNormalized, description, embeddingList):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{tableName}" (file_id, name, name_normalized, description, embedding) VALUES (%s, %s, %s, %s, %s)', (fileId, name, nameNormalized, description, embedding))

    def _tableEdgeCreate(self, database, mcpSessionId):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, source TEXT NOT NULL, target TEXT NOT NULL, description TEXT NOT NULL, source_normalized TEXT NOT NULL, target_normalized TEXT NOT NULL)')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_source" ON "{name}" (source_normalized)')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_target" ON "{name}" (target_normalized)')

    def _tableEdgeInsert(self, database, mcpSessionId, fileId, relation):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

        if fileId > 0:
            database.execute(
                f'INSERT INTO "{name}" (file_id, source, target, description, source_normalized, target_normalized) VALUES (%s, %s, %s, %s, %s, %s)',
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

            nameNormalized = self._utilNodeNormalize(name)

            entity["nameNormalized"] = nameNormalized

            description = ""

            for b in range(len(sentenceList)):
                if entity["start"] >= sentenceList[b]["start"] and entity["start"] < sentenceList[b]["end"]:
                    description = sentenceList[b]["text"]

                    break

            if seenObject.get(nameNormalized) is None:
                seenObject[nameNormalized] = True

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

                if entity.get("nameNormalized") is None:
                    continue

                if entity["start"] >= sentence["start"] and entity["start"] < sentence["end"]:
                    sentenceEntityList.append(entity)

            sentenceEntityList.sort(key=lambda entity: entity["start"])

            for b in range(len(sentenceEntityList) - 1):
                source = sentenceEntityList[b]
                target = sentenceEntityList[b + 1]

                if source["nameNormalized"] == target["nameNormalized"]:
                    continue

                gap = target["start"] - source["end"]

                if gap < 0 or gap > self.relationGapMax:
                    continue

                key = source["nameNormalized"] + "|" + target["nameNormalized"]

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
                    self._tableNodeVecInsert(database, mcpSessionId, fileId, nodeBatchList[b]["name"], nodeBatchList[b]["nameNormalized"], nodeBatchList[b]["description"], nodeEmbeddingData["data"][b]["embedding"])

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
                        if seedObject.get(nodeMatchList[b]["nameNormalized"]) is None:
                            seedObject[nodeMatchList[b]["nameNormalized"]] = True
                            seedList.append(nodeMatchList[b]["nameNormalized"])

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
                    "sourceNormalized": edgeFull["sourceNormalized"],
                    "targetNormalized": edgeFull["targetNormalized"],
                    "relevance": 0,
                    "rank": 0
                })

                if seedObject.get(edgeFull["sourceNormalized"]) is None:
                    seedObject[edgeFull["sourceNormalized"]] = True
                    seedList.append(edgeFull["sourceNormalized"])

                if seedObject.get(edgeFull["targetNormalized"]) is None:
                    seedObject[edgeFull["targetNormalized"]] = True
                    seedList.append(edgeFull["targetNormalized"])

        return graphCandidateList

    def _searchGraph(self, database, mcpSessionId, graphCandidateList, promptVector):
        graphList = []

        graphSeenObject = {}
        graphDedupList = []
        nodeNormalizedObject = {}
        nodeNormalizedList = []

        for a in range(len(graphCandidateList)):
            candidate = graphCandidateList[a]

            key = f"{candidate['sourceNormalized']}|{candidate['targetNormalized']}"

            if graphSeenObject.get(key) is None:
                graphSeenObject[key] = True
                graphDedupList.append(candidate)

                if nodeNormalizedObject.get(candidate["sourceNormalized"]) is None:
                    nodeNormalizedObject[candidate["sourceNormalized"]] = True
                    nodeNormalizedList.append(candidate["sourceNormalized"])

                if nodeNormalizedObject.get(candidate["targetNormalized"]) is None:
                    nodeNormalizedObject[candidate["targetNormalized"]] = True
                    nodeNormalizedList.append(candidate["targetNormalized"])

        degreeObject = self._logicNodeDegree(database, mcpSessionId, nodeNormalizedList)

        relevanceObject = {}

        if promptVector is not None:
            relevanceObject = self._logicEdgeRelevance(database, mcpSessionId, promptVector)

        for a in range(len(graphDedupList)):
            degreeSource = 0
            degreeTarget = 0

            if degreeObject.get(graphDedupList[a]["sourceNormalized"]) is not None:
                degreeSource = degreeObject[graphDedupList[a]["sourceNormalized"]]

            if degreeObject.get(graphDedupList[a]["targetNormalized"]) is not None:
                degreeTarget = degreeObject[graphDedupList[a]["targetNormalized"]]

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

    def _htmlTemplate(self):
        return """<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>RAG graphify</title>
        <style>
            html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; font-family: sans-serif; }
            #index { position: fixed; top: 0; left: 0; width: 240px; height: 100%; overflow-y: auto; box-sizing: border-box; padding: 8px; background: #252526; color: #ffffff; font-size: 13px; }
            #index label { display: flex; align-items: center; gap: 6px; padding: 3px 2px; cursor: pointer; }
            #index label input { flex: 0 0 auto; margin: 0; }
            #index label span:last-child { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            #index button { padding: 4px 8px; background: #3a3a3a; color: #ffffff; border: 1px solid #555555; border-radius: 3px; font-size: 14px; line-height: 1; cursor: pointer; }
            #index button:hover { background: #4a4a4a; }
            #index input { flex: 1 1 auto; min-width: 0; padding: 4px 6px; background: #3a3a3a; color: #ffffff; border: 1px solid #555555; border-radius: 3px; font-size: 12px; }
            #index .dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
            #filter_wrapper { display: flex; gap: 4px; margin-bottom: 6px; }
            #graph_wrapper { position: fixed; top: 0; left: 240px; right: 0; bottom: 0; background: #1e1e1e; opacity: 0; }
            #loadingBar_wrapper { position: fixed; top: 0; left: 240px; right: 0; z-index: 10; }
            #loadingBar_fill { height: 4px; width: 0%; background: #4f9dff; transition: width 0.2s ease; }
            #loadingBar_text { padding: 2px 6px; font-size: 11px; color: #aaaaaa; }
            .vis-tooltip { position: absolute; background: #333333; color: #ffffff; border: 1px solid #555555; padding: 4px 6px; font-size: 12px; border-radius: 3px; max-width: 300px; white-space: normal; }
        </style>
        <script>__JS_VIS__</script>
    </head>
    <body>
        <div id="index">
            <div id="filter_wrapper">
                <button id="toggleAll" title="">&#9744;</button>
                <input id="filter" type="text" placeholder="" />
            </div>
        </div>
        <div id="graph_wrapper"></div>
        <div id="loadingBar_wrapper">
            <div id="loadingBar_fill"></div>
            <div id="loadingBar_text">0%</div>
        </div>
        <script>
            const nodeList = new vis.DataSet(__NODE_DATA__);
            const edgeList = new vis.DataSet(__EDGE_DATA__);

            const optionObject = {
                layout: { improvedLayout: false },
                nodes: { shape: "dot", size: 14, font: { color: "#ffffff", size: 12 } },
                edges: { arrows: "to", color: { color: "#888888" }, smooth: false },
                interaction: { dragNodes: true, hover: true, tooltipDelay: 120, hideEdgesOnDrag: true, hideEdgesOnZoom: true },
                physics: {
                    enabled: true,
                    solver: "barnesHut",
                    barnesHut: { theta: 0.9, gravitationalConstant: -2000, centralGravity: 0.3, springLength: 120, springConstant: 0.04, damping: 0.6, avoidOverlap: 0.2 },
                    maxVelocity: 30,
                    minVelocity: 1,
                    timestep: 0.5,
                    adaptiveTimestep: true,
                    stabilization: { enabled: true, iterations: 200, updateInterval: 25, fit: true }
                }
            };

            const network = new vis.Network(document.getElementById("graph_wrapper"), { nodes: nodeList, edges: edgeList }, optionObject);

            network.on("stabilizationProgress", function(params) {
                const percent = Math.round(params.iterations / params.total * 100);

                document.getElementById("loadingBar_fill").style.width = percent + "%";
                document.getElementById("loadingBar_text").innerHTML = percent + "%";
            });

            network.once("stabilizationIterationsDone", function() {
                document.getElementById("loadingBar_fill").style.width = "100%";
                document.getElementById("loadingBar_text").innerHTML = "100%";
                document.getElementById("graph_wrapper").style.opacity = 1;

                setTimeout(function() { document.getElementById("loadingBar_wrapper").style.display = "none"; }, 400);
            });

            const elementIndex = document.getElementById("index");
            const nodeAllList = nodeList.get();
            nodeAllList.sort((nodeA, nodeB) => nodeA.label.localeCompare(nodeB.label));

            for (let a = 0; a < nodeAllList.length; a++) {
                const node = nodeAllList[a];

                const label = document.createElement("label");

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = true;
                checkbox.setAttribute("data-id", node.id);
                checkbox.addEventListener("change", function() {
                    nodeList.update({ id: this.getAttribute("data-id"), hidden: !this.checked });
                });

                const dot = document.createElement("span");
                dot.className = "dot";
                dot.style.background = node.color;

                const text = document.createElement("span");
                text.textContent = node.label;

                label.appendChild(checkbox);
                label.appendChild(dot);
                label.appendChild(text);
                elementIndex.appendChild(label);
            }

            let isAllSelected = true;

            document.getElementById("toggleAll").addEventListener("click", function() {
                isAllSelected = !isAllSelected;

                const checkboxList = elementIndex.querySelectorAll("input[type=checkbox]");
                const updateList = [];

                for (let a = 0; a < checkboxList.length; a++) {
                    checkboxList[a].checked = isAllSelected;

                    updateList.push({ id: checkboxList[a].getAttribute("data-id"), hidden: !isAllSelected });
                }

                nodeList.update(updateList);

                this.innerHTML = isAllSelected ? "&#9744;" : "&#9745;";
            });

            document.getElementById("filter").addEventListener("input", function() {
                const term = this.value.toLowerCase();
                const labelList = elementIndex.querySelectorAll("label");

                for (let a = 0; a < labelList.length; a++) {
                    labelList[a].style.display = labelList[a].textContent.toLowerCase().indexOf(term) === -1 ? "none" : "flex";
                }
            });
        </script>
    </body>
</html>
"""
    
    def _htmlGenerate(self, database, mcpSessionId):
        documentFolder = f"{self.pathFileInput}{mcpSessionId}/document/"

        if not os.path.isdir(documentFolder):
            return

        colorObject = {
            "person": "#4f9dff",
            "organization": "#ff9f40",
            "place": "#4fd18b",
            "category": "#c792ea",
            "event": "#ff6b6b"
        }

        nodeList = []
        edgeList = []

        existsRow = database.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = %s)", (f"{mcpSessionId}_rag_node",)).fetchone()

        if existsRow[0]:
            nodeTableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")
            edgeTableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            nodeRowList = database.execute(
                f'SELECT DISTINCT ON (name_normalized) name_normalized, name, type, description FROM "{nodeTableName}" ORDER BY name_normalized, length(description) DESC'
            ).fetchall()

            nodeSeenObject = {}

            for a in range(len(nodeRowList)):
                nameNormalized = nodeRowList[a][0]

                nodeSeenObject[nameNormalized] = True

                nodeList.append({"id": nameNormalized, "label": nodeRowList[a][1], "color": colorObject.get(nodeRowList[a][2], "#888888"), "title": nodeRowList[a][3]})

            edgeRowList = database.execute(f'SELECT source_normalized, target_normalized, source, target, description FROM "{edgeTableName}"').fetchall()

            for a in range(len(edgeRowList)):
                sourceNormalized = edgeRowList[a][0]
                targetNormalized = edgeRowList[a][1]

                if nodeSeenObject.get(sourceNormalized) is None:
                    nodeSeenObject[sourceNormalized] = True

                    nodeList.append({"id": sourceNormalized, "label": edgeRowList[a][2], "color": "#888888", "title": ""})

                if nodeSeenObject.get(targetNormalized) is None:
                    nodeSeenObject[targetNormalized] = True

                    nodeList.append({"id": targetNormalized, "label": edgeRowList[a][3], "color": "#888888", "title": ""})

                edgeList.append({"from": sourceNormalized, "to": targetNormalized, "title": edgeRowList[a][4]})

        nodeList.sort(key=lambda node: node["label"].lower())

        with open(f"{os.path.dirname(__file__)}/asset/vis-network.min.js", "r", encoding="utf-8") as file:
            visScript = file.read()

        visScript = re.sub(r"//[#@]\s*sourceMappingURL=\S*", "", visScript)

        html = self._htmlTemplate()
        html = html.replace("__NODE_DATA__", json.dumps(nodeList, ensure_ascii=False)).replace("__EDGE_DATA__", json.dumps(edgeList, ensure_ascii=False)).replace("__JS_VIS__", visScript)

        with open(f"{documentFolder}rag_graph.html", "w", encoding="utf-8") as file:
            file.write(html)

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
                nameNormalized = self._utilNodeNormalize(chunkEntityList[b]["name"])

                if entitySeenObject.get(nameNormalized) is None:
                    entitySeenObject[nameNormalized] = True

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

    def store(self, cookie, mcpSessionId, uniqueId, fileName):
        result = "ko"

        database = Database()

        database.execute("SELECT pg_advisory_lock(hashtext(%s))", (mcpSessionId,))

        timeStart = time.perf_counter()

        self._tableCreate(database, mcpSessionId)

        fileIdStored = self._logicFileSelect(database, mcpSessionId, fileName)

        if fileIdStored > 0:
            result = "ok"
        else:
            fileId = self._tableFileInsert(database, mcpSessionId, fileName)

            database.commit()

            fileNameOnly = fileName.split("/")[-1]
            baseName = re.sub(r"\.[^/.]+$", "", fileNameOnly.strip())

            pathInputFolder = f"{self.pathFileInput}{mcpSessionId}/document/{baseName}/"

            pathResult = f"{pathInputFolder}result.md"

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
                with open(f"{pathInputFolder}.rag_done", "w") as file:
                    file.write("")
            else:
                self._tableDelete(database, mcpSessionId, fileName)

                if os.path.isdir(pathInputFolder):
                    with open(f"{pathInputFolder}.fail", "w") as file:
                        file.write("")

        if result == "ok":
            self._htmlGenerate(database, mcpSessionId)

        database.close()

        timeEnd = time.perf_counter() - timeStart

        print(f"Time: {round(timeEnd, 3)} - {fileName}\n")

        return result

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

        database.execute("SELECT pg_advisory_lock(hashtext(%s))", (mcpSessionId,))

        self._tableDelete(database, mcpSessionId, fileName)

        if fileName != "":
            result = "ok"

            self._htmlGenerate(database, mcpSessionId)

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
