import sys
sys.dont_write_bytecode = True

import os
import re
import glob
import shutil
import time
import json
import datetime
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

class Office:
    def _nodeTag(self, node):
        return node.tag.split("}")[1] if "}" in node.tag else node.tag

    def _nodeValue(self, node):
        return node.attrib.get(f"{{{self.namespace}}}val", "")

    def _rootBuild(self, zipFile, pathFile):
        result = None

        if pathFile in zipFile.namelist():
            result = xml.etree.ElementTree.fromstring(zipFile.read(pathFile))

        return result

    def _chartText(self, chartRootNode):
        namespaceChart = "http://schemas.openxmlformats.org/drawingml/2006/chart"
        namespaceDrawing = "http://schemas.openxmlformats.org/drawingml/2006/main"

        result = "chart"

        plotAreaNode = chartRootNode.find(f".//{{{namespaceChart}}}plotArea")

        if plotAreaNode is not None:
            for node in plotAreaNode:
                if self._nodeTag(node).endswith("Chart"):
                    result = self._nodeTag(node)

                    break

        titleText = ""

        titleNode = chartRootNode.find(f".//{{{namespaceChart}}}title")

        if titleNode is not None:
            for node in titleNode.iter(f"{{{namespaceDrawing}}}t"):
                titleText += node.text if node.text is not None else ""

        if titleText != "":
            result += f" - {titleText}"

        for serieNode in chartRootNode.iter(f"{{{namespaceChart}}}ser"):
            nameText = ""

            textNode = serieNode.find(f"{{{namespaceChart}}}tx")

            if textNode is not None:
                for node in textNode.iter(f"{{{namespaceChart}}}v"):
                    if node.text is not None:
                        nameText = node.text

                    break

            categoryObject = {}

            categoryNode = serieNode.find(f"{{{namespaceChart}}}cat")

            if categoryNode is not None:
                for node in categoryNode.iter(f"{{{namespaceChart}}}pt"):
                    valueNode = node.find(f"{{{namespaceChart}}}v")

                    if valueNode is not None and valueNode.text is not None:
                        categoryObject[node.attrib.get("idx", "")] = valueNode.text

            pairList = []

            valueParentNode = serieNode.find(f"{{{namespaceChart}}}val")

            if valueParentNode is not None:
                for node in valueParentNode.iter(f"{{{namespaceChart}}}pt"):
                    valueNode = node.find(f"{{{namespaceChart}}}v")

                    if valueNode is not None and valueNode.text is not None:
                        index = node.attrib.get("idx", "")

                        categoryText = categoryObject[index] if index in categoryObject else index

                        pairList.append(f"{categoryText}={valueNode.text}")

            serieText = ", ".join(pairList)

            if nameText != "":
                result += f"\n{nameText}: {serieText}"
            elif serieText != "":
                result += f"\n{serieText}"

        return result

    def __init__(self, namespace):
        self.namespace = namespace

    class Docx:
        def _fallbackRemove(self, node):
            for child in list(node):
                if self.office._nodeTag(child) == "Fallback":
                    node.remove(child)
                else:
                    self._fallbackRemove(child)

        def _textCollect(self, node):
            result = ""

            tag = self.office._nodeTag(node)

            if tag != "txbxContent":
                if tag == "t":
                    result += node.text if node.text is not None else ""
                elif tag == "tab" or tag == "br":
                    result += " "

                for childNode in node:
                    result += self._textCollect(childNode)

            return result

        def _paragraphText(self, paragraphNode):
            return self._textCollect(paragraphNode).strip()

        def _paragraphSize(self, paragraphNode):
            sizeDefault = self.sizeDocument

            sizeDefaultNode = paragraphNode.find(f"{{{self.namespaceW}}}pPr/{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz")

            if sizeDefaultNode is not None and self.office._nodeValue(sizeDefaultNode) != "":
                sizeDefault = float(self.office._nodeValue(sizeDefaultNode))

            countObject = {}

            for runNode in paragraphNode.iter(f"{{{self.namespaceW}}}r"):
                size = sizeDefault
                length = 0

                sizeNode = runNode.find(f"{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz")

                if sizeNode is not None and self.office._nodeValue(sizeNode) != "":
                    size = float(self.office._nodeValue(sizeNode))

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
                result = self.office._nodeValue(node)

            return result

        def _paragraphOutlineLevel(self, paragraphNode):
            result = -1

            for node in paragraphNode.iter(f"{{{self.namespaceW}}}outlineLvl"):
                if self.office._nodeValue(node) != "":
                    result = int(self.office._nodeValue(node))

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

                    if outlineNode is not None and self.office._nodeValue(outlineNode) != "":
                        outlineLevel = int(self.office._nodeValue(outlineNode))

                    name = ""

                    nameNode = styleNode.find(f"{{{self.namespaceW}}}name")

                    if nameNode is not None:
                        name = self.office._nodeValue(nameNode).lower()

                    resultObject[styleId] = {"outlineLevel": outlineLevel, "name": name}

            return resultObject

        def _paragraphDrawingCollect(self, paragraphNode):
            resultList = []

            for node in paragraphNode.iter():
                tag = self.office._nodeTag(node)

                if tag == "drawing":
                    chartNode = node.find(f".//{{{self.namespaceChart}}}chart")

                    if chartNode is not None:
                        resultList.append({"kind": "image", "relationshipId": chartNode.attrib.get(f"{{{self.namespaceRelationship}}}id", ""), "isChart": True})
                    else:
                        relationshipId = ""

                        blipNode = node.find(f".//{{{self.namespaceDrawing}}}blip")

                        if blipNode is not None:
                            relationshipId = blipNode.attrib.get(f"{{{self.namespaceRelationship}}}embed", "")

                        resultList.append({"kind": "image", "relationshipId": relationshipId, "isChart": False})
                elif tag == "pict":
                    resultList.append({"kind": "image", "relationshipId": "", "isChart": False})

            return resultList

        def _blockParagraph(self, paragraphNode, isWrapped):
            resultList = []

            text = self._paragraphText(paragraphNode)

            if len(text) > 0:
                style = self._paragraphStyle(paragraphNode)
                styleObject = self.styleObject.get(style, {"outlineLevel": -1, "name": ""})

                outlineLevel = self._paragraphOutlineLevel(paragraphNode)

                if outlineLevel == -1:
                    outlineLevel = styleObject["outlineLevel"]

                resultList.append({
                    "kind": "paragraph",
                    "text": text,
                    "size": self._paragraphSize(paragraphNode),
                    "style": style,
                    "styleName": styleObject["name"],
                    "outlineLevel": outlineLevel,
                    "isList": self._paragraphNumberingCheck(paragraphNode),
                    "isAside": isWrapped and len(text) <= self.levelAsideLength,
                    "isContinuation": False,
                    "isWrapped": isWrapped
                })

            drawingList = self._paragraphDrawingCollect(paragraphNode)

            for a in range(len(drawingList)):
                resultList.append(drawingList[a])

            for node in paragraphNode.iter():
                if self.office._nodeTag(node) == "txbxContent":
                    textboxList = self._blockWrapped(node)

                    for a in range(len(textboxList)):
                        resultList.append(textboxList[a])

            return resultList

        def _blockWrapped(self, containerNode):
            blockList = []

            for node in containerNode:
                tag = self.office._nodeTag(node)

                childList = []

                if tag == "p":
                    childList = self._blockParagraph(node, True)
                elif tag == "tbl":
                    childList = self._blockTable(node)

                for a in range(len(childList)):
                    blockList.append(childList[a])

            resultList = []

            for a in range(len(blockList)):
                block = blockList[a]

                isMerge = False

                if block["kind"] == "paragraph" and block["isWrapped"] and len(resultList) > 0:
                    previous = resultList[len(resultList) - 1]

                    if previous["kind"] == "paragraph" and previous["isWrapped"]:
                        isMerge = True

                        separator = "" if self._wideCheck(previous["text"][-1:]) and self._wideCheck(block["text"][0:1]) else " "

                        previous["text"] = f"{previous['text']}{separator}{block['text']}"

                if isMerge == False:
                    resultList.append(block)

            for a in range(len(resultList)):
                if resultList[a]["kind"] == "paragraph" and resultList[a]["isWrapped"]:
                    resultList[a]["isAside"] = len(resultList[a]["text"]) <= self.levelAsideLength

            return resultList

        def _blockTable(self, tableNode):
            resultList = []

            rowNodeList = []

            for node in tableNode:
                if self.office._nodeTag(node) == "tr":
                    rowNodeList.append(node)

            columnMax = 0
            isData = len(rowNodeList) >= 2

            rowTextList = []

            for a in range(len(rowNodeList)):
                cellNodeList = []

                for node in rowNodeList[a]:
                    if self.office._nodeTag(node) == "tc":
                        cellNodeList.append(node)

                columnMax = max(columnMax, len(cellNodeList))

                cellTextList = []

                for b in range(len(cellNodeList)):
                    textList = []

                    for node in cellNodeList[b]:
                        tag = self.office._nodeTag(node)

                        if tag == "p":
                            text = self._paragraphText(node)

                            if len(text) > 0:
                                textList.append(text)

                                if len(text) > self.levelAsideLength:
                                    isData = False
                        elif tag == "tbl":
                            isData = False

                    if len(self._paragraphDrawingCollect(cellNodeList[b])) > 0:
                        isData = False

                    cellTextList.append(" ".join(textList))

                rowTextList.append(cellTextList)

            if columnMax < 2:
                isData = False

            if isData:
                for a in range(len(rowTextList)):
                    resultList.append({"kind": "tableRow", "cellList": rowTextList[a]})
            else:
                for a in range(len(rowNodeList)):
                    for node in rowNodeList[a]:
                        if self.office._nodeTag(node) == "tc":
                            blockList = self._blockWrapped(node)

                            for b in range(len(blockList)):
                                resultList.append(blockList[b])

            return resultList

        def _blockBuild(self, containerNode):
            resultList = []

            for node in containerNode:
                tag = self.office._nodeTag(node)

                blockList = []

                if tag == "p":
                    blockList = self._blockParagraph(node, False)
                elif tag == "tbl":
                    blockList = self._blockTable(node)
                elif tag != "sectPr":
                    blockList = self._blockBuild(node)

                for a in range(len(blockList)):
                    resultList.append(blockList[a])

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

        def _sentenceEndCheck(self, text):
            textClean = re.sub(r"(\s*\[[^\[\]]{1,20}\]|[)\]}\"'”’»›])+$", "", text.strip())

            return len(textClean) > 0 and textClean[-1:] in self.sentenceEndList

        def _continuationCheck(self, previous, block):
            result = False

            if previous is not None and previous["kind"] == "paragraph" and previous["isAside"] == False:
                if len(previous["text"]) > self.levelAsideLength and previous["size"] == block["size"]:
                    if self._sentenceEndCheck(previous["text"]) == False:
                        result = True

            return result

        def _previousParagraph(self, blockList, index):
            result = None

            for a in range(index - 1, -1, -1):
                block = blockList[a]

                if block["kind"] == "paragraph":
                    if block["isAside"] == False:
                        result = block

                        break
                elif block["kind"] != "image":
                    break

            return result

        def _previousBlock(self, blockList, index):
            result = None

            for a in range(index - 1, -1, -1):
                block = blockList[a]

                if block["kind"] == "image":
                    continue

                if block["kind"] == "paragraph":
                    result = block

                break

            return result

        def _continuationMark(self, blockList):
            for a in range(len(blockList)):
                block = blockList[a]

                if block["kind"] == "paragraph" and block["isAside"] == False and block["isContinuation"] == False and self._bodyTextCheck(block):
                    isChained = False

                    if block["isWrapped"]:
                        previousBlock = self._previousBlock(blockList, a)

                        if previousBlock is not None and previousBlock["isAside"] and previousBlock["size"] == block["size"]:
                            if self._sentenceEndCheck(previousBlock["text"]) == False:
                                block["isAside"] = True

                                isChained = True

                    if isChained == False and (len(block["text"]) <= self.levelAsideLength or block["text"][0:1].islower()):
                        previous = self._previousParagraph(blockList, a)

                        if self._continuationCheck(previous, block):
                            block["isContinuation"] = True

            return blockList

        def _asideMark(self, blockList):
            runIndexList = []

            for a in range(len(blockList)):
                block = blockList[a]

                isBreak = True

                if block["kind"] == "image":
                    isBreak = False
                elif block["kind"] == "paragraph":
                    if block["isAside"]:
                        isBreak = False
                    elif self._bodyTextCheck(block) and len(block["text"]) <= self.levelAsideLength:
                        if len(runIndexList) == 0 and self._continuationCheck(blockList[a - 1] if a > 0 else None, block):
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

            rootNode = self.office._rootBuild(zipFile, "word/document.xml")

            self.sizeDocument = 22.0
            self.styleObject = {}

            styleRootNode = self.office._rootBuild(zipFile, "word/styles.xml")

            if styleRootNode is not None:
                self.styleObject = self._styleBuild(styleRootNode)

                sizeNode = styleRootNode.find(
                    f"{{{self.namespaceW}}}docDefaults/{{{self.namespaceW}}}rPrDefault/{{{self.namespaceW}}}rPr/{{{self.namespaceW}}}sz"
                )

                if sizeNode is not None and self.office._nodeValue(sizeNode) != "":
                    self.sizeDocument = float(self.office._nodeValue(sizeNode))

            relationshipRootNode = self.office._rootBuild(zipFile, "word/_rels/document.xml.rels")

            pathObject = {}

            if relationshipRootNode is not None:
                for node in relationshipRootNode.iter(f"{{{self.namespacePackage}}}Relationship"):
                    target = node.attrib.get("Target", "")

                    pathObject[node.attrib.get("Id", "")] = target[1:] if target.startswith("/") else f"word/{target}"

            blockList = []

            if rootNode is not None:
                self._fallbackRemove(rootNode)

                bodyNode = rootNode.find(f"{{{self.namespaceW}}}body")

                if bodyNode is not None:
                    blockList = self._blockBuild(bodyNode)

            blockList = self._asideMark(blockList)
            blockList = self._continuationMark(blockList)

            bodySize = self._bodySize(blockList)
            titleSizeList = self._titleSizeRank(blockList, bodySize)

            itemMainList = []
            itemSecondaryList = []

            isDocTitleFound = False

            for a in range(len(blockList)):
                block = blockList[a]

                if block["kind"] == "tableRow":
                    itemMainList.append({"label": "tableRow", "text": " | ".join(block["cellList"]), "cellList": block["cellList"]})
                elif block["kind"] == "image":
                    item = {"label": "image", "text": ""}

                    pathTarget = pathObject[block["relationshipId"]] if block["relationshipId"] in pathObject else ""

                    if block["isChart"]:
                        item["label"] = "chart"

                        chartRootNode = self.office._rootBuild(zipFile, pathTarget)

                        if chartRootNode is not None:
                            item["text"] = self.office._chartText(chartRootNode)
                    elif pathTarget in zipFile.namelist():
                        os.makedirs(f"{pathOutput}media/", exist_ok=True)

                        with open(f"{pathOutput}media/{os.path.basename(pathTarget)}", "wb") as file:
                            file.write(zipFile.read(pathTarget))

                        item["path"] = f"media/{os.path.basename(pathTarget)}"

                    itemSecondaryList.append(item)
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

            zipFile.close()

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
            self.namespaceDrawing = "http://schemas.openxmlformats.org/drawingml/2006/main"
            self.namespaceChart = "http://schemas.openxmlformats.org/drawingml/2006/chart"
            self.namespaceRelationship = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            self.namespacePackage = "http://schemas.openxmlformats.org/package/2006/relationships"

            self.office = Office(self.namespaceW)

            self.sizeDocument = 22.0
            self.styleObject = {}

            self.levelTitleSize = 1.15
            self.levelTitleLength = 120
            self.levelAsideLength = 60
            self.levelAsideCount = 4

            self.sentenceEndList = [".", "!", "?", "…", ";", ":", "。", "！", "？", "；", "："]

    class Xlsx:
        def _cellColumn(self, reference):
            result = 0

            for a in range(len(reference)):
                if reference[a].isalpha():
                    result = result * 26 + (ord(reference[a].upper()) - 64)
                else:
                    break

            return max(0, result - 1)

        def _stringText(self, node):
            result = ""

            tag = self.office._nodeTag(node)

            if tag != "rPh":
                if tag == "t":
                    result += node.text if node.text is not None else ""

                for childNode in node:
                    result += self._stringText(childNode)

            return result

        def _sharedStringBuild(self, sharedStringRootNode):
            resultList = []

            for node in sharedStringRootNode.iter(f"{{{self.namespaceMain}}}si"):
                resultList.append(self._stringText(node))

            return resultList

        def _dateFormatCheck(self, formatCode):
            formatClean = re.sub(r"\"[^\"]*\"|\[[^\]]*\]|\\.", "", formatCode)

            return re.search(r"[dmyhs]", formatClean, re.IGNORECASE) is not None

        def _dateStyleBuild(self, styleRootNode):
            resultList = []

            numberFormatObject = {}

            for node in styleRootNode.iter(f"{{{self.namespaceMain}}}numFmt"):
                numberFormatObject[int(node.attrib.get("numFmtId", "-1"))] = node.attrib.get("formatCode", "")

            cellFormatNode = styleRootNode.find(f"{{{self.namespaceMain}}}cellXfs")

            if cellFormatNode is not None:
                indexFormat = 0

                for node in cellFormatNode:
                    if self.office._nodeTag(node) == "xf":
                        numberFormatId = int(node.attrib.get("numFmtId", "0"))

                        isDate = numberFormatId in self.numberFormatDateList

                        if isDate == False and numberFormatId in numberFormatObject:
                            isDate = self._dateFormatCheck(numberFormatObject[numberFormatId])

                        if isDate:
                            resultList.append(indexFormat)

                        indexFormat += 1

            return resultList

        def _numberCheck(self, text):
            return re.match(r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$", text) is not None

        def _numberText(self, text):
            result = text

            value = float(text)

            if value == int(value):
                result = str(int(value))

            return result

        def _dateText(self, value):
            dateValue = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=value)

            result = dateValue.strftime("%Y-%m-%d %H:%M:%S")

            if value < 1.0:
                result = dateValue.strftime("%H:%M:%S")
            elif value == int(value):
                result = dateValue.strftime("%Y-%m-%d")

            return result

        def _cellText(self, cellNode):
            result = ""

            cellType = cellNode.attrib.get("t", "n")

            valueNode = cellNode.find(f"{{{self.namespaceMain}}}v")
            valueText = valueNode.text if valueNode is not None and valueNode.text is not None else ""

            if cellType == "s":
                if valueText != "" and int(valueText) < len(self.sharedStringList):
                    result = self.sharedStringList[int(valueText)]
            elif cellType == "inlineStr":
                inlineNode = cellNode.find(f"{{{self.namespaceMain}}}is")

                if inlineNode is not None:
                    result = self._stringText(inlineNode)
            elif cellType == "b":
                result = "TRUE" if valueText == "1" else "FALSE"
            elif cellType == "str" or cellType == "e":
                result = valueText
            else:
                result = valueText

                if valueText != "" and self._numberCheck(valueText):
                    styleText = cellNode.attrib.get("s", "")
                    styleIndex = int(styleText) if styleText.isdigit() else -1

                    if styleIndex in self.dateStyleList:
                        result = self._dateText(float(valueText))
                    else:
                        result = self._numberText(valueText)

            return result.strip()

        def _pivotRangeCollect(self, zipFile, sheetPath):
            resultList = []

            relationshipRootNode = self.office._rootBuild(zipFile, f"{os.path.dirname(sheetPath)}/_rels/{os.path.basename(sheetPath)}.rels")

            if relationshipRootNode is not None:
                for node in relationshipRootNode.iter(f"{{{self.namespacePackage}}}Relationship"):
                    if node.attrib.get("Type", "").endswith("/pivotTable"):
                        target = node.attrib.get("Target", "")
                        pathPivot = target[1:] if target.startswith("/") else os.path.normpath(f"{os.path.dirname(sheetPath)}/{target}")

                        pivotRootNode = self.office._rootBuild(zipFile, pathPivot)

                        if pivotRootNode is not None:
                            locationNode = pivotRootNode.find(f"{{{self.namespaceMain}}}location")

                            if locationNode is not None:
                                referenceSplit = locationNode.attrib.get("ref", "").split(":")

                                if len(referenceSplit) == 2:
                                    resultList.append({
                                        "rowFirst": int(re.sub(r"[A-Za-z]", "", referenceSplit[0])),
                                        "rowLast": int(re.sub(r"[A-Za-z]", "", referenceSplit[1])),
                                        "columnFirst": self._cellColumn(referenceSplit[0]),
                                        "columnLast": self._cellColumn(referenceSplit[1])
                                    })

            return resultList

        def _drawingCollect(self, zipFile, sheetPath, pathOutput):
            resultList = []

            relationshipRootNode = self.office._rootBuild(zipFile, f"{os.path.dirname(sheetPath)}/_rels/{os.path.basename(sheetPath)}.rels")

            if relationshipRootNode is not None:
                for node in relationshipRootNode.iter(f"{{{self.namespacePackage}}}Relationship"):
                    if node.attrib.get("Type", "").endswith("/drawing"):
                        target = node.attrib.get("Target", "")
                        pathDrawing = target[1:] if target.startswith("/") else os.path.normpath(f"{os.path.dirname(sheetPath)}/{target}")

                        drawingRootNode = self.office._rootBuild(zipFile, pathDrawing)
                        drawingRelationshipRootNode = self.office._rootBuild(zipFile, f"{os.path.dirname(pathDrawing)}/_rels/{os.path.basename(pathDrawing)}.rels")

                        pathObject = {}

                        if drawingRelationshipRootNode is not None:
                            for relationshipNode in drawingRelationshipRootNode.iter(f"{{{self.namespacePackage}}}Relationship"):
                                targetDrawing = relationshipNode.attrib.get("Target", "")

                                pathObject[relationshipNode.attrib.get("Id", "")] = targetDrawing[1:] if targetDrawing.startswith("/") else os.path.normpath(f"{os.path.dirname(pathDrawing)}/{targetDrawing}")

                        if drawingRootNode is not None:
                            for drawingNode in drawingRootNode.iter():
                                tag = self.office._nodeTag(drawingNode)

                                if tag == "graphicFrame":
                                    item = {"label": "image", "text": ""}

                                    chartNode = drawingNode.find(f".//{{{self.namespaceChart}}}chart")

                                    if chartNode is not None:
                                        item["label"] = "chart"

                                        relationshipId = chartNode.attrib.get(f"{{{self.namespaceRelationship}}}id", "")
                                        pathChart = pathObject[relationshipId] if relationshipId in pathObject else ""

                                        chartRootNode = self.office._rootBuild(zipFile, pathChart)

                                        if chartRootNode is not None:
                                            item["text"] = self.office._chartText(chartRootNode)

                                    resultList.append(item)
                                elif tag == "pic":
                                    item = {"label": "image", "text": ""}

                                    blipNode = drawingNode.find(f".//{{{self.namespaceDrawing}}}blip")

                                    if blipNode is not None:
                                        relationshipId = blipNode.attrib.get(f"{{{self.namespaceRelationship}}}embed", "")
                                        pathMedia = pathObject[relationshipId] if relationshipId in pathObject else ""

                                        if pathMedia in zipFile.namelist():
                                            os.makedirs(f"{pathOutput}media/", exist_ok=True)

                                            with open(f"{pathOutput}media/{os.path.basename(pathMedia)}", "wb") as file:
                                                file.write(zipFile.read(pathMedia))

                                            item["path"] = f"media/{os.path.basename(pathMedia)}"

                                    resultList.append(item)

            return resultList

        def _rowCollect(self, sheetRootNode, pivotRangeList):
            rowObjectList = []

            rowNumberNext = 1

            for rowNode in sheetRootNode.iter(f"{{{self.namespaceMain}}}row"):
                rowNumberText = rowNode.attrib.get("r", "")
                rowNumber = int(rowNumberText) if rowNumberText.isdigit() else rowNumberNext

                cellList = []
                columnNext = 0

                for cellNode in rowNode:
                    if self.office._nodeTag(cellNode) == "c":
                        reference = cellNode.attrib.get("r", "")
                        column = self._cellColumn(reference) if reference != "" else columnNext

                        while len(cellList) < column:
                            cellList.append("")

                        cellText = self._cellText(cellNode)

                        for a in range(len(pivotRangeList)):
                            if pivotRangeList[a]["rowFirst"] <= rowNumber <= pivotRangeList[a]["rowLast"] and pivotRangeList[a]["columnFirst"] <= column <= pivotRangeList[a]["columnLast"]:
                                cellText = ""

                                break

                        cellList.append(cellText)

                        columnNext = column + 1

                while len(cellList) > 0 and cellList[len(cellList) - 1] == "":
                    cellList.pop()

                rowObjectList.append({"number": rowNumber, "cellList": cellList})

                rowNumberNext = rowNumber + 1

            numberFirst = 0
            numberLast = 0
            columnCount = 0

            for a in range(len(rowObjectList)):
                if len(rowObjectList[a]["cellList"]) > 0:
                    if numberFirst == 0:
                        numberFirst = rowObjectList[a]["number"]

                    numberLast = rowObjectList[a]["number"]
                    columnCount = max(columnCount, len(rowObjectList[a]["cellList"]))

            cellListObject = {}

            for a in range(len(rowObjectList)):
                cellListObject[rowObjectList[a]["number"]] = rowObjectList[a]["cellList"]

            resultList = []

            if numberFirst > 0:
                for a in range(numberFirst, numberLast + 1):
                    cellList = cellListObject[a] if a in cellListObject else []

                    while len(cellList) < columnCount:
                        cellList.append("")

                    resultList.append({"number": a, "cellList": cellList})

            return resultList

        def _mergeCollect(self, sheetRootNode):
            resultList = []

            for node in sheetRootNode.iter(f"{{{self.namespaceMain}}}mergeCell"):
                reference = node.attrib.get("ref", "")

                if reference != "":
                    resultList.append(reference)

            return resultList

        def _sheetBuild(self, zipFile):
            resultList = []

            workbookRootNode = self.office._rootBuild(zipFile, "xl/workbook.xml")
            relationshipRootNode = self.office._rootBuild(zipFile, "xl/_rels/workbook.xml.rels")

            pathObject = {}

            if relationshipRootNode is not None:
                for node in relationshipRootNode.iter(f"{{{self.namespacePackage}}}Relationship"):
                    target = node.attrib.get("Target", "")

                    pathObject[node.attrib.get("Id", "")] = target[1:] if target.startswith("/") else f"xl/{target}"

            if workbookRootNode is not None:
                for node in workbookRootNode.iter(f"{{{self.namespaceMain}}}sheet"):
                    relationshipId = node.attrib.get(f"{{{self.namespaceRelationship}}}id", "")

                    if relationshipId in pathObject and "worksheets/" in pathObject[relationshipId]:
                        resultList.append({"name": node.attrib.get("name", ""), "path": pathObject[relationshipId]})

            return resultList

        def execute(self, pathInput, pathOutput):
            timeStart = time.perf_counter()

            zipFile = zipfile.ZipFile(pathInput)

            self.sharedStringList = []
            self.dateStyleList = []

            sharedStringRootNode = self.office._rootBuild(zipFile, "xl/sharedStrings.xml")

            if sharedStringRootNode is not None:
                self.sharedStringList = self._sharedStringBuild(sharedStringRootNode)

            styleRootNode = self.office._rootBuild(zipFile, "xl/styles.xml")

            if styleRootNode is not None:
                self.dateStyleList = self._dateStyleBuild(styleRootNode)

            sheetList = self._sheetBuild(zipFile)

            pageList = []
            rowCount = 0

            for a in range(len(sheetList)):
                sheetRootNode = self.office._rootBuild(zipFile, sheetList[a]["path"])

                pivotRangeList = self._pivotRangeCollect(zipFile, sheetList[a]["path"])

                rowList = self._rowCollect(sheetRootNode, pivotRangeList) if sheetRootNode is not None else []
                mergeList = self._mergeCollect(sheetRootNode) if sheetRootNode is not None else []

                itemMainList = [{"label": "sheetName", "text": sheetList[a]["name"]}]

                for b in range(len(rowList)):
                    itemMainList.append({"label": "tableRow", "number": rowList[b]["number"], "text": " | ".join(rowList[b]["cellList"]), "cellList": rowList[b]["cellList"]})

                for b in range(len(itemMainList)):
                    itemMainList[b]["flow"] = "main"
                    itemMainList[b]["order"] = b + 1

                itemSecondaryList = self._drawingCollect(zipFile, sheetList[a]["path"], pathOutput)

                for b in range(len(itemSecondaryList)):
                    itemSecondaryList[b]["flow"] = "secondary"
                    itemSecondaryList[b]["order"] = b + 1

                pageList.append({"number": a + 1, "mergeList": mergeList, "itemMainList": itemMainList, "itemSecondaryList": itemSecondaryList})

                rowCount += len(rowList)

            zipFile.close()

            resultObject = {"pageList": pageList}

            with open(f"{pathOutput}ast.json", "w", encoding="utf-8") as file:
                json.dump(resultObject, file, ensure_ascii=False, indent=4)

            timeEnd = time.perf_counter() - timeStart

            print(f"\nLayout.py - Xlsx - Time: {round(timeEnd, 3)} - Sheet: {len(pageList)} - Row: {rowCount}")

            return resultObject

        def __init__(self):
            self.namespaceMain = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
            self.namespaceDrawing = "http://schemas.openxmlformats.org/drawingml/2006/main"
            self.namespaceChart = "http://schemas.openxmlformats.org/drawingml/2006/chart"
            self.namespaceRelationship = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            self.namespacePackage = "http://schemas.openxmlformats.org/package/2006/relationships"

            self.office = Office(self.namespaceMain)

            self.sharedStringList = []
            self.dateStyleList = []

            self.numberFormatDateList = [14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]
