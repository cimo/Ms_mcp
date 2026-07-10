import sys
sys.dont_write_bytecode = True

import os
import re
import glob
import shutil
import time
import json
import unicodedata
import zipfile
import xml.etree.ElementTree
import cv2
import numpy

sys.path.append(f"{os.path.dirname(__file__)}/..")
from helper import onnxSessionBuild

class Pdf:
    def _itemFlow(self, label):
        result = "main"

        if label in self.labelSecondaryList:
            result = "secondary"

        return result

    def _itemContained(self, coordinateA, coordinateB):
        result = False

        x1 = max(coordinateA[0], coordinateB[0])
        y1 = max(coordinateA[1], coordinateB[1])
        x2 = min(coordinateA[2], coordinateB[2])
        y2 = min(coordinateA[3], coordinateB[3])

        area = max(0.0, coordinateA[2] - coordinateA[0]) * max(0.0, coordinateA[3] - coordinateA[1])
        areaIntersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)

        if area > 0.0:
            result = areaIntersection / area >= self.levelBoxContained

        return result

    def _itemRelabel(self, itemList, imageWidth):
        for a in range(len(itemList)):
            if itemList[a]["label"] == "figure_title":
                width = itemList[a]["coordinate"][2] - itemList[a]["coordinate"][0]

                if itemList[a]["score"] < self.scoreFigureTitle or width > imageWidth * self.levelCaptionWidth:
                    itemList[a]["label"] = "text"

        return itemList
    
    def _itemClean(self, itemList):
        resultList = itemList

        if len(itemList) > 1:
            indexDeleteList = []

            for a in range(len(itemList)):
                if a in indexDeleteList:
                    continue

                for b in range(len(itemList)):
                    if a == b or b in indexDeleteList:
                        continue

                    coordinateA = itemList[a]["coordinate"]
                    coordinateB = itemList[b]["coordinate"]

                    if self._itemContained(coordinateA, coordinateB):
                        areaA = max(0.0, coordinateA[2] - coordinateA[0]) * max(0.0, coordinateA[3] - coordinateA[1])
                        areaB = max(0.0, coordinateB[2] - coordinateB[0]) * max(0.0, coordinateB[3] - coordinateB[1])

                        if areaB >= areaA:
                            indexDeleteList.append(a)

                            break

            resultList = []

            for a in range(len(itemList)):
                if a not in indexDeleteList:
                    resultList.append(itemList[a])

        return resultList

    def _itemProcess(self, itemRawList, imageWidth, imageHeight):
        resultList = []

        for a in range(len(itemRawList)):
            itemRaw = itemRawList[a]

            classId = itemRaw[0]
            score = itemRaw[1]
            x1 = max(0.0, min(itemRaw[2], float(imageWidth)))
            y1 = max(0.0, min(itemRaw[3], float(imageHeight)))
            x2 = max(0.0, min(itemRaw[4], float(imageWidth)))
            y2 = max(0.0, min(itemRaw[5], float(imageHeight)))

            if x2 > x1 and y2 > y1:
                label = self.labelObject[classId] if classId in self.labelObject else str(classId)

                resultList.append({
                    "label": label,
                    "score": score,
                    "coordinate": [x1, y1, x2, y2],
                    "boxList": [
                        [int(round(x1)), int(round(y1))],
                        [int(round(x2)), int(round(y1))],
                        [int(round(x2)), int(round(y2))],
                        [int(round(x1)), int(round(y2))]
                    ]
                })

        return resultList

    def _orderSort(self, itemList):
        resultList = list(itemList)

        resultList.sort(key=lambda item: (item["coordinate"][1], item["coordinate"][0]))

        return resultList

    def _orderWidestGap(self, itemList, isColumn):
        resultObject = {"gap": 0, "position": 0}

        rangeList = []

        for a in range(len(itemList)):
            coordinate = itemList[a]["coordinate"]

            if isColumn:
                rangeList.append({"low": coordinate[0], "high": coordinate[2]})
            else:
                rangeList.append({"low": coordinate[1], "high": coordinate[3]})

        rangeList.sort(key=lambda rangeItem: rangeItem["low"])

        coverHigh = rangeList[0]["high"] if len(rangeList) > 0 else 0

        for a in range(1, len(rangeList)):
            rangeItem = rangeList[a]

            if rangeItem["low"] > coverHigh:
                gap = rangeItem["low"] - coverHigh

                if gap > resultObject["gap"]:
                    resultObject["gap"] = gap
                    resultObject["position"] = (coverHigh + rangeItem["low"]) / 2

            if rangeItem["high"] > coverHigh:
                coverHigh = rangeItem["high"]

        return resultObject

    def _orderSplit(self, itemList, position, isColumn):
        lowList = []
        highList = []

        for a in range(len(itemList)):
            coordinate = itemList[a]["coordinate"]

            high = coordinate[2] if isColumn else coordinate[3]

            if high <= position:
                lowList.append(itemList[a])
            else:
                highList.append(itemList[a])

        return [lowList, highList]

    def _orderArrange(self, itemList, imageWidth, imageHeight, depth):
        resultList = []

        if len(itemList) <= 1 or depth >= 24:
            resultList = self._orderSort(itemList)
        else:
            isSplit = False

            columnGapObject = self._orderWidestGap(itemList, True)

            if columnGapObject["gap"] >= imageWidth * self.levelGapColumn:
                columnSplit = self._orderSplit(itemList, columnGapObject["position"], True)

                if len(columnSplit[0]) > 0 and len(columnSplit[1]) > 0:
                    resultList = self._orderArrange(columnSplit[0], imageWidth, imageHeight, depth + 1) + self._orderArrange(columnSplit[1], imageWidth, imageHeight, depth + 1)

                    isSplit = True

            if isSplit == False:
                rowGapObject = self._orderWidestGap(itemList, False)

                if rowGapObject["gap"] >= imageHeight * self.levelGapRow:
                    rowSplit = self._orderSplit(itemList, rowGapObject["position"], False)

                    if len(rowSplit[0]) > 0 and len(rowSplit[1]) > 0:
                        resultList = self._orderArrange(rowSplit[0], imageWidth, imageHeight, depth + 1) + self._orderArrange(rowSplit[1], imageWidth, imageHeight, depth + 1)

                        isSplit = True

            if isSplit == False:
                resultList = self._orderSort(itemList)

        return resultList

    def _debugDraw(self, pageNumber, image, itemMainList, itemSecondaryList):
        imageCopy = image.copy()

        itemList = itemMainList + itemSecondaryList

        for a in range(len(itemList)):
            item = itemList[a]

            color = self.labelColorObject[item["label"]] if item["label"] in self.labelColorObject else (0, 0, 0)

            x1 = int(round(item["coordinate"][0]))
            y1 = int(round(item["coordinate"][1]))
            x2 = int(round(item["coordinate"][2]))
            y2 = int(round(item["coordinate"][3]))

            boxRegion = imageCopy[y1:y2, x1:x2]
            boxOverlay = numpy.full(boxRegion.shape, color, dtype=numpy.uint8)

            imageCopy[y1:y2, x1:x2] = cv2.addWeighted(boxOverlay, self.levelDebugOpacity, boxRegion, 1 - self.levelDebugOpacity, 0)

            cv2.putText(
                imageCopy,
                f"{item['flow']} {item['order']} - {item['label']} {round(item['score'], 3)}",
                (x1, max(12, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA
            )

        cv2.imwrite(f"{self.pathDebug}{pageNumber}.jpg", imageCopy)

    def _inference(self, imageRgb):
        imageHeight, imageWidth = imageRgb.shape[0:2]
        imageResized = cv2.resize(imageRgb, (800, 800), interpolation=cv2.INTER_CUBIC).astype(numpy.float32) / 255.0

        tensor = numpy.expand_dims(imageResized.transpose((2, 0, 1)), axis=0).astype(numpy.float32)

        tensorFeedObject = {
            "image": tensor,
            "im_shape": numpy.array([[800, 800]], dtype=numpy.float32),
            "scale_factor": numpy.array([[800 / float(imageHeight), 800 / float(imageWidth)]], dtype=numpy.float32)
        }

        tensorOutputList = self.onnxSession.run(None, tensorFeedObject)

        boxCount = int(tensorOutputList[1][0]) if len(tensorOutputList) > 1 else len(tensorOutputList[0])

        itemRawList = []

        for a in range(boxCount):
            value = tensorOutputList[0][a]

            score = float(value[1])

            if score >= self.scoreThreshold:
                itemRawList.append([int(value[0]), score, float(value[2]), float(value[3]), float(value[4]), float(value[5])])

        itemList = self._itemProcess(itemRawList, imageWidth, imageHeight)
        itemList = self._itemClean(itemList)
        itemList = self._itemRelabel(itemList, imageWidth)

        return itemList
    
    def execute(self, pathInput, pathOutput):
        timeStart = time.perf_counter()

        self.pathDebug = f"{pathOutput}debug/"

        if os.path.isdir(self.pathDebug):
            shutil.rmtree(self.pathDebug)

        if self.isDebug:
            os.makedirs(self.pathDebug, exist_ok=True)

        fileNameList = sorted(glob.glob(f"{pathInput}*.jpg"), key=lambda path: int(os.path.splitext(os.path.basename(path))[0]))

        pageList = []

        for a in range(len(fileNameList)):
            pageNumber = int(os.path.splitext(os.path.basename(fileNameList[a]))[0])

            image = cv2.imread(fileNameList[a])
            imageRgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            imageHeight, imageWidth = imageRgb.shape[0:2]

            itemList = self._inference(imageRgb)

            itemMainList = []
            itemSecondaryList = []

            for b in range(len(itemList)):
                if self._itemFlow(itemList[b]["label"]) == "main":
                    itemMainList.append(itemList[b])
                else:
                    itemSecondaryList.append(itemList[b])

            itemMainList = self._orderArrange(itemMainList, imageWidth, imageHeight, 0)
            itemSecondaryList = self._orderSort(itemSecondaryList)

            for b in range(len(itemMainList)):
                itemMainList[b]["flow"] = "main"
                itemMainList[b]["order"] = b + 1

            for b in range(len(itemSecondaryList)):
                itemSecondaryList[b]["flow"] = "secondary"
                itemSecondaryList[b]["order"] = b + 1

            if self.isDebug:
                self._debugDraw(pageNumber, image, itemMainList, itemSecondaryList)

            pageList.append({
                "number": pageNumber,
                "imageWidth": imageWidth,
                "imageHeight": imageHeight,
                "itemMainList": itemMainList,
                "itemSecondaryList": itemSecondaryList
            })

        resultObject = {"pageList": pageList}

        with open(f"{pathOutput}ast.json", "w", encoding="utf-8") as file:
            json.dump(resultObject, file, ensure_ascii=False, indent=4)

        timeEnd = time.perf_counter() - timeStart

        print(f"\nLayout.py - Pdf - Time: {round(timeEnd, 3)} - Page: {len(pageList)}")

        return resultObject

    def __init__(self):
        self.pathDebug = ""

        self.osPathDirName = f"{os.path.dirname(__file__)}/"
        self.pathModel = f"{self.osPathDirName}model/pp-docLayout_plus-l.onnx"

        self.isDebug = True
        self.levelDebugOpacity = 0.2
        self.levelBoxContained = 0.9
        self.levelGapColumn = 0.01
        self.levelGapRow = 0.005
        self.levelCaptionWidth = 0.5
        
        self.scoreThreshold = 0.3
        self.scoreFigureTitle = 0.6

        self.labelObject = {
            12: "header",
            10: "doc_title",
            4: "abstract",
            5: "content",
            0: "paragraph_title",
            2: "text",
            1: "image",
            6: "figure_title",
            16: "chart",
            8: "table",
            7: "formula",
            17: "formula_number",
            13: "algorithm",
            18: "aside_text",
            9: "reference",
            19: "reference_content",
            11: "footnote",
            14: "footer",
            3: "number",
            15: "seal"
        }

        self.labelColorObject = {
            "header": (128, 128, 128),
            "doc_title": (255, 0, 0),
            "abstract": (0, 200, 0),
            "content": (0, 200, 0),
            "paragraph_title": (255, 0, 0),
            "text": (0, 200, 0),
            "image": (0, 165, 255),
            "figure_title": (255, 0, 0),
            "chart": (0, 165, 255),
            "table": (0, 0, 255),
            "formula": (200, 0, 200),
            "formula_number": (200, 0, 200),
            "algorithm": (0, 200, 0),
            "aside_text": (128, 128, 128),
            "reference": (0, 200, 0),
            "reference_content": (0, 200, 0),
            "footnote": (128, 128, 128),
            "footer": (128, 128, 128),
            "number": (128, 128, 128),
            "seal": (128, 128, 128)
        }

        self.labelSecondaryList = [
            "image",
            "figure_title",
            "chart",
            "table",
            "formula",
            "formula_number",
            "algorithm",
            "aside_text",
            "footnote",
            "footer",
            "number",
            "seal"
        ]

        cv2.setUseOptimized(True)
        cv2.setNumThreads(1)

        self.onnxSession = onnxSessionBuild(self.pathModel)

class Docx:
    def _nodeTag(self, node):
        return node.tag.split("}")[1] if "}" in node.tag else node.tag

    def _nodeValue(self, node):
        return node.attrib.get(f"{{{self.namespaceW}}}val", "")

    def _fallbackRemove(self, node):
        for child in list(node):
            if self._nodeTag(child) == "Fallback":
                node.remove(child)
            else:
                self._fallbackRemove(child)

    def _paragraphText(self, paragraphNode):
        result = ""

        for node in paragraphNode.iter():
            tag = self._nodeTag(node)

            if tag == "t":
                result += node.text if node.text is not None else ""
            elif tag == "tab" or tag == "br":
                result += " "

        return result.strip()

    def _paragraphSize(self, paragraphNode):
        sizeDefault = self.sizeDocument

        sizeDefaultNode = paragraphNode.find(f"{{{self.namespaceW}}}pPr/{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz")

        if sizeDefaultNode is not None and self._nodeValue(sizeDefaultNode) != "":
            sizeDefault = float(self._nodeValue(sizeDefaultNode))

        countObject = {}

        for runNode in paragraphNode.iter(f"{{{self.namespaceW}}}r"):
            size = sizeDefault
            length = 0

            sizeNode = runNode.find(f"{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz")

            if sizeNode is not None and self._nodeValue(sizeNode) != "":
                size = float(self._nodeValue(sizeNode))

            for node in runNode.iter(f"{{{self.namespaceW}}}t"):
                if node.text is not None:
                    length += len(node.text)

            if length > 0:
                countObject[size] = countObject.get(size, 0) + length

        result = 0.0
        countMax = 0

        for size in countObject:
            if countObject[size] > countMax:
                countMax = countObject[size]
                result = size

        return result

    def _paragraphStyle(self, paragraphNode):
        result = ""

        for node in paragraphNode.iter(f"{{{self.namespaceW}}}pStyle"):
            result = self._nodeValue(node)

        return result

    def _paragraphOutlineLevel(self, paragraphNode):
        result = -1

        for node in paragraphNode.iter(f"{{{self.namespaceW}}}outlineLvl"):
            if self._nodeValue(node) != "":
                result = int(self._nodeValue(node))

        return result

    def _paragraphNumberingCheck(self, paragraphNode):
        result = False

        for node in paragraphNode.iter(f"{{{self.namespaceW}}}numPr"):
            result = True

        return result

    def _styleBuild(self, styleRootNode):
        resultObject = {}

        for styleNode in styleRootNode.iter(f"{{{self.namespaceW}}}style"):
            styleId = styleNode.attrib.get(f"{{{self.namespaceW}}}styleId", "")

            if styleId != "":
                outlineLevel = -1

                outlineNode = styleNode.find(f"{{{self.namespaceW}}}pPr/{{{self.namespaceW}}}outlineLvl")

                if outlineNode is not None and self._nodeValue(outlineNode) != "":
                    outlineLevel = int(self._nodeValue(outlineNode))

                name = ""

                nameNode = styleNode.find(f"{{{self.namespaceW}}}name")

                if nameNode is not None:
                    name = self._nodeValue(nameNode).lower()

                resultObject[styleId] = {"outlineLevel": outlineLevel, "name": name}

        return resultObject

    def _paragraphImageCount(self, paragraphNode):
        result = 0

        for node in paragraphNode.iter():
            tag = self._nodeTag(node)

            if tag == "drawing" or tag == "pict":
                result += 1

        return result

    def _blockBuild(self, bodyNode):
        resultList = []

        for node in bodyNode:
            tag = self._nodeTag(node)

            if tag == "p":
                text = self._paragraphText(node)

                if len(text) > 0:
                    style = self._paragraphStyle(node)
                    styleObject = self.styleObject.get(style, {"outlineLevel": -1, "name": ""})

                    outlineLevel = self._paragraphOutlineLevel(node)

                    if outlineLevel == -1:
                        outlineLevel = styleObject["outlineLevel"]

                    resultList.append({
                        "kind": "paragraph",
                        "text": text,
                        "size": self._paragraphSize(node),
                        "style": style,
                        "styleName": styleObject["name"],
                        "outlineLevel": outlineLevel,
                        "isList": self._paragraphNumberingCheck(node),
                        "isAside": False,
                        "isContinuation": False
                    })

                for a in range(self._paragraphImageCount(node)):
                    resultList.append({"kind": "image"})
            elif tag == "tbl":
                resultList.append({"kind": "table"})

        return resultList

    def _asideRunFlush(self, blockList, runIndexList):
        if len(runIndexList) >= self.levelAsideCount:
            for a in range(len(runIndexList)):
                blockList[runIndexList[a]]["isAside"] = True

    def _wideCheck(self, character):
        return character != "" and unicodedata.east_asian_width(character) in ("W", "F")

    def _bodyTextCheck(self, block):
        result = False

        if block["kind"] == "paragraph" and block["outlineLevel"] == -1 and block["isList"] == False:
            if block["style"] != "Title" and block["styleName"] != "title" and re.match(r"Heading(\d)", block["style"]) is None:
                if "caption" not in block["styleName"] and "Caption" not in block["style"] and "didascalia" not in block["styleName"]:
                    result = True

        return result

    def _continuationCheck(self, blockList, index):
        result = False

        if index > 0:
            previous = blockList[index - 1]

            if previous["kind"] == "paragraph" and len(previous["text"]) > self.levelAsideLength and previous["size"] == blockList[index]["size"]:
                if unicodedata.category(previous["text"][-1:])[0:1] != "P":
                    result = True

        return result

    def _asideMark(self, blockList):
        runIndexList = []

        for a in range(len(blockList)):
            block = blockList[a]

            isBreak = True

            if block["kind"] == "image":
                isBreak = False
            elif block["kind"] == "paragraph":
                if self._bodyTextCheck(block) and len(block["text"]) <= self.levelAsideLength:
                    if len(runIndexList) == 0 and self._continuationCheck(blockList, a):
                        block["isContinuation"] = True
                    else:
                        runIndexList.append(a)

                        isBreak = False

            if isBreak:
                self._asideRunFlush(blockList, runIndexList)

                runIndexList = []

        self._asideRunFlush(blockList, runIndexList)

        return blockList

    def _bodySize(self, blockList):
        countObject = {}

        for a in range(len(blockList)):
            if blockList[a]["kind"] == "paragraph" and blockList[a]["isAside"] == False:
                size = blockList[a]["size"]

                countObject[size] = countObject.get(size, 0) + len(blockList[a]["text"])

        result = 0.0
        countMax = 0

        for size in countObject:
            if countObject[size] > countMax:
                countMax = countObject[size]
                result = size

        return result

    def _titleSizeRank(self, blockList, bodySize):
        resultList = []

        for a in range(len(blockList)):
            block = blockList[a]

            if self._bodyTextCheck(block) and block["isAside"] == False:
                if bodySize > 0 and block["size"] >= bodySize * self.levelTitleSize and len(block["text"]) <= self.levelTitleLength:
                    if block["size"] not in resultList:
                        resultList.append(block["size"])

        resultList.sort(reverse=True)

        return resultList

    def _itemLabel(self, block, titleSizeList, isDocTitleFound):
        resultObject = {"label": "text", "level": 0}

        styleMatch = re.match(r"Heading(\d)", block["style"])

        if block["style"] == "Title" or block["styleName"] == "title":
            resultObject["label"] = "doc_title"
        elif "Caption" in block["style"] or "caption" in block["styleName"] or "didascalia" in block["styleName"]:
            resultObject["label"] = "figure_title"
        elif styleMatch is not None:
            resultObject["label"] = "paragraph_title"
            resultObject["level"] = int(styleMatch.group(1)) + 1
        elif block["outlineLevel"] >= 0:
            resultObject["label"] = "paragraph_title"
            resultObject["level"] = block["outlineLevel"] + 2
        elif block["size"] in titleSizeList and len(block["text"]) <= self.levelTitleLength:
            index = titleSizeList.index(block["size"])

            if index == 0 and isDocTitleFound == False:
                resultObject["label"] = "doc_title"
            else:
                resultObject["label"] = "paragraph_title"
                resultObject["level"] = max(2, 1 + index) if isDocTitleFound else 2 + index

        return resultObject

    def execute(self, pathInput, pathOutput):
        timeStart = time.perf_counter()

        zipFile = zipfile.ZipFile(pathInput)
        rootNode = xml.etree.ElementTree.fromstring(zipFile.read("word/document.xml"))

        self.sizeDocument = 22.0
        self.styleObject = {}

        if "word/styles.xml" in zipFile.namelist():
            styleRootNode = xml.etree.ElementTree.fromstring(zipFile.read("word/styles.xml"))

            self.styleObject = self._styleBuild(styleRootNode)

            sizeNode = styleRootNode.find(
                f"{{{self.namespaceW}}}docDefaults/{{{self.namespaceW}}}rPrDefault/{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz"
            )

            if sizeNode is not None and self._nodeValue(sizeNode) != "":
                self.sizeDocument = float(self._nodeValue(sizeNode))

        zipFile.close()

        self._fallbackRemove(rootNode)

        bodyNode = rootNode.find(f"{{{self.namespaceW}}}body")

        blockList = self._blockBuild(bodyNode) if bodyNode is not None else []
        blockList = self._asideMark(blockList)

        bodySize = self._bodySize(blockList)
        titleSizeList = self._titleSizeRank(blockList, bodySize)

        itemMainList = []
        itemSecondaryList = []

        isDocTitleFound = False

        for a in range(len(blockList)):
            block = blockList[a]

            if block["kind"] == "table":
                itemSecondaryList.append({"label": "table", "text": ""})
            elif block["kind"] == "image":
                itemSecondaryList.append({"label": "image", "text": ""})
            elif block["isAside"]:
                itemSecondaryList.append({"label": "aside_text", "text": block["text"]})
            elif block["isContinuation"] and len(itemMainList) > 0:
                itemPrevious = itemMainList[len(itemMainList) - 1]

                if self._wideCheck(itemPrevious["text"][-1:]) and self._wideCheck(block["text"][0:1]):
                    itemPrevious["text"] += block["text"]
                else:
                    itemPrevious["text"] += f" {block['text']}"
            else:
                labelObject = self._itemLabel(block, titleSizeList, isDocTitleFound)

                if labelObject["label"] == "doc_title":
                    isDocTitleFound = True

                item = {"label": labelObject["label"], "text": block["text"]}

                if labelObject["label"] == "paragraph_title":
                    item["level"] = labelObject["level"]

                if labelObject["label"] == "text" and block["isList"]:
                    item["isList"] = True

                if labelObject["label"] == "figure_title":
                    itemSecondaryList.append(item)
                else:
                    itemMainList.append(item)

        for a in range(len(itemMainList)):
            itemMainList[a]["flow"] = "main"
            itemMainList[a]["order"] = a + 1

        for a in range(len(itemSecondaryList)):
            itemSecondaryList[a]["flow"] = "secondary"
            itemSecondaryList[a]["order"] = a + 1

        resultObject = {
            "pageList": [
                {"number": 1, "itemMainList": itemMainList, "itemSecondaryList": itemSecondaryList}
            ]
        }

        with open(f"{pathOutput}ast.json", "w", encoding="utf-8") as file:
            json.dump(resultObject, file, ensure_ascii=False, indent=4)

        timeEnd = time.perf_counter() - timeStart

        print(f"\nLayout.py - Docx - Time: {round(timeEnd, 3)} - Block: {len(blockList)}")

        return resultObject

    def __init__(self):
        self.namespaceW = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

        self.sizeDocument = 22.0
        self.styleObject = {}

        self.levelTitleSize = 1.15
        self.levelTitleLength = 120
        self.levelAsideLength = 60
        self.levelAsideCount = 4
