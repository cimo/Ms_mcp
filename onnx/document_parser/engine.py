import sys
sys.dont_write_bytecode = True

import os
import re
import math
import time
import json
import unicodedata

class Pdf:
    def _whitespaceCheck(self, code):
        return code == 0 or code == 9 or code == 10 or code == 12 or code == 13 or code == 32

    def _delimiterCheck(self, code):
        character = chr(code)

        return (
            character == "("
            or character == ")"
            or character == "<"
            or character == ">"
            or character == "["
            or character == "]"
            or character == "{"
            or character == "}"
            or character == "/"
            or character == "%"
        )

    def _digitCheck(self, code):
        return code >= 48 and code <= 57

    def _floatParse(self, text):
        result = 0.0

        match = re.match(r"[+-]?(\d+\.?\d*|\.\d+)", text)

        if match is not None:
            result = float(match.group(0))

        return result

    def _byteText(self, byteList):
        return byteList.decode("latin-1")

    def _textByte(self, text):
        resultList = bytearray(len(text))

        for a in range(len(text)):
            resultList[a] = ord(text[a]) & 0xff

        return bytes(resultList)

    def _readBit(self):
        if self.inflateBitCount == 0:
            self.inflateBitBuffer = self.inflateInput[self.inflatePosition] if self.inflatePosition < len(self.inflateInput) else 0
            self.inflatePosition += 1
            self.inflateBitCount = 8

        result = self.inflateBitBuffer & 1

        self.inflateBitBuffer >>= 1
        self.inflateBitCount -= 1

        return result

    def _readBits(self, count):
        result = 0

        for a in range(count):
            result |= self._readBit() << a

        return result

    def _buildHuffman(self, lengthList):
        maxBits = 15
        countList = [0] * (maxBits + 1)

        for a in range(len(lengthList)):
            countList[lengthList[a]] += 1

        countList[0] = 0

        offsetList = [0] * (maxBits + 2)

        for a in range(1, maxBits + 1):
            offsetList[a + 1] = offsetList[a] + countList[a]

        symbolList = [0] * len(lengthList)

        for a in range(len(lengthList)):
            if lengthList[a] != 0:
                symbolList[offsetList[lengthList[a]]] = a
                offsetList[lengthList[a]] += 1

        return {"countList": countList, "symbolList": symbolList}

    def _decodeSymbol(self, tree):
        code = 0
        first = 0
        index = 0
        result = -1

        for a in range(1, 16):
            if result == -1:
                code |= self._readBit()

                count = tree["countList"][a]

                if code - first < count:
                    position = index + (code - first)

                    if position >= 0 and position < len(tree["symbolList"]):
                        result = tree["symbolList"][position]
                else:
                    index += count
                    first += count
                    first <<= 1
                    code <<= 1

        return result

    def _inflateBlock(self, literalTree, distanceTree):
        isEnd = False

        while isEnd == False:
            symbol = self._decodeSymbol(literalTree)

            if symbol == 256 or symbol == -1:
                isEnd = True
            elif symbol < 256:
                self.inflateOutputList.append(symbol)
            else:
                lengthIndex = symbol - 257
                length = self.lengthBaseList[lengthIndex] + self._readBits(self.lengthExtraList[lengthIndex])

                distanceSymbol = self._decodeSymbol(distanceTree)
                distance = self.distanceBaseList[distanceSymbol] + self._readBits(self.distanceExtraList[distanceSymbol])

                start = len(self.inflateOutputList) - distance

                for a in range(length):
                    value = self.inflateOutputList[start + a] if start + a >= 0 else 0

                    self.inflateOutputList.append(value)

    def _inflateFixed(self):
        literalLengthList = [0] * 288

        for a in range(288):
            if a < 144:
                literalLengthList[a] = 8
            elif a < 256:
                literalLengthList[a] = 9
            elif a < 280:
                literalLengthList[a] = 7
            else:
                literalLengthList[a] = 8

        distanceLengthList = [5] * 30

        self._inflateBlock(self._buildHuffman(literalLengthList), self._buildHuffman(distanceLengthList))

    def _inflateDynamic(self):
        literalCount = self._readBits(5) + 257
        distanceCount = self._readBits(5) + 1
        codeLengthCount = self._readBits(4) + 4

        codeLengthList = [0] * 19

        for a in range(codeLengthCount):
            codeLengthList[self.codeLengthOrderList[a]] = self._readBits(3)

        codeLengthTree = self._buildHuffman(codeLengthList)
        allLengthList = []

        while len(allLengthList) < literalCount + distanceCount:
            symbol = self._decodeSymbol(codeLengthTree)

            if symbol >= 0 and symbol < 16:
                allLengthList.append(symbol)
            elif symbol == 16:
                repeat = self._readBits(2) + 3
                previous = allLengthList[len(allLengthList) - 1] if len(allLengthList) > 0 else 0

                for a in range(repeat):
                    allLengthList.append(previous)
            elif symbol == 17:
                repeat = self._readBits(3) + 3

                for a in range(repeat):
                    allLengthList.append(0)
            else:
                repeat = self._readBits(7) + 11

                for a in range(repeat):
                    allLengthList.append(0)

        literalTree = self._buildHuffman(allLengthList[0:literalCount])
        distanceTree = self._buildHuffman(allLengthList[literalCount:])

        self._inflateBlock(literalTree, distanceTree)

    def _inflateStored(self):
        self.inflateBitBuffer = 0
        self.inflateBitCount = 0

        lengthLow = self.inflateInput[self.inflatePosition] if self.inflatePosition < len(self.inflateInput) else 0
        lengthHigh = self.inflateInput[self.inflatePosition + 1] if self.inflatePosition + 1 < len(self.inflateInput) else 0
        blockLength = lengthLow | (lengthHigh << 8)

        self.inflatePosition += 4

        for a in range(blockLength):
            if self.inflatePosition < len(self.inflateInput):
                self.inflateOutputList.append(self.inflateInput[self.inflatePosition])

            self.inflatePosition += 1

    def _inflate(self, byteList):
        self.inflateInput = byteList
        self.inflatePosition = 0
        self.inflateBitBuffer = 0
        self.inflateBitCount = 0
        self.inflateOutputList = []

        if len(byteList) >= 2:
            byte0 = byteList[0]
            byte1 = byteList[1]

            if (byte0 & 0x0f) == 8 and ((byte0 << 8) | byte1) % 31 == 0:
                self.inflatePosition = 2

                if (byte1 & 0x20) != 0:
                    self.inflatePosition += 4

        isFinal = False

        while isFinal == False and self.inflatePosition <= len(self.inflateInput):
            isFinal = self._readBit() == 1

            blockType = self._readBits(2)

            if blockType == 0:
                self._inflateStored()
            elif blockType == 1:
                self._inflateFixed()
            elif blockType == 2:
                self._inflateDynamic()
            else:
                isFinal = True

        resultList = bytearray(len(self.inflateOutputList))

        for a in range(len(self.inflateOutputList)):
            resultList[a] = self.inflateOutputList[a] & 0xff

        return bytes(resultList)

    def _applyPngPredictor(self, byteList, columns):
        rowLength = columns + 1
        rowCount = len(byteList) // rowLength

        resultList = bytearray(rowCount * columns)

        previousList = bytearray(columns)

        for row in range(rowCount):
            filterType = byteList[row * rowLength]
            currentList = bytearray(columns)

            for a in range(columns):
                value = byteList[row * rowLength + 1 + a]
                left = currentList[a - 1] if a >= 1 else 0
                up = previousList[a]
                upLeft = previousList[a - 1] if a >= 1 else 0

                restored = value

                if filterType == 1:
                    restored = value + left
                elif filterType == 2:
                    restored = value + up
                elif filterType == 3:
                    restored = value + (left + up) // 2
                elif filterType == 4:
                    paeth = left + up - upLeft
                    paethLeft = abs(paeth - left)
                    paethUp = abs(paeth - up)
                    paethUpLeft = abs(paeth - upLeft)

                    predictor = upLeft

                    if paethLeft <= paethUp and paethLeft <= paethUpLeft:
                        predictor = left
                    elif paethUp <= paethUpLeft:
                        predictor = up

                    restored = value + predictor

                currentList[a] = restored & 0xff
                resultList[row * columns + a] = currentList[a]

            previousList = currentList

        return bytes(resultList)

    def _skipWhitespace(self):
        isRunning = True

        while isRunning:
            if self.position >= len(self.byteList):
                isRunning = False
            else:
                code = self.byteList[self.position]

                if self._whitespaceCheck(code):
                    self.position += 1
                elif code == 37:
                    while self.position < len(self.byteList) and self.byteList[self.position] != 10 and self.byteList[self.position] != 13:
                        self.position += 1
                else:
                    isRunning = False

    def _parseName(self):
        self.position += 1

        value = ""
        isRunning = True

        while isRunning:
            if self.position >= len(self.byteList):
                isRunning = False
            else:
                code = self.byteList[self.position]

                if self._whitespaceCheck(code) or self._delimiterCheck(code):
                    isRunning = False
                elif code == 35:
                    hexText = self.text[self.position + 1:self.position + 3]

                    if re.fullmatch(r"[0-9A-Fa-f]{2}", hexText) is not None:
                        value += chr(int(hexText, 16))

                    self.position += 3
                else:
                    value += chr(code)
                    self.position += 1

        return {"kind": "name", "value": value}

    def _parseLiteralString(self):
        self.position += 1

        value = ""
        depth = 1

        while depth > 0 and self.position < len(self.byteList):
            code = self.byteList[self.position]

            if code == 92:
                nextCode = self.byteList[self.position + 1] if self.position + 1 < len(self.byteList) else 0

                if nextCode == 110:
                    value += "\n"
                    self.position += 2
                elif nextCode == 114:
                    value += "\r"
                    self.position += 2
                elif nextCode == 116:
                    value += "\t"
                    self.position += 2
                elif nextCode >= 48 and nextCode <= 55:
                    octalText = ""
                    count = 0

                    self.position += 1

                    while count < 3 and self.position < len(self.byteList) and self.byteList[self.position] >= 48 and self.byteList[self.position] <= 55:
                        octalText += chr(self.byteList[self.position])
                        self.position += 1
                        count += 1

                    if len(octalText) > 0:
                        value += chr(int(octalText, 8) & 0xff)
                else:
                    value += chr(nextCode)
                    self.position += 2
            elif code == 40:
                depth += 1
                value += "("
                self.position += 1
            elif code == 41:
                depth -= 1

                if depth > 0:
                    value += ")"

                self.position += 1
            else:
                value += chr(code)
                self.position += 1

        return {"kind": "string", "value": value}

    def _parseHexString(self):
        self.position += 1

        hexText = ""

        while self.position < len(self.byteList) and self.byteList[self.position] != 62:
            code = self.byteList[self.position]

            if self._whitespaceCheck(code) == False:
                hexText += chr(code)

            self.position += 1

        self.position += 1

        if len(hexText) % 2 == 1:
            hexText += "0"

        value = ""

        for a in range(0, len(hexText), 2):
            pairText = hexText[a:a + 2]

            if re.fullmatch(r"[0-9A-Fa-f]{2}", pairText) is not None:
                value += chr(int(pairText, 16))

        return {"kind": "hexString", "value": value}

    def _parseArray(self):
        self.position += 1

        itemList = []

        isRunning = True

        while isRunning:
            self._skipWhitespace()

            if self.position >= len(self.byteList) or self.byteList[self.position] == 93:
                self.position += 1
                isRunning = False
            else:
                itemList.append(self._parseValue())

        return {"kind": "array", "itemList": itemList}

    def _dictionaryCategory(self, entryObject):
        result = "dictionary"

        typeNode = entryObject.get("Type")

        if typeNode is not None and typeNode["kind"] == "name":
            result = typeNode["value"]

            subtypeNode = entryObject.get("Subtype")

            if subtypeNode is not None and subtypeNode["kind"] == "name":
                result = f"{typeNode['value']}:{subtypeNode['value']}"

        return result

    def _filterExtract(self, entryObject):
        resultList = []

        filterNode = entryObject.get("Filter")

        if filterNode is not None:
            if filterNode["kind"] == "name":
                resultList.append(filterNode["value"])
            elif filterNode["kind"] == "array" and filterNode.get("itemList") is not None:
                for a in range(len(filterNode["itemList"])):
                    item = filterNode["itemList"][a]

                    if item["kind"] == "name":
                        resultList.append(item["value"])

        return resultList

    def _applyPredictor(self, byteList, entryObject):
        result = byteList

        parmsNode = entryObject.get("DecodeParms")

        if parmsNode is not None and parmsNode["kind"] == "dictionary" and parmsNode.get("entryObject") is not None:
            predictorNode = parmsNode["entryObject"].get("Predictor")
            columnsNode = parmsNode["entryObject"].get("Columns")

            if predictorNode is not None and predictorNode["kind"] == "number" and predictorNode["value"] >= 10:
                columns = int(columnsNode["value"]) if columnsNode is not None and columnsNode["kind"] == "number" else 1

                result = self._applyPngPredictor(byteList, columns)

        return result

    def _decodeStream(self, rawList, entryObject, filterList):
        result = rawList

        for a in range(len(filterList)):
            if filterList[a] == "FlateDecode" or filterList[a] == "Fl":
                result = self._inflate(result)
                result = self._applyPredictor(result, entryObject)

        return result

    def _parseStream(self, entryObject, category):
        self.position += 6

        if self.position < len(self.byteList) and self.byteList[self.position] == 13:
            self.position += 1

        if self.position < len(self.byteList) and self.byteList[self.position] == 10:
            self.position += 1

        start = self.position
        endIndex = self.text.find("endstream", start)

        if endIndex < 0:
            endIndex = len(self.byteList)

        end = endIndex

        if end - 1 >= 0 and end - 1 < len(self.byteList) and self.byteList[end - 1] == 10:
            end -= 1

        if end - 1 >= 0 and end - 1 < len(self.byteList) and self.byteList[end - 1] == 13:
            end -= 1

        rawList = self.byteList[start:end]

        self.position = endIndex + 9

        filterList = self._filterExtract(entryObject)
        isImage = "Image" in category or "DCTDecode" in filterList or "JPXDecode" in filterList

        result = {
            "kind": "stream",
            "category": category,
            "entryObject": entryObject,
            "filterList": filterList,
            "rawByteLength": len(rawList)
        }

        if isImage:
            result["isImage"] = True
        else:
            decodedList = self._decodeStream(rawList, entryObject, filterList)

            result["decodedByteLength"] = len(decodedList)
            result["content"] = self._byteText(decodedList)

        return result

    def _parseDictionaryOrStream(self):
        self.position += 2

        entryObject = {}

        isRunning = True

        while isRunning:
            self._skipWhitespace()

            if self.position >= len(self.byteList):
                isRunning = False
            elif self.byteList[self.position] == 62 and self.position + 1 < len(self.byteList) and self.byteList[self.position + 1] == 62:
                self.position += 2
                isRunning = False
            elif self.byteList[self.position] == 47:
                nameNode = self._parseName()

                self._skipWhitespace()

                entryObject[nameNode["value"]] = self._parseValue()
            else:
                isRunning = False

        category = self._dictionaryCategory(entryObject)

        self._skipWhitespace()

        result = {"kind": "dictionary", "category": category, "entryObject": entryObject}

        if self.text[self.position:self.position + 6] == "stream":
            result = self._parseStream(entryObject, category)

        return result

    def _parseNumberOrReference(self):
        savedPosition = self.position

        numberText = ""
        isRunning = True

        while isRunning:
            if self.position >= len(self.byteList):
                isRunning = False
            else:
                code = self.byteList[self.position]

                if self._digitCheck(code) or code == 43 or code == 45 or code == 46:
                    numberText += chr(code)
                    self.position += 1
                else:
                    isRunning = False

        firstNumber = self._floatParse(numberText)

        result = {"kind": "number", "value": firstNumber}

        if "." not in numberText:
            afterFirst = self.position

            self._skipWhitespace()

            secondText = ""

            while self.position < len(self.byteList) and self._digitCheck(self.byteList[self.position]):
                secondText += chr(self.byteList[self.position])
                self.position += 1

            if len(secondText) > 0:
                self._skipWhitespace()

                if self.position < len(self.byteList) and self.byteList[self.position] == 82:
                    self.position += 1
                    result = {"kind": "reference", "number": int(firstNumber), "generation": int(secondText)}
                else:
                    self.position = afterFirst
            else:
                self.position = afterFirst

        if result["kind"] == "number":
            self.position = savedPosition + len(numberText)

        return result

    def _parseValue(self):
        self._skipWhitespace()

        code = self.byteList[self.position] if self.position < len(self.byteList) else 0

        if code == 47:
            result = self._parseName()
        elif code == 40:
            result = self._parseLiteralString()
        elif code == 60 and self.position + 1 < len(self.byteList) and self.byteList[self.position + 1] == 60:
            result = self._parseDictionaryOrStream()
        elif code == 60:
            result = self._parseHexString()
        elif code == 91:
            result = self._parseArray()
        elif self._digitCheck(code) or code == 43 or code == 45 or code == 46:
            result = self._parseNumberOrReference()
        elif self.text[self.position:self.position + 4] == "true":
            self.position += 4
            result = {"kind": "boolean", "value": True}
        elif self.text[self.position:self.position + 5] == "false":
            self.position += 5
            result = {"kind": "boolean", "value": False}
        elif self.text[self.position:self.position + 4] == "null":
            self.position += 4
            result = {"kind": "null"}
        else:
            operator = ""

            while (
                self.position < len(self.byteList)
                and self._whitespaceCheck(self.byteList[self.position]) == False
                and self._delimiterCheck(self.byteList[self.position]) == False
            ):
                operator += chr(self.byteList[self.position])
                self.position += 1

            result = {"kind": "operator", "value": operator}

        return result

    def _streamIndirectExpand(self, indirect):
        resultList = []

        streamNode = indirect["value"]

        if streamNode["kind"] == "stream" and streamNode.get("category") == "ObjStm" and streamNode.get("content") is not None and streamNode.get("entryObject") is not None:
            countNode = streamNode["entryObject"].get("N")
            firstNode = streamNode["entryObject"].get("First")

            if countNode is not None and countNode["kind"] == "number" and firstNode is not None and firstNode["kind"] == "number":
                count = int(countNode["value"])
                first = int(firstNode["value"])

                savedByteList = self.byteList
                savedText = self.text
                savedPosition = self.position

                self.text = streamNode["content"]
                self.byteList = self._textByte(streamNode["content"])

                headerList = []

                self.position = 0

                for a in range(count):
                    self._skipWhitespace()
                    numberNode = self._parseValue()
                    self._skipWhitespace()
                    offsetNode = self._parseValue()

                    if numberNode["kind"] == "number" and offsetNode["kind"] == "number":
                        headerList.append({"number": int(numberNode["value"]), "offset": int(offsetNode["value"])})

                for a in range(len(headerList)):
                    self.position = first + headerList[a]["offset"]

                    value = self._parseValue()

                    category = value["kind"]

                    if (value["kind"] == "dictionary" or value["kind"] == "stream") and value.get("category") is not None:
                        category = value["category"]

                    resultList.append({"number": headerList[a]["number"], "generation": 0, "category": category, "value": value})

                self.byteList = savedByteList
                self.text = savedText
                self.position = savedPosition

        return resultList

    def _parseIndirect(self):
        resultList = []

        matchList = list(re.finditer(r"(\d+)\s+(\d+)\s+obj\b", self.text))

        for a in range(len(matchList)):
            self.position = matchList[a].end()

            value = self._parseValue()

            category = value["kind"]

            if (value["kind"] == "dictionary" or value["kind"] == "stream") and value.get("category") is not None:
                category = value["category"]

            resultList.append({
                "number": int(matchList[a].group(1)),
                "generation": int(matchList[a].group(2)),
                "category": category,
                "value": value
            })

        expandedList = []

        for a in range(len(resultList)):
            nestedList = self._streamIndirectExpand(resultList[a])

            for b in range(len(nestedList)):
                expandedList.append(nestedList[b])

        for a in range(len(expandedList)):
            resultList.append(expandedList[a])

        return resultList

    def _resolve(self, node):
        result = node

        while result is not None and result["kind"] == "reference":
            found = self.indirectObject.get(result["number"])

            result = found["value"] if found is not None else None

        return result

    def _numberValue(self, node):
        result = 0

        resolved = self._resolve(node)

        if resolved is not None and resolved["kind"] == "number":
            result = resolved["value"]

        return result

    def _utf16Hex(self, hexText):
        result = ""

        for a in range(0, len(hexText) - 3, 4):
            result += chr(int(hexText[a:a + 4], 16))

        return result

    def _buildToUnicode(self, content):
        resultObject = {}

        charBlockList = list(re.finditer(r"beginbfchar([\s\S]*?)endbfchar", content))

        for a in range(len(charBlockList)):
            pairList = list(re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", charBlockList[a].group(1)))

            for b in range(len(pairList)):
                resultObject[int(pairList[b].group(1), 16)] = self._utf16Hex(pairList[b].group(2))

        rangeBlockList = list(re.finditer(r"beginbfrange([\s\S]*?)endbfrange", content))

        for a in range(len(rangeBlockList)):
            lineList = list(re.finditer(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[\s\S]*?\]|<[0-9A-Fa-f]+>)", rangeBlockList[a].group(1)))

            for b in range(len(lineList)):
                low = int(lineList[b].group(1), 16)
                high = int(lineList[b].group(2), 16)
                destination = lineList[b].group(3)

                if destination[0:1] == "[":
                    itemList = list(re.finditer(r"<([0-9A-Fa-f]+)>", destination))
                    code = low

                    for c in range(len(itemList)):
                        if code <= high:
                            resultObject[code] = self._utf16Hex(itemList[c].group(1))
                            code += 1
                else:
                    base = int(destination.replace("<", "").replace(">", ""), 16)

                    for c in range(high - low + 1):
                        resultObject[low + c] = chr((base + c) & 0xffff)

        return resultObject

    def _cidWidth(self, cidFontObject):
        resultObject = {}

        widthNode = self._resolve(cidFontObject.get("W"))

        if widthNode is not None and widthNode["kind"] == "array" and widthNode.get("itemList") is not None:
            itemList = widthNode["itemList"]

            a = 0

            while a < len(itemList):
                first = self._numberValue(itemList[a])
                second = self._resolve(itemList[a + 1]) if a + 1 < len(itemList) else None

                if second is not None and second["kind"] == "array" and second.get("itemList") is not None:
                    for b in range(len(second["itemList"])):
                        resultObject[int(first) + b] = self._numberValue(second["itemList"][b]) / 1000

                    a += 2
                else:
                    last = self._numberValue(itemList[a + 1]) if a + 1 < len(itemList) else 0
                    width = self._numberValue(itemList[a + 2]) / 1000 if a + 2 < len(itemList) else 0

                    for cid in range(int(first), int(last) + 1):
                        resultObject[cid] = width

                    a += 3

        return resultObject

    def _buildFont(self, fontNode):
        entryObject = fontNode["entryObject"] if fontNode.get("entryObject") is not None else {}

        baseFontNode = self._resolve(entryObject.get("BaseFont"))
        baseFont = baseFontNode["value"] if baseFontNode is not None and baseFontNode["kind"] == "name" else ""

        subtypeNode = self._resolve(entryObject.get("Subtype"))
        subtype = subtypeNode["value"] if subtypeNode is not None and subtypeNode["kind"] == "name" else ""

        isBold = "bold" in baseFont.lower()
        byteLength = 2 if subtype == "Type0" else 1

        result = {
            "baseFont": baseFont,
            "isBold": isBold,
            "byteLength": byteLength,
            "firstChar": 0,
            "widthList": [],
            "widthScale": 0.001,
            "widthObject": {},
            "defaultWidthFraction": 0.5,
            "toUnicodeObject": {}
        }

        toUnicodeNode = self._resolve(entryObject.get("ToUnicode"))

        if toUnicodeNode is not None and toUnicodeNode["kind"] == "stream" and toUnicodeNode.get("content") is not None:
            result["toUnicodeObject"] = self._buildToUnicode(toUnicodeNode["content"])

        if subtype == "Type0":
            descendantNode = self._resolve(entryObject.get("DescendantFonts"))

            if descendantNode is not None and descendantNode["kind"] == "array" and descendantNode.get("itemList") is not None:
                cidFontNode = self._resolve(descendantNode["itemList"][0] if len(descendantNode["itemList"]) > 0 else None)

                if cidFontNode is not None and cidFontNode.get("entryObject") is not None:
                    defaultWidthNode = self._resolve(cidFontNode["entryObject"].get("DW"))

                    result["defaultWidthFraction"] = defaultWidthNode["value"] / 1000 if defaultWidthNode is not None and defaultWidthNode["kind"] == "number" else 1
                    result["widthObject"] = self._cidWidth(cidFontNode["entryObject"])
        else:
            firstCharNode = self._resolve(entryObject.get("FirstChar"))

            if firstCharNode is not None and firstCharNode["kind"] == "number":
                result["firstChar"] = int(firstCharNode["value"])

            widthsNode = self._resolve(entryObject.get("Widths"))

            if widthsNode is not None and widthsNode["kind"] == "array" and widthsNode.get("itemList") is not None:
                for a in range(len(widthsNode["itemList"])):
                    result["widthList"].append(self._numberValue(widthsNode["itemList"][a]))

            if subtype == "Type3":
                matrixNode = self._resolve(entryObject.get("FontMatrix"))

                if matrixNode is not None and matrixNode["kind"] == "array" and matrixNode.get("itemList") is not None:
                    result["widthScale"] = self._numberValue(matrixNode["itemList"][0] if len(matrixNode["itemList"]) > 0 else None)

        return result

    def _fontDecode(self, font, raw):
        charList = []
        widthFractionList = []
        codeList = []

        for a in range(0, len(raw), font["byteLength"]):
            code = ord(raw[a])

            if font["byteLength"] == 2:
                code = (ord(raw[a]) << 8) | (ord(raw[a + 1]) if a + 1 < len(raw) else 0)

            character = font["toUnicodeObject"].get(code)

            if character is None:
                character = chr(code) if font["byteLength"] == 1 else ""

            widthFraction = font["defaultWidthFraction"]

            if font["byteLength"] == 2:
                if font["widthObject"].get(code) is not None:
                    widthFraction = font["widthObject"][code]
            elif code >= font["firstChar"] and code - font["firstChar"] < len(font["widthList"]):
                widthFraction = font["widthList"][code - font["firstChar"]] * font["widthScale"]

            charList.append(character)
            widthFractionList.append(widthFraction)
            codeList.append(code)

        return {"charList": charList, "widthFractionList": widthFractionList, "codeList": codeList}

    def _matrixMultiply(self, leftList, rightList):
        return [
            leftList[0] * rightList[0] + leftList[1] * rightList[2],
            leftList[0] * rightList[1] + leftList[1] * rightList[3],
            leftList[2] * rightList[0] + leftList[3] * rightList[2],
            leftList[2] * rightList[1] + leftList[3] * rightList[3],
            leftList[4] * rightList[0] + leftList[5] * rightList[2] + rightList[4],
            leftList[4] * rightList[1] + leftList[5] * rightList[3] + rightList[5]
        ]

    def _transformPoint(self, x, y, matrixList):
        return [x * matrixList[0] + y * matrixList[2] + matrixList[4], x * matrixList[1] + y * matrixList[3] + matrixList[5]]

    def _componentHex(self, value):
        clamped = max(0, min(255, math.floor(value * 255 + 0.5)))

        return f"{clamped:02x}"

    def _colorRgb(self, red, green, blue):
        return f"#{self._componentHex(red)}{self._componentHex(green)}{self._componentHex(blue)}"

    def _pathAddPoint(self, x, y):
        pointList = self._transformPoint(x, y, self.ctmList)

        if self.isPathEmpty:
            self.pathMinX = pointList[0]
            self.pathMinY = pointList[1]
            self.pathMaxX = pointList[0]
            self.pathMaxY = pointList[1]
            self.isPathEmpty = False
        else:
            self.pathMinX = min(self.pathMinX, pointList[0])
            self.pathMinY = min(self.pathMinY, pointList[1])
            self.pathMaxX = max(self.pathMaxX, pointList[0])
            self.pathMaxY = max(self.pathMaxY, pointList[1])

    def _pathReset(self):
        self.isPathEmpty = True
        self.isPathRectangle = False

    def _pathPaint(self, isFill, isStroke):
        if self.isPathEmpty == False:
            self.elementList.append({
                "type": "rect" if self.isPathRectangle else "path",
                "x0": self.pathMinX,
                "y0": self.pageHeight - self.pathMaxY,
                "x1": self.pathMaxX,
                "y1": self.pageHeight - self.pathMinY,
                "color": self.fillColor if isFill else self.strokeColor,
                "isFill": isFill,
                "isStroke": isStroke
            })

        self._pathReset()

    def _showText(self, font, partList):
        text = ""
        advance = 0

        for a in range(len(partList)):
            part = partList[a]

            if part["kind"] == "string" or part["kind"] == "hexString":
                decoded = self._fontDecode(font, part["value"])

                for b in range(len(decoded["charList"])):
                    text += decoded["charList"][b]

                    glyph = decoded["widthFractionList"][b] * self.fontSize + self.charSpacing

                    if font["byteLength"] == 1 and decoded["codeList"][b] == 32:
                        glyph += self.wordSpacing

                    advance += glyph * self.horizontalScale
            elif part["kind"] == "number":
                advance -= part["value"] / 1000 * self.fontSize * self.horizontalScale

        renderMatrixList = self._matrixMultiply(self.textMatrixList, self.ctmList)
        deviceFontSize = self.fontSize * math.hypot(renderMatrixList[2], renderMatrixList[3])

        startList = self._transformPoint(0, 0, renderMatrixList)
        endList = self._transformPoint(advance, 0, renderMatrixList)

        if len(text.strip()) > 0:
            self.elementList.append({
                "type": "text",
                "text": text,
                "x0": min(startList[0], endList[0]),
                "y0": self.pageHeight - (startList[1] + deviceFontSize * 0.8),
                "x1": max(startList[0], endList[0]),
                "y1": self.pageHeight - (startList[1] - deviceFontSize * 0.2),
                "fontName": font["baseFont"],
                "fontSize": math.floor(deviceFontSize * 100 + 0.5) / 100,
                "isBold": font["isBold"],
                "color": self.fillColor
            })

        self.textMatrixList = self._matrixMultiply([1, 0, 0, 1, advance, 0], self.textMatrixList)

    def _handleOperator(self, operator, stackList, fontObject, externalObject):
        def number(indexFromEnd):
            result = 0

            if indexFromEnd >= 1 and indexFromEnd <= len(stackList):
                node = stackList[len(stackList) - indexFromEnd]

                if node["kind"] == "number":
                    result = node["value"]

            return result

        if operator == "cm":
            self.ctmList = self._matrixMultiply([number(6), number(5), number(4), number(3), number(2), number(1)], self.ctmList)
        elif operator == "q":
            self.graphicsStateList.append(list(self.ctmList))
        elif operator == "Q":
            if len(self.graphicsStateList) > 0:
                self.ctmList = self.graphicsStateList.pop()
        elif operator == "BT":
            self.textMatrixList = [1, 0, 0, 1, 0, 0]
            self.lineMatrixList = [1, 0, 0, 1, 0, 0]
        elif operator == "Tf":
            nameNode = stackList[len(stackList) - 2] if len(stackList) >= 2 else None

            self.fontSize = number(1)

            if nameNode is not None and nameNode["kind"] == "name":
                self.currentFont = fontObject.get(nameNode["value"])
        elif operator == "Td":
            self.lineMatrixList = self._matrixMultiply([1, 0, 0, 1, number(2), number(1)], self.lineMatrixList)
            self.textMatrixList = list(self.lineMatrixList)
        elif operator == "TD":
            self.leading = -number(1)
            self.lineMatrixList = self._matrixMultiply([1, 0, 0, 1, number(2), number(1)], self.lineMatrixList)
            self.textMatrixList = list(self.lineMatrixList)
        elif operator == "Tm":
            self.lineMatrixList = [number(6), number(5), number(4), number(3), number(2), number(1)]
            self.textMatrixList = list(self.lineMatrixList)
        elif operator == "T*":
            self.lineMatrixList = self._matrixMultiply([1, 0, 0, 1, 0, -self.leading], self.lineMatrixList)
            self.textMatrixList = list(self.lineMatrixList)
        elif operator == "Tc":
            self.charSpacing = number(1)
        elif operator == "Tw":
            self.wordSpacing = number(1)
        elif operator == "Tz":
            self.horizontalScale = number(1) / 100
        elif operator == "TL":
            self.leading = number(1)
        elif operator == "Ts":
            self.textRise = number(1)
        elif operator == "Tj" and self.currentFont is not None:
            if len(stackList) > 0:
                self._showText(self.currentFont, [stackList[len(stackList) - 1]])
        elif operator == "TJ" and self.currentFont is not None:
            arrayNode = stackList[len(stackList) - 1] if len(stackList) > 0 else None

            if arrayNode is not None and arrayNode["kind"] == "array" and arrayNode.get("itemList") is not None:
                self._showText(self.currentFont, arrayNode["itemList"])
        elif (operator == "'" or operator == '"') and self.currentFont is not None:
            self.lineMatrixList = self._matrixMultiply([1, 0, 0, 1, 0, -self.leading], self.lineMatrixList)
            self.textMatrixList = list(self.lineMatrixList)

            if len(stackList) > 0:
                self._showText(self.currentFont, [stackList[len(stackList) - 1]])
        elif operator == "g":
            self.fillColor = self._colorRgb(number(1), number(1), number(1))
        elif operator == "G":
            self.strokeColor = self._colorRgb(number(1), number(1), number(1))
        elif operator == "rg":
            self.fillColor = self._colorRgb(number(3), number(2), number(1))
        elif operator == "RG":
            self.strokeColor = self._colorRgb(number(3), number(2), number(1))
        elif operator == "k":
            self.fillColor = self._colorRgb((1 - number(4)) * (1 - number(1)), (1 - number(3)) * (1 - number(1)), (1 - number(2)) * (1 - number(1)))
        elif operator == "K":
            self.strokeColor = self._colorRgb((1 - number(4)) * (1 - number(1)), (1 - number(3)) * (1 - number(1)), (1 - number(2)) * (1 - number(1)))
        elif operator == "m" or operator == "l":
            self._pathAddPoint(number(2), number(1))
        elif operator == "c":
            self._pathAddPoint(number(2), number(1))
        elif operator == "v" or operator == "y":
            self._pathAddPoint(number(2), number(1))
        elif operator == "re":
            x = number(4)
            y = number(3)
            width = number(2)
            height = number(1)
            wasEmpty = self.isPathEmpty

            self._pathAddPoint(x, y)
            self._pathAddPoint(x + width, y + height)

            self.isPathRectangle = wasEmpty
        elif operator == "f" or operator == "F" or operator == "f*":
            self._pathPaint(True, False)
        elif operator == "S" or operator == "s":
            self._pathPaint(False, True)
        elif operator == "B" or operator == "B*" or operator == "b" or operator == "b*":
            self._pathPaint(True, True)
        elif operator == "n":
            self._pathReset()
        elif operator == "Do":
            nameNode = stackList[len(stackList) - 1] if len(stackList) > 0 else None

            if nameNode is not None and nameNode["kind"] == "name":
                external = externalObject.get(nameNode["value"])

                if external is not None and external["subtype"] == "Image":
                    cornerAList = self._transformPoint(0, 0, self.ctmList)
                    cornerBList = self._transformPoint(1, 1, self.ctmList)

                    self.elementList.append({
                        "type": "image",
                        "x0": min(cornerAList[0], cornerBList[0]),
                        "y0": self.pageHeight - max(cornerAList[1], cornerBList[1]),
                        "x1": max(cornerAList[0], cornerBList[0]),
                        "y1": self.pageHeight - min(cornerAList[1], cornerBList[1]),
                        "referenceNumber": external["referenceNumber"]
                    })
        elif operator == "BI":
            endIndex = self.text.find("EI", self.position)

            self.position = endIndex + 2 if endIndex >= 0 else len(self.byteList)

    def _resourceFont(self, resourceObject):
        resultObject = {}

        fontNode = self._resolve(resourceObject.get("Font"))

        if fontNode is not None and fontNode["kind"] == "dictionary" and fontNode.get("entryObject") is not None:
            nameList = list(fontNode["entryObject"].keys())

            for a in range(len(nameList)):
                resolved = self._resolve(fontNode["entryObject"][nameList[a]])

                if resolved is not None:
                    resultObject[nameList[a]] = self._buildFont(resolved)

        return resultObject

    def _resourceExternal(self, resourceObject):
        resultObject = {}

        externalNode = self._resolve(resourceObject.get("XObject"))

        if externalNode is not None and externalNode["kind"] == "dictionary" and externalNode.get("entryObject") is not None:
            nameList = list(externalNode["entryObject"].keys())

            for a in range(len(nameList)):
                reference = externalNode["entryObject"][nameList[a]]
                resolved = self._resolve(reference)

                if resolved is not None and resolved.get("entryObject") is not None:
                    subtypeNode = self._resolve(resolved["entryObject"].get("Subtype"))

                    resultObject[nameList[a]] = {
                        "referenceNumber": reference["number"] if reference["kind"] == "reference" else 0,
                        "subtype": subtypeNode["value"] if subtypeNode is not None and subtypeNode["kind"] == "name" else "",
                        "width": self._numberValue(resolved["entryObject"].get("Width")),
                        "height": self._numberValue(resolved["entryObject"].get("Height"))
                    }

        return resultObject

    def _interpretContent(self, content, resourceObject):
        fontObject = self._resourceFont(resourceObject)
        externalObject = self._resourceExternal(resourceObject)

        self.byteList = self._textByte(content)
        self.text = content
        self.position = 0

        stackList = []

        while self.position < len(self.byteList):
            self._skipWhitespace()

            if self.position >= len(self.byteList):
                break

            node = self._parseValue()

            if node["kind"] == "operator":
                if len(node["value"]) > 0:
                    self._handleOperator(node["value"], stackList, fontObject, externalObject)
                else:
                    self.position += 1

                stackList = []
            else:
                stackList.append(node)

    def _collectPage(self, node, parentResourceObject, parentMediaBoxList, resultList):
        resolved = self._resolve(node)

        if resolved is not None and resolved.get("entryObject") is not None:
            resourceObject = parentResourceObject
            mediaBoxList = parentMediaBoxList

            resourceNode = self._resolve(resolved["entryObject"].get("Resources"))

            if resourceNode is not None and resourceNode.get("entryObject") is not None:
                resourceObject = resourceNode["entryObject"]

            mediaBoxNode = self._resolve(resolved["entryObject"].get("MediaBox"))

            if mediaBoxNode is not None and mediaBoxNode["kind"] == "array" and mediaBoxNode.get("itemList") is not None:
                itemList = mediaBoxNode["itemList"]

                mediaBoxList = [
                    self._numberValue(itemList[0] if len(itemList) > 0 else None),
                    self._numberValue(itemList[1] if len(itemList) > 1 else None),
                    self._numberValue(itemList[2] if len(itemList) > 2 else None),
                    self._numberValue(itemList[3] if len(itemList) > 3 else None)
                ]

            typeNode = self._resolve(resolved["entryObject"].get("Type"))
            type = typeNode["value"] if typeNode is not None and typeNode["kind"] == "name" else ""

            if type == "Page":
                resultList.append({"entryObject": resolved["entryObject"], "resourceObject": resourceObject, "mediaBoxList": mediaBoxList})
            else:
                kidsNode = self._resolve(resolved["entryObject"].get("Kids"))

                if kidsNode is not None and kidsNode["kind"] == "array" and kidsNode.get("itemList") is not None:
                    for a in range(len(kidsNode["itemList"])):
                        self._collectPage(kidsNode["itemList"][a], resourceObject, mediaBoxList, resultList)

    def _pageContent(self, entryObject):
        result = ""

        contentNode = self._resolve(entryObject.get("Contents"))

        if contentNode is not None:
            if contentNode["kind"] == "stream" and contentNode.get("content") is not None:
                result = contentNode["content"]
            elif contentNode["kind"] == "array" and contentNode.get("itemList") is not None:
                for a in range(len(contentNode["itemList"])):
                    part = self._resolve(contentNode["itemList"][a])

                    if part is not None and part["kind"] == "stream" and part.get("content") is not None:
                        result += f"{part['content']}\n"

        return result

    def _pageLink(self, entryObject):
        annotsNode = self._resolve(entryObject.get("Annots"))

        if annotsNode is not None and annotsNode["kind"] == "array" and annotsNode.get("itemList") is not None:
            for a in range(len(annotsNode["itemList"])):
                annot = self._resolve(annotsNode["itemList"][a])

                if annot is not None and annot.get("entryObject") is not None:
                    subtypeNode = self._resolve(annot["entryObject"].get("Subtype"))

                    if subtypeNode is not None and subtypeNode["kind"] == "name" and subtypeNode["value"] == "Link":
                        rectNode = self._resolve(annot["entryObject"].get("Rect"))
                        actionNode = self._resolve(annot["entryObject"].get("A"))

                        uri = ""

                        if actionNode is not None and actionNode.get("entryObject") is not None:
                            uriNode = self._resolve(actionNode["entryObject"].get("URI"))

                            if uriNode is not None and (uriNode["kind"] == "string" or uriNode["kind"] == "hexString"):
                                uri = uriNode["value"]

                        if rectNode is not None and rectNode["kind"] == "array" and rectNode.get("itemList") is not None:
                            itemList = rectNode["itemList"]

                            left = self._numberValue(itemList[0] if len(itemList) > 0 else None)
                            bottom = self._numberValue(itemList[1] if len(itemList) > 1 else None)
                            right = self._numberValue(itemList[2] if len(itemList) > 2 else None)
                            top = self._numberValue(itemList[3] if len(itemList) > 3 else None)

                            self.elementList.append({
                                "type": "link",
                                "x0": min(left, right),
                                "y0": self.pageHeight - max(top, bottom),
                                "x1": max(left, right),
                                "y1": self.pageHeight - min(top, bottom),
                                "uri": uri
                            })

    def _wideCheck(self, character):
        return character != "" and unicodedata.east_asian_width(character) in ("W", "F")

    def _mergeText(self, elementList):
        resultList = []

        current = None
        pendingList = []

        for a in range(len(elementList)):
            element = elementList[a]

            if element["type"] != "text":
                if current is None:
                    resultList.append(element)
                else:
                    pendingList.append(element)
            elif current is None:
                current = element
            else:
                size = current["fontSize"] if current.get("fontSize") is not None else 0
                elementSize = element["fontSize"] if element.get("fontSize") is not None else 0
                gap = element["x0"] - current["x1"]

                isSameLine = abs(element["y0"] - current["y0"]) <= size * 0.6
                isCompatibleSize = elementSize >= size * 0.45 and elementSize <= size * 1.4
                isClose = gap >= -size * 0.3 and gap <= size * 1.0

                if isSameLine and isCompatibleSize and isClose:
                    previousText = current["text"] if current.get("text") is not None else ""
                    elementText = element["text"] if element.get("text") is not None else ""
                    isSpace = gap > size * 0.15 and previousText[-1:] != " " and elementText[0:1] != " "

                    if self._wideCheck(previousText[-1:]) and self._wideCheck(elementText[0:1]):
                        isSpace = False

                    current["text"] = f"{previousText} {elementText}" if isSpace else f"{previousText}{elementText}"
                    current["x1"] = element["x1"]
                    current["y0"] = min(current["y0"], element["y0"])
                    current["y1"] = max(current["y1"], element["y1"])
                else:
                    resultList.append(current)

                    for b in range(len(pendingList)):
                        resultList.append(pendingList[b])

                    pendingList = []
                    current = element

        if current is not None:
            resultList.append(current)

        for a in range(len(pendingList)):
            resultList.append(pendingList[a])

        return resultList

    def _buildPage(self):
        resultList = []

        trailerIndex = self.text.rfind("trailer")

        rootNode = None

        if trailerIndex >= 0:
            self.position = trailerIndex + 7
            self._skipWhitespace()

            trailer = self._parseValue()

            if trailer.get("entryObject") is not None:
                rootNode = trailer["entryObject"].get("Root")

        if rootNode is None:
            indirectList = list(self.indirectObject.values())

            for a in range(len(indirectList)):
                if indirectList[a]["category"] == "Catalog":
                    rootNode = indirectList[a]["value"]

        catalog = self._resolve(rootNode)
        pageRawList = []

        if catalog is not None and catalog.get("entryObject") is not None:
            self._collectPage(catalog["entryObject"].get("Pages"), {}, [0, 0, 595, 842], pageRawList)

        for a in range(len(pageRawList)):
            pageRaw = pageRawList[a]

            self.ctmList = [1, 0, 0, 1, 0, 0]
            self.textMatrixList = [1, 0, 0, 1, 0, 0]
            self.lineMatrixList = [1, 0, 0, 1, 0, 0]
            self.graphicsStateList = []
            self.fontSize = 0
            self.charSpacing = 0
            self.wordSpacing = 0
            self.horizontalScale = 1
            self.leading = 0
            self.textRise = 0
            self.fillColor = "#000000"
            self.strokeColor = "#000000"
            self.currentFont = None
            self._pathReset()

            width = pageRaw["mediaBoxList"][2] - pageRaw["mediaBoxList"][0]
            height = pageRaw["mediaBoxList"][3] - pageRaw["mediaBoxList"][1]

            self.pageHeight = height
            self.elementList = []

            content = self._pageContent(pageRaw["entryObject"])

            self._interpretContent(content, pageRaw["resourceObject"])
            self._pageLink(pageRaw["entryObject"])

            resultList.append({"number": a + 1, "width": width, "height": height, "elementList": self._mergeText(self.elementList)})

        return resultList

    def execute(self, pathInput):
        with open(pathInput, "rb") as file:
            self.byteList = bytes(file.read())

        self.text = self._byteText(self.byteList)
        self.position = 0

        indirectList = self._parseIndirect()

        self.indirectObject = {}

        for a in range(len(indirectList)):
            self.indirectObject[indirectList[a]["number"]] = indirectList[a]

        return self._buildPage()

    def __init__(self):
        self.lengthBaseList = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
        self.lengthExtraList = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
        self.distanceBaseList = [
            1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385,
            24577
        ]
        self.distanceExtraList = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
        self.codeLengthOrderList = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

        self.inflateInput = b""
        self.inflatePosition = 0
        self.inflateBitBuffer = 0
        self.inflateBitCount = 0
        self.inflateOutputList = []

        self.ctmList = [1, 0, 0, 1, 0, 0]
        self.textMatrixList = [1, 0, 0, 1, 0, 0]
        self.lineMatrixList = [1, 0, 0, 1, 0, 0]
        self.graphicsStateList = []
        self.fontSize = 0
        self.charSpacing = 0
        self.wordSpacing = 0
        self.horizontalScale = 1
        self.leading = 0
        self.textRise = 0
        self.fillColor = "#000000"
        self.strokeColor = "#000000"
        self.currentFont = None

        self.pageHeight = 0
        self.elementList = []

        self.pathMinX = 0
        self.pathMinY = 0
        self.pathMaxX = 0
        self.pathMaxY = 0
        self.isPathEmpty = True
        self.isPathRectangle = False

        self.byteList = b""
        self.text = ""
        self.position = 0

        self.indirectObject = {}

class Markdown:
    class Pdf:
        def _medianFontSize(self, elementList):
            result = 12

            sizeList = []

            for a in range(len(elementList)):
                sizeList.append(elementList[a]["fontSize"])

            sizeList.sort()

            if len(sizeList) > 0 and sizeList[len(sizeList) // 2] > 0:
                result = sizeList[len(sizeList) // 2]

            return result

        def _titleSizeKey(self, elementList):
            return math.floor(self._medianFontSize(elementList) + 0.5)

        def _titleSizeRank(self, pageObject, astPageList):
            resultList = []

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                if astPage["number"] in pageObject:
                    page = pageObject[astPage["number"]]

                    scaleX = page["width"] / astPage["imageWidth"]
                    scaleY = page["height"] / astPage["imageHeight"]

                    for b in range(len(astPage["itemMainList"])):
                        item = astPage["itemMainList"][b]

                        if item["label"] == "paragraph_title":
                            elementList = self._elementBoxCollect(page, item["coordinate"], scaleX, scaleY)

                            if len(elementList) > 0:
                                key = self._titleSizeKey(elementList)

                                if key not in resultList:
                                    resultList.append(key)

            resultList.sort(reverse=True)

            return resultList

        def _headingHash(self, titleSizeRankList, key):
            level = 2

            if key in titleSizeRankList:
                level = 2 + titleSizeRankList.index(key)

            return "#" * min(level, 6)

        def _lineGroup(self, elementList):
            resultList = []

            elementSortList = sorted(elementList, key=lambda element: element["y0"])

            for a in range(len(elementSortList)):
                element = elementSortList[a]

                isFound = False

                for b in range(len(resultList)):
                    line = resultList[b]

                    overlap = min(line["y1"], element["y1"]) - max(line["y0"], element["y0"])
                    height = min(line["y1"] - line["y0"], element["y1"] - element["y0"])

                    if height > 0 and overlap / height >= 0.5:
                        line["elementList"].append(element)

                        line["y0"] = min(line["y0"], element["y0"])
                        line["y1"] = max(line["y1"], element["y1"])

                        isFound = True

                        break

                if isFound == False:
                    resultList.append({"elementList": [element], "x0": 0, "x1": 0, "y0": element["y0"], "y1": element["y1"]})

            for a in range(len(resultList)):
                line = resultList[a]

                line["elementList"].sort(key=lambda element: element["x0"])

                line["x0"] = line["elementList"][0]["x0"]
                line["x1"] = line["elementList"][len(line["elementList"]) - 1]["x1"]

            resultList.sort(key=lambda line: line["y0"])

            return resultList

        def _wideCheck(self, character):
            return character != "" and unicodedata.east_asian_width(character) in ("W", "F")

        def _lineText(self, line, isPlain):
            result = ""

            for a in range(len(line["elementList"])):
                text = line["elementList"][a]["text"].strip()

                if len(text) > 0:
                    if isPlain == False and line["elementList"][a]["isBold"] == True:
                        text = f"**{text}**"

                    if len(result) == 0:
                        result = text
                    elif self._wideCheck(result[-1:]) and self._wideCheck(text[0:1]):
                        result += text
                    else:
                        result += f" {text}"

            return result

        def _elementBoxCollect(self, page, coordinate, scaleX, scaleY):
            resultList = []

            x1 = coordinate[0] * scaleX
            y1 = coordinate[1] * scaleY
            x2 = coordinate[2] * scaleX
            y2 = coordinate[3] * scaleY

            for a in range(len(page["elementList"])):
                element = page["elementList"][a]

                if element["type"] == "text":
                    centerX = (element["x0"] + element["x1"]) / 2
                    centerY = (element["y0"] + element["y1"]) / 2

                    if centerX >= x1 and centerX <= x2 and centerY >= y1 and centerY <= y2:
                        resultList.append(element)

            return resultList

        def _itemText(self, elementList, isPlain, boxX0):
            result = ""

            lineList = self._lineGroup(elementList)

            fontSize = self._medianFontSize(elementList)

            maxX1 = 0
            minX0 = 0

            for a in range(len(lineList)):
                maxX1 = max(maxX1, lineList[a]["x1"])
                minX0 = lineList[a]["x0"] if a == 0 else min(minX0, lineList[a]["x0"])

            isMarker = len(lineList) > 1 and minX0 - boxX0 > fontSize * 0.8

            for a in range(len(lineList)):
                if abs(lineList[a]["x0"] - minX0) > fontSize * 0.15:
                    isMarker = False

            openText = None

            for a in range(len(lineList)):
                lineText = self._lineText(lineList[a], isPlain)

                if a == 0:
                    result = f"- {lineText}" if isMarker else lineText
                else:
                    separator = " "

                    if self._wideCheck(result[-1:]) and self._wideCheck(lineText[0:1]):
                        separator = ""

                    if openText is not None and "://" in f"{openText}{lineText.split(')')[0]}":
                        separator = ""
                    elif isPlain == False:
                        if isMarker:
                            separator = "\n- "
                        elif lineList[a]["x0"] < lineList[a - 1]["x0"] - fontSize * 0.15:
                            separator = "\n"
                        elif lineList[a - 1]["x1"] < maxX1 - fontSize * 4:
                            separator = "\n"

                    result += f"{separator}{lineText}"

                for b in range(len(lineText)):
                    if lineText[b] == "(":
                        openText = ""
                    elif lineText[b] == ")":
                        openText = None
                    elif openText is not None:
                        openText += lineText[b]

            return result

        def execute(self, pageList, astPageList):
            result = ""

            pageObject = {}

            for a in range(len(pageList)):
                pageObject[pageList[a]["number"]] = pageList[a]

            titleSizeRankList = self._titleSizeRank(pageObject, astPageList)

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                if astPage["number"] in pageObject:
                    page = pageObject[astPage["number"]]

                    scaleX = page["width"] / astPage["imageWidth"]
                    scaleY = page["height"] / astPage["imageHeight"]

                    for b in range(len(astPage["itemMainList"])):
                        item = astPage["itemMainList"][b]

                        elementList = self._elementBoxCollect(page, item["coordinate"], scaleX, scaleY)

                        if len(elementList) > 0:
                            if item["label"] == "doc_title":
                                result += f"# {self._itemText(elementList, True, item['coordinate'][0] * scaleX)}\n\n"
                            elif item["label"] == "paragraph_title":
                                hashText = self._headingHash(titleSizeRankList, self._titleSizeKey(elementList))

                                result += f"{hashText} {self._itemText(elementList, True, item['coordinate'][0] * scaleX)}\n\n"
                            else:
                                result += f"{self._itemText(elementList, False, item['coordinate'][0] * scaleX)}\n\n"

            secondaryText = ""

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                if astPage["number"] in pageObject and len(astPage["itemSecondaryList"]) > 0:
                    page = pageObject[astPage["number"]]

                    scaleX = page["width"] / astPage["imageWidth"]
                    scaleY = page["height"] / astPage["imageHeight"]

                    pageText = ""

                    for b in range(len(astPage["itemSecondaryList"])):
                        item = astPage["itemSecondaryList"][b]

                        itemText = ""

                        if item["label"] != "table":
                            elementList = self._elementBoxCollect(page, item["coordinate"], scaleX, scaleY)

                            if len(elementList) > 0:
                                itemText = self._itemText(elementList, True, item["coordinate"][0] * scaleX)

                        if len(itemText) == 0:
                            pageText += f"[{item['label']}]\n" if len(pageText) == 0 else f"\n[{item['label']}]\n"
                        else:
                            pageText += f"{itemText}\n"

                    secondaryText += f"- Page {astPage['number']}\n{pageText}\n"

            if len(secondaryText) > 0:
                result += f"---\n\nSECONDARY ELEMENT:\n\n{secondaryText}"

            return result

    class Docx:
        def _headingHash(self, level):
            return "#" * min(level, 6)

        def _rowText(self, cellList):
            result = "|"

            for a in range(len(cellList)):
                cellText = cellList[a].replace("|", "\\|").replace("\n", " ")

                result += f" {cellText} |"

            return result

        def execute(self, astPageList):
            result = ""

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                isTableOpen = False

                for b in range(len(astPage["itemMainList"])):
                    item = astPage["itemMainList"][b]

                    if item["label"] == "tableRow":
                        cellList = item.get("cellList", [])

                        rowText = self._rowText(cellList)

                        if isTableOpen == False:
                            separatorText = "| --- " * len(cellList) + "|"

                            result += f"{rowText}\n{separatorText}\n"

                            isTableOpen = True
                        else:
                            result += f"{rowText}\n"

                        continue

                    if isTableOpen:
                        result += "\n"

                        isTableOpen = False

                    if item["label"] == "doc_title":
                        result += f"# {item['text']}\n\n"
                    elif item["label"] == "paragraph_title":
                        result += f"{self._headingHash(item['level'])} {item['text']}\n\n"
                    elif item.get("isList") == True:
                        result += f"- {item['text']}\n\n"
                    else:
                        result += f"{item['text']}\n\n"

                if isTableOpen:
                    result += "\n"

            secondaryText = ""

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                for b in range(len(astPage["itemSecondaryList"])):
                    item = astPage["itemSecondaryList"][b]

                    itemText = item["text"]

                    if item["label"] == "chart" or len(item["text"]) == 0:
                        itemText = f"[{item['label']}]"

                    secondaryText += f"{itemText}\n" if len(secondaryText) == 0 else f"\n{itemText}\n"

            if len(secondaryText) > 0:
                result += f"---\n\nSECONDARY ELEMENT:\n\n{secondaryText}"

            return result

    class Xlsx:
        def _columnLetter(self, index):
            result = ""

            value = index + 1

            while value > 0:
                remainder = (value - 1) % 26

                result = chr(65 + remainder) + result

                value = (value - 1) // 26

            return result

        def _cellEscape(self, text):
            return text.replace("|", "\\|").replace("\n", " ")

        def execute(self, astPageList):
            result = ""

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                sheetName = ""
                rowItemList = []

                for b in range(len(astPage["itemMainList"])):
                    item = astPage["itemMainList"][b]

                    if item["label"] == "sheetName":
                        sheetName = item["text"]
                    elif item["label"] == "tableRow":
                        rowItemList.append(item)

                result += f"# {sheetName}\n\n"

                if len(rowItemList) > 0:
                    columnCount = len(rowItemList[0]["cellList"])

                    headerText = "| row |"
                    separatorText = "| --- |"

                    for b in range(columnCount):
                        headerText += f" {self._columnLetter(b)} |"
                        separatorText += " --- |"

                    result += f"{headerText}\n{separatorText}\n"

                    for b in range(len(rowItemList)):
                        rowText = f"| {rowItemList[b]['number']} |"

                        for c in range(len(rowItemList[b]["cellList"])):
                            rowText += f" {self._cellEscape(rowItemList[b]['cellList'][c])} |"

                        result += f"{rowText}\n"

                    result += "\n"

                mergeList = astPage.get("mergeList", [])

                if len(mergeList) > 0:
                    result += f"Merge: {', '.join(mergeList)}\n\n"

            secondaryText = ""

            for a in range(len(astPageList)):
                astPage = astPageList[a]

                for b in range(len(astPage["itemSecondaryList"])):
                    item = astPage["itemSecondaryList"][b]

                    itemText = item["text"]

                    if item["label"] == "chart" or len(item["text"]) == 0:
                        itemText = f"[{item['label']}]"

                    secondaryText += f"{itemText}\n" if len(secondaryText) == 0 else f"\n{itemText}\n"

            if len(secondaryText) > 0:
                result += f"---\n\nSECONDARY ELEMENT:\n\n{secondaryText}"

            return result

class Engine:
    def execute(self, pathInput, pathOutput):
        timeStart = time.perf_counter()

        astPageList = []

        pathAst = f"{os.path.dirname(pathInput)}/ast.json"

        if os.path.isfile(pathAst):
            with open(pathAst, "r", encoding="utf-8") as file:
                astObject = json.load(file)

                astPageList = astObject["pageList"]

        extension = os.path.splitext(pathInput)[1].lower()

        markdownText = ""
        pageCount = 0

        if extension == ".pdf":
            pdf = Pdf()
            pageList = pdf.execute(pathInput)

            markdownPdf = Markdown.Pdf()
            markdownText = markdownPdf.execute(pageList, astPageList)

            pageCount = len(pageList)
        elif extension == ".docx":
            markdownDocx = Markdown.Docx()
            markdownText = markdownDocx.execute(astPageList)

            pageCount = len(astPageList)
        elif extension == ".xlsx":
            markdownXlsx = Markdown.Xlsx()
            markdownText = markdownXlsx.execute(astPageList)

            pageCount = len(astPageList)

        with open(pathOutput, "w", encoding="utf-8", errors="replace") as file:
            file.write(markdownText)

        timeEnd = time.perf_counter() - timeStart

        print(f"\nEngine.py - Time: {round(timeEnd, 3)} - Page: {pageCount}")

        resultObject = {"pageCount": pageCount}

        return resultObject
    