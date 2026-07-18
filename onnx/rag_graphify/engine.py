import sys
sys.dont_write_bytecode = True

import os
import re
import time
import json
import unicodedata
import numpy
import sentencepiece
from sentencepiece import sentencepiece_model_pb2 as sentencepieceModel

# Source
from database import Database

sys.path.append(f"{os.path.dirname(__file__)}/..")
from helper import onnxSessionBuild

class Engine:
    def _utilWideCheck(self, character):
        return character != "" and unicodedata.east_asian_width(character) in ("W", "F")

    def _utilWideContainCheck(self, text):
        result = False

        for a in range(len(text)):
            if self._utilWideCheck(text[a]):
                result = True

                break

        return result

    def _utilSentenceEndCheck(self, character):
        result = False

        if character == "\n":
            result = True
        elif character != "":
            name = unicodedata.name(character, "")

            if "INVERTED" not in name:
                if "FULL STOP" in name or "QUESTION MARK" in name or "EXCLAMATION MARK" in name or "DANDA" in name or character == "…":
                    result = True

        return result

    def _utilTokenEstimate(self, text):
        countWide = 0

        for a in range(len(text)):
            if self._utilWideCheck(text[a]):
                countWide += 1

        return countWide + (len(text) - countWide + 3) // 4

    def _utilReplaceTableName(self, name):
        return name.replace('"', '""')

    def _utilNodeNormalize(self, text):
        return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text).strip().lower())

    def _utilAnchorCheck(self, termList, text):
        result = False

        textNormalized = self._utilNodeNormalize(text)

        for a in range(len(termList)):
            term = self._utilNodeNormalize(termList[a])

            termMin = self.embeddinggemmaTermMin

            if self._utilWideContainCheck(term):
                termMin = self.embeddinggemmaTermMinWide

            if len(term) >= termMin and term in textNormalized:
                result = True

                break

        return result

    def _utilSecondaryRemove(self, text):
        resultList = []

        lineSplit = text.split("\n")

        for a in range(len(lineSplit)):
            if lineSplit[a].strip() == "SECONDARY ELEMENT:":
                break

            resultList.append(lineSplit[a])

        while len(resultList) > 0 and resultList[-1].strip() in ("", "---"):
            resultList.pop()

        return "\n".join(resultList)

    def _embedding(self, mode, text):
        inputList = text if isinstance(text, list) else [text]

        inputPrefixList = []

        for a in range(len(inputList)):
            if mode == "document":
                inputPrefixList.append(f"title: none | text: {inputList[a]}")
            else:
                inputPrefixList.append(f"task: search result | query: {inputList[a]}")

        tokenList = []
        lengthMax = 0

        for a in range(len(inputPrefixList)):
            idList = self.sentencepieceEmbedding.EncodeAsIds(inputPrefixList[a])

            if len(idList) > self.embeddinggemmaTokenMax - 2:
                idList = idList[0:self.embeddinggemmaTokenMax - 2]

            idList = [self.sentencepieceEmbedding.bos_id()] + idList + [self.sentencepieceEmbedding.eos_id()]

            if len(idList) > lengthMax:
                lengthMax = len(idList)

            tokenList.append(idList)

        inputIds = numpy.full((len(tokenList), lengthMax), self.sentencepieceEmbedding.pad_id(), dtype=numpy.int64)
        attentionMask = numpy.zeros((len(tokenList), lengthMax), dtype=numpy.int64)

        for a in range(len(tokenList)):
            inputIds[a, 0:len(tokenList[a])] = tokenList[a]
            attentionMask[a, 0:len(tokenList[a])] = 1

        feedObject = {"input_ids": inputIds, "attention_mask": attentionMask}

        embedding = self.onnxSessionEmbedding.run(["sentence_embedding"], feedObject)[0]

        return embedding.tolist()

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

                if gap < 0 or gap > self.glinerRelationGapMax:
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

    def _entity(self, entityPredictList, sentenceList):
        resultList = []

        seenObject = {}

        for a in range(len(entityPredictList)):
            entity = entityPredictList[a]

            name = entity["text"].strip()

            nameMinLength = self.glinerNameMinLengthWide if self._utilWideContainCheck(name) else self.glinerNameMinLength

            if len(name) < nameMinLength or name.lower().find("http") != -1:
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

    def _sentenceSplit(self, text):
        resultList = []

        start = 0

        for a in range(len(text)):
            isEnd = self._utilSentenceEndCheck(text[a])

            if isEnd and text[a] != "\n" and a + 1 < len(text):
                if text[a + 1].isalnum() and self._utilWideCheck(text[a + 1]) == False:
                    isEnd = False

            if isEnd:
                sentence = text[start:a + 1].strip()

                if sentence != "":
                    resultList.append({"text": sentence, "start": start, "end": a + 1})

                start = a + 1

        if start < len(text):
            rest = text[start:].strip()

            if rest != "":
                resultList.append({"text": rest, "start": start, "end": len(text)})

        return resultList

    def _tokenizeWord(self, text):
        resultList = []

        for segment in re.findall(r"\d|\D+", text):
            for tokenId in self.sentencepieceGliner.encode(segment, out_type=int):
                resultList.append(tokenId)

        return resultList

    def _wordSplit(self, text):
        resultList = []

        for match in re.finditer(r"\w+(?:[-_]\w+)*|[^\w\s]", text):
            word = match.group(0)
            start = match.start()

            segment = ""
            segmentStart = start

            for a in range(len(word)):
                if self._utilWideCheck(word[a]):
                    if segment != "":
                        resultList.append({"text": segment, "start": segmentStart, "end": segmentStart + len(segment)})

                        segment = ""

                    resultList.append({"text": word[a], "start": start + a, "end": start + a + 1})

                    segmentStart = start + a + 1
                else:
                    if segment == "":
                        segmentStart = start + a

                    segment += word[a]

            if segment != "":
                resultList.append({"text": segment, "start": segmentStart, "end": segmentStart + len(segment)})

        return resultList

    def _predict(self, text):
        resultList = []

        wordList = self._wordSplit(text)

        if len(wordList) > self.glinerMaxLength:
            wordList = wordList[0:self.glinerMaxLength]

        numWords = len(wordList)

        if numWords == 0:
            return resultList

        inputIdList = [self.glinerClsId]
        wordsMaskList = [0]

        for a in range(len(self.glinerTypeAllowList)):
            inputIdList.append(self.glinerEntId)
            wordsMaskList.append(0)

            for tokenId in self._tokenizeWord(self.glinerTypeAllowList[a]):
                inputIdList.append(tokenId)
                wordsMaskList.append(0)

        inputIdList.append(self.glinerSepId)
        wordsMaskList.append(0)

        for a in range(numWords):
            subwordList = self._tokenizeWord(wordList[a]["text"])

            for b in range(len(subwordList)):
                inputIdList.append(subwordList[b])
                wordsMaskList.append(a + 1 if b == 0 else 0)

        inputIdList.append(self.glinerEosId)
        wordsMaskList.append(0)

        inputIds = numpy.array([inputIdList], dtype=numpy.int64)
        attentionMask = numpy.ones((1, len(inputIdList)), dtype=numpy.int64)
        wordsMask = numpy.array([wordsMaskList], dtype=numpy.int64)
        textLengths = numpy.array([[numWords]], dtype=numpy.int64)

        spanIdxList = []
        spanMaskList = []

        for a in range(numWords):
            for b in range(self.glinerMaxWidth):
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

        logits = self.onnxSessionGliner.run(["logits"], feedObject)[0]

        probability = 1.0 / (1.0 + numpy.exp(-logits[0]))

        candidateList = []

        for a in range(numWords):
            for b in range(self.glinerMaxWidth):
                end = a + b

                if end > numWords - 1:
                    continue

                for c in range(len(self.glinerTypeAllowList)):
                    score = float(probability[a][b][c])

                    if score > self.glinerScoreMin:
                        candidateList.append({
                            "wordStart": a,
                            "wordEnd": end,
                            "label": self.glinerTypeAllowList[c],
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

    def _chunkPartBuild(self, text):
        resultList = []

        sentenceList = self._sentenceSplit(text)

        for a in range(len(sentenceList)):
            sentence = sentenceList[a]["text"]

            if self._utilTokenEstimate(sentence) <= self.glinerChunkTokenLength:
                resultList.append(sentence)
            else:
                for word in sentence.split():
                    if self._utilTokenEstimate(word) <= self.glinerChunkTokenLength:
                        resultList.append(word)
                    else:
                        for b in range(0, len(word), self.glinerChunkTokenLength):
                            resultList.append(word[b:b + self.glinerChunkTokenLength])

        return resultList

    def _chunk(self, text):
        resultList = []

        chunkText = ""

        partList = self._chunkPartBuild(text)

        for a in range(len(partList)):
            part = partList[a]

            if chunkText == "":
                chunkText = part
            elif self._utilTokenEstimate(chunkText) + self._utilTokenEstimate(part) + 1 > self.glinerChunkTokenLength:
                resultList.append(chunkText)

                chunkText = part
            else:
                separator = "" if self._utilWideCheck(chunkText[-1:]) and self._utilWideCheck(part[0:1]) else " "

                chunkText = f"{chunkText}{separator}{part}"

        if chunkText != "":
            resultList.append(chunkText)

        cleanList = []

        for a in range(len(resultList)):
            clean = re.sub(r"https?://\S+", "", resultList[a])
            clean = re.sub(r"\s+", " ", clean).strip()

            if self._utilTokenEstimate(clean) >= self.glinerChunkTokenMin:
                cleanList.append(clean)

        return cleanList

    def _chunkTableCellSplit(self, line):
        resultList = []

        partSplit = re.split(r"(?<!\\)\|", line)

        for a in range(1, len(partSplit) - 1):
            resultList.append(partSplit[a].strip().replace("\\|", "|"))

        return resultList

    def _chunkTable(self, fileName, text):
        resultList = []

        sheetName = ""
        letterList = []
        chunkText = ""
        rowCount = 0

        lineSplit = text.split("\n")

        for a in range(len(lineSplit)):
            line = lineSplit[a].strip()

            if line == "":
                continue

            if line.startswith("# "):
                if rowCount > 0:
                    resultList.append(chunkText)

                sheetName = line[2:].strip()
                letterList = []
                chunkText = ""
                rowCount = 0
            elif line.startswith("|"):
                if line.replace("|", "").replace("-", "").replace(" ", "") == "":
                    continue

                cellSplit = self._chunkTableCellSplit(line)

                if len(letterList) == 0:
                    letterList = cellSplit

                    chunkText = f"{fileName} - {sheetName}"
                else:
                    partList = []

                    for b in range(1, len(cellSplit)):
                        if cellSplit[b] != "" and b < len(letterList):
                            partList.append(f"{letterList[b]}={cellSplit[b]}")

                    rowText = f"row {cellSplit[0]}: {', '.join(partList)}"

                    if self._utilTokenEstimate(chunkText) + self._utilTokenEstimate(rowText) + 1 > self.glinerChunkTokenLength:
                        resultList.append(chunkText)

                        chunkText = f"{fileName} - {sheetName}"

                    chunkText = f"{chunkText}\n{rowText}"

                    rowCount += 1
            elif rowCount > 0:
                chunkText = f"{chunkText}\n{line}"

        if rowCount > 0:
            resultList.append(chunkText)

        return resultList

    def _rerankTokenize(self, text):
        resultList = []

        for spmId in self.sentencepieceReranker.encode(text, out_type=int):
            if spmId == 0:
                resultList.append(self.rerankerUnkId)
            else:
                resultList.append(spmId + self.rerankerOffset)

        return resultList

    def _rerank(self, prompt, textList):
        scoreList = []

        promptIdList = self._rerankTokenize(prompt)

        if len(promptIdList) > self.rerankerPromptTokenMax:
            promptIdList = promptIdList[0:self.rerankerPromptTokenMax]

        for a in range(0, len(textList), self.rerankerBatchLength):
            batchList = textList[a:a + self.rerankerBatchLength]

            sequenceList = []
            lengthMax = 0

            for b in range(len(batchList)):
                textIdList = self._rerankTokenize(batchList[b])

                lengthText = self.rerankerTokenMax - len(promptIdList) - 4

                if len(textIdList) > lengthText:
                    textIdList = textIdList[0:lengthText]

                idList = [self.rerankerBosId] + promptIdList + [self.rerankerEosId, self.rerankerEosId] + textIdList + [self.rerankerEosId]

                if len(idList) > lengthMax:
                    lengthMax = len(idList)

                sequenceList.append(idList)

            inputIds = numpy.full((len(sequenceList), lengthMax), self.rerankerPadId, dtype=numpy.int64)
            attentionMask = numpy.zeros((len(sequenceList), lengthMax), dtype=numpy.int64)

            for b in range(len(sequenceList)):
                inputIds[b, 0:len(sequenceList[b])] = sequenceList[b]
                attentionMask[b, 0:len(sequenceList[b])] = 1

            feedObject = {"input_ids": inputIds, "attention_mask": attentionMask}

            logits = self.onnxSessionReranker.run(["logits"], feedObject)[0]

            for b in range(len(logits)):
                scoreList.append(float(1.0 / (1.0 + numpy.exp(-logits[b][0]))))

        return scoreList

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

    def _logicCitationLexicalMatch(self, database, mcpSessionId, fileList, entityList, queryVector):
        resultList = []

        fileNameObject = {}

        for a in range(len(fileList)):
            fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        for a in range(len(entityList)):
            term = self._utilNodeNormalize(entityList[a])

            termMin = self.embeddinggemmaTermMin

            if self._utilWideContainCheck(term):
                termMin = self.embeddinggemmaTermMinWide

            if len(term) < termMin:
                continue

            termEscape = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

            queryRowList = database.execute(
                f'SELECT DISTINCT ON (file_id) chunk, file_id, embedding <-> %s AS distance FROM "{tableName}" WHERE lower(chunk) LIKE %s ORDER BY file_id, distance',
                (queryVector, f"%{termEscape}%")
            ).fetchall()

            for b in range(len(queryRowList)):
                chunk = queryRowList[b][0]
                fileId = queryRowList[b][1]

                if chunk and fileNameObject.get(fileId) is not None:
                    resultList.append({"fileName": fileNameObject[fileId], "chunk": chunk, "distance": float(queryRowList[b][2])})

        return resultList

    def _logicCitationRowMatch(self, database, mcpSessionId, fileList, fileId, rowList):
        resultList = []

        fileNameObject = {}

        for a in range(len(fileList)):
            fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        clauseList = []
        parameterList = [fileId]

        for a in range(len(rowList)):
            clauseList.append("chunk LIKE %s")
            parameterList.append(f"%\nrow {rowList[a]}:%")

        queryRowList = database.execute(
            f'SELECT chunk, file_id FROM "{tableName}" WHERE file_id = %s AND ({" OR ".join(clauseList)})',
            tuple(parameterList)
        ).fetchall()

        for a in range(len(queryRowList)):
            chunk = queryRowList[a][0]
            fileIdRow = queryRowList[a][1]

            if chunk and fileNameObject.get(fileIdRow) is not None:
                resultList.append({"fileName": fileNameObject[fileIdRow], "chunk": chunk, "distance": 0.0})

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

            termMin = self.embeddinggemmaTermMin

            if self._utilWideContainCheck(term):
                termMin = self.embeddinggemmaTermMinWide

            if len(term) >= termMin:
                likeList.append(f"%{term}%")

        if len(likeList) > 0:
            clauseList = []

            for a in range(len(likeList)):
                clauseList.append("name_normalized LIKE %s")

            queryList = database.execute(f'SELECT name_normalized FROM "{tableName}" WHERE {" OR ".join(clauseList)} GROUP BY name_normalized ORDER BY length(name_normalized) ASC', tuple(likeList)).fetchall()

            for a in range(len(queryList)):
                resultList.append(queryList[a][0])

        return resultList

    def _logicNodeDetail(self, database, mcpSessionId, nameNormalizedList, fileIdList):
        resultList = []

        if len(nameNormalizedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node")

            placeholder = ",".join("%s" for a in range(len(nameNormalizedList)))

            parameterList = list(nameNormalizedList)

            fileFilter = ""

            if len(fileIdList) > 0:
                placeholderFile = ",".join("%s" for a in range(len(fileIdList)))
                fileFilter = f" AND file_id IN ({placeholderFile})"

                for a in range(len(fileIdList)):
                    parameterList.append(fileIdList[a])

            queryList = database.execute(
                f'SELECT DISTINCT ON (name_normalized) name, type, description FROM "{tableName}" WHERE name_normalized IN ({placeholder}){fileFilter} ORDER BY name_normalized, length(description) DESC',
                tuple(parameterList)
            ).fetchall()

            for a in range(len(queryList)):
                resultList.append({"name": queryList[a][0], "type": queryList[a][1], "description": queryList[a][2]})

        return resultList

    def _logicNodeFileSelect(self, database, mcpSessionId, nameNormalizedList):
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

    def _logicNodeVecMatch(self, database, mcpSessionId, queryText, queryVector):
        resultList = []

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_node_vec")

        queryRowList = database.execute(
            f'SELECT name, name_normalized, description, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.rerankerPool)
        ).fetchall()

        candidateList = []

        for a in range(len(queryRowList)):
            if float(queryRowList[a][3]) > self.embeddinggemmaDistanceMaxNode:
                continue

            candidateList.append({"name": queryRowList[a][0], "nameNormalized": queryRowList[a][1], "description": queryRowList[a][2], "distance": float(queryRowList[a][3])})

        if len(candidateList) > 0:
            textList = []

            for a in range(len(candidateList)):
                if candidateList[a]["description"] == "":
                    textList.append(candidateList[a]["name"])
                else:
                    textList.append(f"{candidateList[a]['name']}: {candidateList[a]['description']}")

            scoreList = self._rerank(queryText, textList)

            scoreBest = 0.0

            for a in range(len(candidateList)):
                candidateList[a]["score"] = scoreList[a]

                if scoreList[a] > scoreBest:
                    scoreBest = scoreList[a]

            if scoreBest >= self.rerankerScoreGround:
                candidateList.sort(key=lambda candidate: candidate["score"], reverse=True)

                for a in range(len(candidateList)):
                    if len(resultList) >= self.embeddinggemmaVectorMatchLimit:
                        break

                    if candidateList[a]["score"] >= self.rerankerScoreMin:
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

    def _logicEdgeSelectById(self, database, mcpSessionId, idList, fileIdList):
        resultList = []

        if len(idList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            placeholder = ",".join("%s" for a in range(len(idList)))

            parameterList = list(idList)

            fileFilter = ""

            if len(fileIdList) > 0:
                placeholderFile = ",".join("%s" for a in range(len(fileIdList)))
                fileFilter = f" AND file_id IN ({placeholderFile})"

                for a in range(len(fileIdList)):
                    parameterList.append(fileIdList[a])

            queryList = database.execute(
                f'SELECT id, source, target, description, source_normalized, target_normalized FROM "{tableName}" WHERE id IN ({placeholder}){fileFilter}',
                tuple(parameterList)
            ).fetchall()

            for a in range(len(queryList)):
                query = queryList[a]

                resultList.append({"id": query[0], "source": query[1], "target": query[2], "description": query[3], "sourceNormalized": query[4], "targetNormalized": query[5]})

        return resultList

    def _logicEdgeTraverse(self, database, mcpSessionId, seedList, fileIdList):
        resultList = []

        if len(seedList) > 0:
            tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

            limit = len(seedList) * self.embeddinggemmaGraphLimitPerSeed

            placeholder = ",".join("%s" for a in range(len(seedList)))

            parameterList = list(seedList) + list(seedList)

            fileFilter = ""

            if len(fileIdList) > 0:
                placeholderFile = ",".join("%s" for a in range(len(fileIdList)))
                fileFilter = f" AND file_id IN ({placeholderFile})"

                for a in range(len(fileIdList)):
                    parameterList.append(fileIdList[a])

            queryList = database.execute(
                f'SELECT DISTINCT ON (source_normalized, target_normalized) id, source, target, description, source_normalized, target_normalized FROM "{tableName}" '
                f'WHERE (source_normalized IN ({placeholder}) OR target_normalized IN ({placeholder})){fileFilter} '
                f'ORDER BY source_normalized, target_normalized, id LIMIT {limit}',
                tuple(parameterList)
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

    def _logicEdgeVecMatch(self, database, mcpSessionId, queryText, queryVector):
        resultList = []

        tableNameVec = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")
        tableNameEdge = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge")

        queryRowList = database.execute(
            f'SELECT vec.edge_id, edge.description, vec.embedding <-> %s AS distance FROM "{tableNameVec}" vec JOIN "{tableNameEdge}" edge ON edge.id = vec.edge_id ORDER BY distance LIMIT %s',
            (queryVector, self.rerankerPool)
        ).fetchall()

        candidateList = []

        for a in range(len(queryRowList)):
            candidateList.append({"edgeId": queryRowList[a][0], "description": queryRowList[a][1], "distance": float(queryRowList[a][2])})

        if len(candidateList) > 0:
            textList = []

            for a in range(len(candidateList)):
                textList.append(candidateList[a]["description"])

            scoreList = self._rerank(queryText, textList)

            for a in range(len(candidateList)):
                candidateList[a]["score"] = scoreList[a]

            candidateList.sort(key=lambda candidate: candidate["score"], reverse=True)

            for a in range(len(candidateList)):
                if len(resultList) >= self.embeddinggemmaVectorMatchLimit:
                    break

                if candidateList[a]["score"] >= self.rerankerScoreMin:
                    resultList.append(candidateList[a]["edgeId"])

        return resultList

    def _logicEdgeRelevance(self, database, mcpSessionId, queryVector):
        resultObject = {}

        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        queryRowList = database.execute(
            f'SELECT edge_id, embedding <-> %s AS distance FROM "{tableName}" ORDER BY distance LIMIT %s',
            (queryVector, self.embeddinggemmaCandidatePool)
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

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, chunk TEXT NOT NULL, embedding vector({self.embeddinggemmaVectorDimension}))')
        database.execute(f'CREATE INDEX IF NOT EXISTS "{name}_chunk" ON "{name}" USING gin (lower(chunk) gin_trgm_ops)')

    def _tableCitationInsert(self, database, mcpSessionId, fileId, chunk, embeddingList):
        name = self._utilReplaceTableName(f"{mcpSessionId}_rag")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{name}" (file_id, chunk, embedding) VALUES (%s, %s, %s)', (fileId, chunk, embedding))

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

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, name TEXT NOT NULL, name_normalized TEXT NOT NULL, description TEXT NOT NULL, embedding vector({self.embeddinggemmaVectorDimension}))')

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

        database.execute(f'CREATE TABLE IF NOT EXISTS "{name}" (id SERIAL PRIMARY KEY, file_id INTEGER, edge_id INTEGER, embedding vector({self.embeddinggemmaVectorDimension}))')

    def _tableEdgeVecInsert(self, database, mcpSessionId, fileId, edgeId, embeddingList):
        tableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_edge_vec")

        if fileId > 0:
            embedding = numpy.array(embeddingList, dtype=numpy.float32)

            database.execute(f'INSERT INTO "{tableName}" (file_id, edge_id, embedding) VALUES (%s, %s, %s)', (fileId, edgeId, embedding))

    def _tableCreate(self, database, mcpSessionId):
        self._tableFileCreate(database, mcpSessionId)
        self._tableCitationCreate(database, mcpSessionId)
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
                database.execute(f'DELETE FROM "{tableNameRag}" WHERE file_id = %s', (fileId,))
                database.execute(f'DELETE FROM "{tableNameRagFile}" WHERE id = %s', (fileId,))

                database.commit()

    def _storeCitation(self, database, mcpSessionId, fileId, chunkList):
        for a in range(0, len(chunkList), self.embeddinggemmaBatchLength):
            chunkBatchList = chunkList[a:a + self.embeddinggemmaBatchLength]

            embeddingList = self._embedding("document", chunkBatchList)

            for b in range(len(chunkBatchList)):
                self._tableCitationInsert(database, mcpSessionId, fileId, chunkBatchList[b], embeddingList[b])

            database.commit()

    def _storeRelation(self, database, mcpSessionId, fileId, chunkList):
        for a in range(len(chunkList)):
            entityPredictList = self._predict(chunkList[a])

            sentenceList = self._sentenceSplit(chunkList[a])

            entityList = self._entity(entityPredictList, sentenceList)
            relationList = self._relation(entityPredictList, sentenceList)

            for b in range(len(entityList)):
                entity = entityList[b]

                self._tableNodeInsert(database, mcpSessionId, fileId, entity["name"], entity["type"], entity["description"])

            for b in range(len(relationList)):
                relation = relationList[b]

                self._tableEdgeInsert(database, mcpSessionId, fileId, relation)
                self._tableNodeInsert(database, mcpSessionId, fileId, relation["source"], "concept", "")
                self._tableNodeInsert(database, mcpSessionId, fileId, relation["target"], "concept", "")

            database.commit()

    def _storeNodeVector(self, database, mcpSessionId, fileId):
        nodeBuildList = self._logicNodeSelectByFile(database, mcpSessionId, fileId)

        for a in range(0, len(nodeBuildList), self.embeddinggemmaBatchLength):
            nodeBatchList = nodeBuildList[a:a + self.embeddinggemmaBatchLength]

            nodeTextList = []

            for b in range(len(nodeBatchList)):
                if nodeBatchList[b]["description"] == "":
                    nodeTextList.append(nodeBatchList[b]["name"])
                else:
                    nodeTextList.append(f"{nodeBatchList[b]['name']}: {nodeBatchList[b]['description']}")

            nodeEmbeddingList = self._embedding("document", nodeTextList)

            for b in range(len(nodeBatchList)):
                self._tableNodeVecInsert(database, mcpSessionId, fileId, nodeBatchList[b]["name"], nodeBatchList[b]["nameNormalized"], nodeBatchList[b]["description"], nodeEmbeddingList[b])

            database.commit()

    def _storeEdgeVector(self, database, mcpSessionId, fileId):
        edgeBuildList = self._logicEdgeSelectByFile(database, mcpSessionId, fileId)

        for a in range(0, len(edgeBuildList), self.embeddinggemmaBatchLength):
            edgeBatchList = edgeBuildList[a:a + self.embeddinggemmaBatchLength]

            edgeTextList = []

            for b in range(len(edgeBatchList)):
                edgeTextList.append(f"{edgeBatchList[b]['description']}".strip())

            edgeEmbeddingList = self._embedding("document", edgeTextList)

            for b in range(len(edgeBatchList)):
                self._tableEdgeVecInsert(database, mcpSessionId, fileId, edgeBatchList[b]["id"], edgeEmbeddingList[b])

            database.commit()

    def _searchCitation(self, database, mcpSessionId, fileList, promptSearch, promptVector, entityList, entityFileIdList):
        citationList = []

        isCitationSemantic = False

        seenObject = {}

        candidateList = []

        if promptVector is not None:
            promptCitationList = self._logicCitationMatch(database, mcpSessionId, fileList, self.rerankerPool, promptVector)

            for a in range(len(promptCitationList)):
                candidate = promptCitationList[a]

                if candidate["distance"] > self.embeddinggemmaDistanceMaxCitation and not self._utilAnchorCheck(entityList, candidate["chunk"]):
                    continue

                key = candidate["fileName"] + "|" + candidate["chunk"]

                if seenObject.get(key) is None:
                    seenObject[key] = True

                    candidateList.append(candidate)

            for a in range(len(entityFileIdList)):
                fileCitationList = self._logicCitationMatchByFile(database, mcpSessionId, fileList, entityFileIdList[a], promptVector)

                for b in range(len(fileCitationList)):
                    candidate = fileCitationList[b]

                    key = candidate["fileName"] + "|" + candidate["chunk"]

                    if seenObject.get(key) is None:
                        seenObject[key] = True

                        candidateList.append(candidate)

            lexicalCitationList = self._logicCitationLexicalMatch(database, mcpSessionId, fileList, entityList, promptVector)

            for a in range(len(lexicalCitationList)):
                candidate = lexicalCitationList[a]

                key = candidate["fileName"] + "|" + candidate["chunk"]

                if seenObject.get(key) is None:
                    seenObject[key] = True

                    candidateList.append(candidate)

        if len(candidateList) > 0:
            chunkList = []

            for a in range(len(candidateList)):
                chunkList.append(candidateList[a]["chunk"])

            scoreList = self._rerank(promptSearch, chunkList)

            for a in range(len(candidateList)):
                candidateList[a]["score"] = scoreList[a]

            candidateList.sort(key=lambda candidate: candidate["score"], reverse=True)

            for a in range(len(candidateList)):
                if len(citationList) >= self.rerankerCitationLimit:
                    break

                if candidateList[a]["score"] >= self.rerankerScoreMin:
                    citationList.append(candidateList[a])

            isCitationSemantic = len(citationList) > 0

        return citationList, isCitationSemantic

    def _searchSeed(self, database, mcpSessionId, entityList, entityEmbeddingList):
        seedObject = {}
        seedList = []

        if len(entityList) > 0:
            for a in range(len(entityList)):
                nodeVector = numpy.array(entityEmbeddingList[a], dtype=numpy.float32)
                nodeMatchList = self._logicNodeVecMatch(database, mcpSessionId, entityList[a], nodeVector)

                for b in range(len(nodeMatchList)):
                    if seedObject.get(nodeMatchList[b]["nameNormalized"]) is None:
                        seedObject[nodeMatchList[b]["nameNormalized"]] = True
                        seedList.append(nodeMatchList[b]["nameNormalized"])

        seedLikeList = self._logicNodeMatch(database, mcpSessionId, entityList)

        for a in range(len(seedLikeList)):
            if seedObject.get(seedLikeList[a]) is None:
                seedObject[seedLikeList[a]] = True
                seedList.append(seedLikeList[a])

        entityFileIdList = self._logicNodeFileSelect(database, mcpSessionId, seedList)

        return seedObject, seedList, entityFileIdList

    def _searchTheme(self, database, mcpSessionId, themeList, seedObject, seedList, fileIdList):
        graphCandidateList = []

        if len(themeList) > 0:
            themeEmbeddingList = self._embedding("query", themeList)

            edgeIdObject = {}
            edgeIdList = []

            for a in range(len(themeList)):
                edgeVector = numpy.array(themeEmbeddingList[a], dtype=numpy.float32)
                edgeMatchList = self._logicEdgeVecMatch(database, mcpSessionId, themeList[a], edgeVector)

                for b in range(len(edgeMatchList)):
                    if edgeIdObject.get(edgeMatchList[b]) is None:
                        edgeIdObject[edgeMatchList[b]] = True
                        edgeIdList.append(edgeMatchList[b])

            edgeFullList = self._logicEdgeSelectById(database, mcpSessionId, edgeIdList, fileIdList)

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

    def _searchGraph(self, database, mcpSessionId, graphCandidateList, promptSearch, promptVector):
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

            relevance = float("inf")

            if relevanceObject.get(graphDedupList[a]["edgeId"]) is not None:
                relevance = relevanceObject[graphDedupList[a]["edgeId"]]

            graphDedupList[a]["relevance"] = relevance

        graphDedupList.sort(key=lambda candidate: (candidate["relevance"], -candidate["rank"]))

        rerankCandidateList = graphDedupList[0:self.rerankerPool]

        if len(rerankCandidateList) > 0:
            textList = []

            for a in range(len(rerankCandidateList)):
                textList.append(rerankCandidateList[a]["description"])

            scoreList = self._rerank(promptSearch, textList)

            for a in range(len(rerankCandidateList)):
                rerankCandidateList[a]["score"] = scoreList[a]

            rerankCandidateList.sort(key=lambda candidate: (candidate["score"], candidate["rank"]), reverse=True)

            graphTokenTotal = 0

            for a in range(len(rerankCandidateList)):
                candidate = rerankCandidateList[a]

                if candidate["score"] < self.rerankerScoreMin:
                    break

                tokenCount = self._utilTokenEstimate(f"{candidate['source']} {candidate['target']} {candidate['description']}")

                if graphTokenTotal + tokenCount <= self.embeddinggemmaGraphTokenBudget:
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
            #index .group { margin: 0 0 4px 0; }
            #index .group_header { display: flex; align-items: center; gap: 6px; padding: 4px 2px; font-weight: bold; }
            #index .group_toggle { width: 14px; flex: 0 0 auto; text-align: center; }
            #index .group_header input { flex: 0 0 auto; margin: 0; padding: 0; }
            #index .group_name { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
            #index .group_body label { padding-left: 20px; }
            #filter_wrapper { display: flex; gap: 4px; margin: 0 10px 5px 0; }
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

            const groupObject = {};

            for (let a = 0; a < nodeAllList.length; a++) {
                const fileName = nodeAllList[a].file;

                if (groupObject[fileName] === undefined) {
                    groupObject[fileName] = [];
                }

                groupObject[fileName].push(nodeAllList[a]);
            }

            const fileNameList = Object.keys(groupObject).sort((fileNameA, fileNameB) => fileNameA.localeCompare(fileNameB));

            for (let a = 0; a < fileNameList.length; a++) {
                const nodeGroupList = groupObject[fileNameList[a]];

                const elementGroup = document.createElement("div");
                elementGroup.className = "group";

                const elementGroupHeader = document.createElement("div");
                elementGroupHeader.className = "group_header";

                const elementGroupToggle = document.createElement("span");
                elementGroupToggle.className = "group_toggle";
                elementGroupToggle.textContent = "+";

                const elementGroupName = document.createElement("span");
                elementGroupName.className = "group_name";
                elementGroupName.textContent = `${fileNameList[a]} (${nodeGroupList.length})`;
                elementGroupName.title = fileNameList[a];

                const elementGroupBody = document.createElement("div");
                elementGroupBody.className = "group_body";
                elementGroupBody.style.display = "none";

                const elementGroupCheckbox = document.createElement("input");
                elementGroupCheckbox.type = "checkbox";
                elementGroupCheckbox.checked = true;
                elementGroupCheckbox.addEventListener("change", function() {
                    const elementCheckboxList = elementGroupBody.querySelectorAll("input[type=checkbox]");
                    const updateList = [];

                    for (let a = 0; a < elementCheckboxList.length; a++) {
                        elementCheckboxList[a].checked = this.checked;

                        updateList.push({ id: elementCheckboxList[a].getAttribute("data-id"), hidden: !this.checked });
                    }

                    nodeList.update(updateList);
                });

                elementGroupHeader.appendChild(elementGroupCheckbox);
                elementGroupHeader.appendChild(elementGroupToggle);
                elementGroupHeader.appendChild(elementGroupName);

                elementGroupName.addEventListener("click", function() {
                    const isOpen = elementGroupBody.style.display !== "none";

                    elementGroupBody.style.display = isOpen ? "none" : "block";
                    elementGroupToggle.textContent = isOpen ? "+" : "-";
                });

                for (let b = 0; b < nodeGroupList.length; b++) {
                    const node = nodeGroupList[b];

                    const elementLabel = document.createElement("label");

                    const elementCheckbox = document.createElement("input");
                    elementCheckbox.type = "checkbox";
                    elementCheckbox.checked = true;
                    elementCheckbox.setAttribute("data-id", node.id);
                    elementCheckbox.addEventListener("change", function() {
                        nodeList.update({ id: this.getAttribute("data-id"), hidden: !this.checked });
                    });

                    const elementDot = document.createElement("span");
                    elementDot.className = "dot";
                    elementDot.style.background = node.color;

                    const elementText = document.createElement("span");
                    elementText.textContent = node.label;

                    elementLabel.appendChild(elementCheckbox);
                    elementLabel.appendChild(elementDot);
                    elementLabel.appendChild(elementText);
                    elementGroupBody.appendChild(elementLabel);
                }

                elementGroup.appendChild(elementGroupHeader);
                elementGroup.appendChild(elementGroupBody);
                elementIndex.appendChild(elementGroup);
            }

            let isAllSelected = true;

            document.getElementById("toggleAll").addEventListener("click", function() {
                isAllSelected = !isAllSelected;

                const elementCheckboxList = elementIndex.querySelectorAll("input[type=checkbox]");
                const updateList = [];

                for (let a = 0; a < elementCheckboxList.length; a++) {
                    elementCheckboxList[a].checked = isAllSelected;

                    if (elementCheckboxList[a].getAttribute("data-id") !== null) {
                        updateList.push({ id: elementCheckboxList[a].getAttribute("data-id"), hidden: !isAllSelected });
                    }
                }

                nodeList.update(updateList);

                this.innerHTML = isAllSelected ? "&#9744;" : "&#9745;";
            });

            document.getElementById("filter").addEventListener("input", function() {
                const term = this.value.toLowerCase();
                const elementGroupList = elementIndex.querySelectorAll(".group");

                for (let a = 0; a < elementGroupList.length; a++) {
                    const elementLabelList = elementGroupList[a].querySelectorAll("label");

                    let matchCount = 0;

                    for (let b = 0; b < elementLabelList.length; b++) {
                        const isMatch = elementLabelList[b].textContent.toLowerCase().indexOf(term) !== -1;

                        elementLabelList[b].style.display = isMatch ? "flex" : "none";

                        if (isMatch) {
                            matchCount++;
                        }
                    }

                    elementGroupList[a].style.display = matchCount === 0 ? "none" : "block";

                    if (term !== "" && matchCount > 0) {
                        elementGroupList[a].querySelector(".group_body").style.display = "block";
                        elementGroupList[a].querySelector(".group_toggle").textContent = "-";
                    }
                }
            });
        </script>
    </body>
</html>
"""

    def _htmlGenerate(self, database, mcpSessionId):
        pathDocument = f"{self.pathFileInput}{mcpSessionId}/document/"

        if not os.path.isdir(pathDocument):
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
            fileTableName = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

            fileNameObject = {}

            fileRowList = database.execute(f'SELECT id, name FROM "{fileTableName}"').fetchall()

            for a in range(len(fileRowList)):
                fileNameObject[fileRowList[a][0]] = fileRowList[a][1]

            nodeRowList = database.execute(
                f'SELECT DISTINCT ON (name_normalized) name_normalized, name, type, description, file_id FROM "{nodeTableName}" ORDER BY name_normalized, length(description) DESC'
            ).fetchall()

            nodeSeenObject = {}

            for a in range(len(nodeRowList)):
                nameNormalized = nodeRowList[a][0]

                nodeSeenObject[nameNormalized] = True

                nodeList.append({"id": nameNormalized, "label": nodeRowList[a][1], "color": colorObject.get(nodeRowList[a][2], "#888888"), "title": nodeRowList[a][3], "file": fileNameObject.get(nodeRowList[a][4], "-")})

            edgeRowList = database.execute(f'SELECT source_normalized, target_normalized, source, target, description FROM "{edgeTableName}"').fetchall()

            for a in range(len(edgeRowList)):
                sourceNormalized = edgeRowList[a][0]
                targetNormalized = edgeRowList[a][1]

                if nodeSeenObject.get(sourceNormalized) is None:
                    nodeSeenObject[sourceNormalized] = True

                    nodeList.append({"id": sourceNormalized, "label": edgeRowList[a][2], "color": "#888888", "title": "", "file": "-"})

                if nodeSeenObject.get(targetNormalized) is None:
                    nodeSeenObject[targetNormalized] = True

                    nodeList.append({"id": targetNormalized, "label": edgeRowList[a][3], "color": "#888888", "title": "", "file": "-"})

                edgeList.append({"from": sourceNormalized, "to": targetNormalized, "title": edgeRowList[a][4]})

        nodeList.sort(key=lambda node: node["label"].lower())

        with open(f"{self.pathOsDirName}asset/vis-network.min.js", "r", encoding="utf-8") as file:
            visScript = file.read()

        visScript = re.sub(r"//[#@]\s*sourceMappingURL=\S*", "", visScript)

        html = self._htmlTemplate()
        html = html.replace("__NODE_DATA__", json.dumps(nodeList, ensure_ascii=False)).replace("__EDGE_DATA__", json.dumps(edgeList, ensure_ascii=False)).replace("__JS_VIS__", visScript)

        with open(f"{pathDocument}rag_graph.html", "w", encoding="utf-8") as file:
            file.write(html)

    def store(self, mcpSessionId, fileName):
        result = "ko"

        database = Database()

        database.execute("SELECT pg_advisory_lock(hashtext(%s))", (mcpSessionId,))

        timeStart = time.perf_counter()

        self._tableCreate(database, mcpSessionId)

        fileNameOnly = fileName.split("/")[-1]
        baseName = re.sub(r"\.[^/.]+$", "", fileNameOnly.strip())

        pathInputBasename = f"{self.pathFileInput}{mcpSessionId}/document/{baseName}/"

        fileIdStored = self._logicFileSelect(database, mcpSessionId, fileName)

        if fileIdStored > 0:
            result = "ok"
        else:
            fileId = self._tableFileInsert(database, mcpSessionId, fileName)

            database.commit()

            pathMarkdown = f"{pathInputBasename}result.md"

            if os.path.exists(pathMarkdown):
                with open(pathMarkdown, "r", encoding="utf-8") as file:
                    fileContent = file.read()

                fileContent = unicodedata.normalize("NFKC", fileContent)
                fileContent = self._utilSecondaryRemove(fileContent)

                extension = os.path.splitext(fileNameOnly)[1].lower()

                if extension == ".xlsx":
                    chunkList = self._chunkTable(fileNameOnly, fileContent)
                else:
                    chunkList = self._chunk(fileContent)

                if len(chunkList) > 0:
                    self._storeCitation(database, mcpSessionId, fileId, chunkList)

                    if extension == ".xlsx":
                        self._tableNodeInsert(database, mcpSessionId, fileId, fileNameOnly, "file", "")

                        database.commit()

                    self._storeRelation(database, mcpSessionId, fileId, chunkList)
                    self._storeNodeVector(database, mcpSessionId, fileId)
                    self._storeEdgeVector(database, mcpSessionId, fileId)

                    result = "ok"

        if result == "ok":
            if os.path.isdir(pathInputBasename):
                with open(f"{pathInputBasename}.rag_done", "w") as file:
                    file.write("")

            self._htmlGenerate(database, mcpSessionId)
        else:
            self._tableDelete(database, mcpSessionId, fileName)

            if os.path.isdir(pathInputBasename):
                with open(f"{pathInputBasename}.fail", "w") as file:
                    file.write("")

        database.close()

        timeEnd = time.perf_counter() - timeStart

        print(f"\nTime: {round(timeEnd, 3)} - {fileName}")

        return result

    def search(self, mcpSessionId, prompt, entityList, themeList, rowList):
        result = {"citationList": [], "nodeList": [], "graphList": []}

        if prompt is None:
            prompt = ""

        if entityList is None:
            entityList = []

        if themeList is None:
            themeList = []

        if rowList is None:
            rowList = []

        database = Database()

        tableNameRagFile = self._utilReplaceTableName(f"{mcpSessionId}_rag_file")

        existsRow = database.execute("SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = %s)", (f"{mcpSessionId}_rag_file",)).fetchone()

        if existsRow[0]:
            fileQueryList = database.execute(f'SELECT id, name FROM "{tableNameRagFile}"').fetchall()

            fileList = []

            for a in range(len(fileQueryList)):
                fileList.append({"id": fileQueryList[a][0], "name": fileQueryList[a][1]})

            prompt = unicodedata.normalize("NFKC", prompt)

            for a in range(len(entityList)):
                entityList[a] = unicodedata.normalize("NFKC", entityList[a])

            for a in range(len(themeList)):
                themeList[a] = unicodedata.normalize("NFKC", themeList[a])

            promptSearch = prompt

            for a in range(len(entityList)):
                if entityList[a].lower() not in promptSearch.lower():
                    promptSearch = f"{promptSearch} {entityList[a]}"

            promptEmbeddingList = self._embedding("query", promptSearch)

            promptVector = numpy.array(promptEmbeddingList[0], dtype=numpy.float32)

            entityEmbeddingList = []

            if len(entityList) > 0:
                entityEmbeddingList = self._embedding("query", entityList)

            seedObject, seedList, entityFileIdList = self._searchSeed(database, mcpSessionId, entityList, entityEmbeddingList)

            citationList, isCitationSemantic = self._searchCitation(database, mcpSessionId, fileList, promptSearch, promptVector, entityList, entityFileIdList)

            rowNumberList = []

            for a in range(len(rowList)):
                if isinstance(rowList[a], int) and rowList[a] > 0 and rowList[a] not in rowNumberList:
                    rowNumberList.append(rowList[a])

            if len(rowNumberList) > 0:
                fileNameObject = {}

                for a in range(len(fileList)):
                    fileNameObject[fileList[a]["id"]] = fileList[a]["name"]

                rowCitationList = []

                for a in range(len(entityFileIdList)):
                    fileName = fileNameObject.get(entityFileIdList[a], "")

                    if fileName.lower().endswith(".xlsx"):
                        rowMatchList = self._logicCitationRowMatch(database, mcpSessionId, fileList, entityFileIdList[a], rowNumberList)

                        for b in range(len(rowMatchList)):
                            rowCitationList.append(rowMatchList[b])

                if len(rowCitationList) > 0:
                    citationList = rowCitationList

            fileIdObject = {}

            for a in range(len(fileList)):
                fileIdObject[fileList[a]["name"]] = fileList[a]["id"]

            citationFileIdList = []

            for a in range(len(citationList)):
                fileId = fileIdObject.get(citationList[a]["fileName"], 0)

                if fileId > 0 and fileId not in citationFileIdList:
                    citationFileIdList.append(fileId)

            nodeList = self._logicNodeDetail(database, mcpSessionId, seedList, citationFileIdList)

            isInDomain = isCitationSemantic or len(seedList) > 0

            if isInDomain:
                graphCandidateList = self._searchTheme(database, mcpSessionId, themeList, seedObject, seedList, citationFileIdList)

                if len(seedList) > 0:
                    seedSlice = seedList[0:self.embeddinggemmaSeedLimit]
                    traverseList = self._logicEdgeTraverse(database, mcpSessionId, seedSlice, citationFileIdList)

                    for a in range(len(traverseList)):
                        graphCandidateList.append(traverseList[a])

                graphList = self._searchGraph(database, mcpSessionId, graphCandidateList, promptSearch, promptVector)

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
        PATH_ROOT = os.environ.get("PATH_ROOT")
        PATH_FILE = os.environ.get("MS_M_PATH_FILE")

        self.pathOsDirName = f"{os.path.dirname(__file__)}/"
        self.pathModelEmbedding = f"{self.pathOsDirName}model/embeddinggemma-300m/"
        self.pathModelGliner = f"{self.pathOsDirName}model/gliner_multi-v2.1/"
        self.pathModelReranker = f"{self.pathOsDirName}model/bge-reranker-v2-m3/"
        self.pathFileInput = f"{PATH_ROOT}{PATH_FILE}input/"

        self.embeddinggemmaTokenMax = 2048
        self.embeddinggemmaDistanceMaxCitation = 1.24
        self.embeddinggemmaDistanceMaxNode = 1.24
        self.embeddinggemmaVectorDimension = 768
        self.embeddinggemmaVectorMatchLimit = 8
        self.embeddinggemmaGraphLimitPerSeed = 32
        self.embeddinggemmaGraphTokenBudget = 2000
        self.embeddinggemmaBatchLength = 32
        self.embeddinggemmaCandidatePool = 256
        self.embeddinggemmaSeedLimit = 24
        self.embeddinggemmaTermMin = 3
        self.embeddinggemmaTermMinWide = 2

        self.glinerTypeAllowList = ["person", "organization", "place", "category", "event"]
        self.glinerChunkTokenLength = 250
        self.glinerChunkTokenMin = 25
        self.glinerNameMinLength = 3
        self.glinerNameMinLengthWide = 2
        self.glinerScoreMin = 0.4
        self.glinerRelationGapMax = 60
        self.glinerEntId = 250103
        self.glinerSepId = 250104
        self.glinerClsId = 1
        self.glinerEosId = 2
        self.glinerMaxWidth = 12
        self.glinerMaxLength = 384

        self.rerankerScoreMin = 0.0005
        self.rerankerScoreGround = 0.25
        self.rerankerPool = 24
        self.rerankerBatchLength = 8
        self.rerankerTokenMax = 512
        self.rerankerPromptTokenMax = 128
        self.rerankerBosId = 0
        self.rerankerPadId = 1
        self.rerankerEosId = 2
        self.rerankerUnkId = 3
        self.rerankerOffset = 1
        self.rerankerCitationLimit = 8

        proto = sentencepieceModel.ModelProto()

        with open(f"{self.pathModelGliner}spm.model", "rb") as file:
            proto.ParseFromString(file.read())

        proto.normalizer_spec.add_dummy_prefix = False

        self.sentencepieceEmbedding = sentencepiece.SentencePieceProcessor()
        self.sentencepieceEmbedding.Load(f"{self.pathModelEmbedding}tokenizer.model")
        self.onnxSessionEmbedding = onnxSessionBuild(f"{self.pathModelEmbedding}model.onnx")

        self.sentencepieceGliner = sentencepiece.SentencePieceProcessor()
        self.sentencepieceGliner.LoadFromSerializedProto(proto.SerializeToString())
        self.onnxSessionGliner = onnxSessionBuild(f"{self.pathModelGliner}model.onnx")

        self.sentencepieceReranker = sentencepiece.SentencePieceProcessor()
        self.sentencepieceReranker.Load(f"{self.pathModelReranker}sentencepiece.bpe.model")
        self.onnxSessionReranker = onnxSessionBuild(f"{self.pathModelReranker}model.onnx")

        database = Database(True)
        database.close()
