import sys
sys.dont_write_bytecode = True

import os
import glob
import shutil
import time
import subprocess
import xml.etree.ElementTree as xmlET
import re
import html
import json
import base64

import pymupdf

class Parser:
    def _isSpace(self, text):
        return text in (" ", "\t", "\n", "\r", "\u3000", "\xa0", "\u2009")

    def _skipSpaceIfClose(self, characterPrevious, characterNext):
        _, previousY0, previousX1, previousY1 = map(float, characterPrevious["bbox"])
        nextX0, nextY0, _, nextY1 = map(float, characterNext["bbox"])

        gapX = max(0.0, nextX0 - previousX1)
        previousCenterY = (previousY0 + previousY1) / 2.0
        nextCenterY = (nextY0 + nextY1) / 2.0
        gapY = abs(nextCenterY - previousCenterY)

        fontSizePrevious = float(characterPrevious.get("fontSize"))
        fontSizeNext = float(characterNext.get("fontSize"))
        fontSize = (fontSizePrevious + fontSizeNext) / 2.0 if (fontSizePrevious > 0 and fontSizeNext > 0) else max(fontSizePrevious, fontSizeNext, 10.0)

        xThreshold = fontSize * 0.35
        yThreshold = fontSize * 0.60

        return (gapX <= xThreshold) and (gapY <= yThreshold)

    def _bboxValue(self, bbox):
        boxX = float(bbox[0])
        boxY = float(bbox[1])
        boxWidth = float(bbox[2]) - float(bbox[0])
        boxHeight = float(bbox[3]) - float(bbox[1])

        return boxX, boxY, boxWidth, boxHeight

    def _characterGeometry(self, character):
        bbox = character.get("bbox")

        boxX, boxY, boxWidth, boxHeight = self._bboxValue(bbox)

        return {
            "x": boxX,
            "y": boxY,
            "width": boxWidth,
            "height": boxHeight,
            "centerY": boxY + boxHeight / 2.0,
            "raw": character
        }

    def _svgParseLength(self, value):
        value = value.strip()

        match = re.match(r"^([0-9.]+)\s*(px|pt|pc|mm|cm|in)?$", value)
        number = float(match.group(1))
        unit = match.group(2)

        if unit == "px":
            return number
        if unit == "pt":
            return number * 96.0 / 72.0
        if unit == "pc":
            return number * 16.0
        if unit == "mm":
            return number * 96.0 / 25.4
        if unit == "cm":
            return number * 96.0 / 2.54
        if unit == "in":
            return number * 96.0

        return number

    def _svgSize(self, pageNumber):
        with open(f"{self.pathTemplate}{pageNumber}.svg", "r", encoding="utf-8") as file:
            content = file.read()

        root = xmlET.fromstring(content)

        attributeWidth = root.get("width")
        attributeHeight = root.get("height")
        attributeViewBox = root.get("viewBox")

        width = self._svgParseLength(attributeWidth)
        height = self._svgParseLength(attributeHeight)

        if attributeViewBox:
            viewBoxPartList = re.split(r"[,\s]+", attributeViewBox.strip())

            if len(viewBoxPartList) == 4:
                viewBoxWidth = float(viewBoxPartList[2])
                viewBoxHeight = float(viewBoxPartList[3])

                if width is None:
                    width = viewBoxWidth

                if height is None:
                    height = viewBoxHeight

        return width, height

    def _svgBase64(self, pageNumber):
        with open(f"{self.pathTemplate}{pageNumber}.svg", "rb") as file:
            fileRead = file.read()

        svgBase64 = base64.b64encode(fileRead).decode("ascii")

        return f"data:image/svg+xml;base64,{svgBase64}"

    def _overlayGroupCharacterIntoVisualLine(self, characterList):
        resultLineList = []

        geometryList = [self._characterGeometry(character) for character in characterList]

        heightList = sorted([geometry["height"] for geometry in geometryList if geometry["height"] > 0])

        if heightList:
            heightMedian = heightList[len(heightList) // 2]
        else:
            heightMedian = 8.0

        toleranceY = max(2.0, min(6.0, heightMedian * 0.45))

        geometryList.sort(key=lambda geometry: (geometry["centerY"], geometry["x"]))

        for geometry in geometryList:
            if not resultLineList:
                resultLineList.append({
                    "character": [geometry],
                    "centerY": geometry["centerY"]
                })

                continue

            lastLine = resultLineList[-1]

            if abs(geometry["centerY"] - lastLine["centerY"]) <= toleranceY:
                lastLine["character"].append(geometry)

                centerYlist = [geo["centerY"] for geo in lastLine["character"]]

                lastLine["centerY"] = sum(centerYlist) / len(centerYlist)
            else:
                resultLineList.append({
                    "character": [geometry],
                    "centerY": geometry["centerY"]
                })

        for line in resultLineList:
            line["character"].sort(key=lambda geometry: geometry["x"])

            x0 = min(geometry["x"] for geometry in line["character"])
            y0 = min(geometry["y"] for geometry in line["character"])
            x1 = max(geometry["x"] + geometry["width"] for geometry in line["character"])
            y1 = max(geometry["y"] + geometry["height"] for geometry in line["character"])

            line["x0"] = x0
            line["y0"] = y0
            line["x1"] = x1
            line["y1"] = y1

        resultLineList.sort(key=lambda line: line["centerY"])

        return resultLineList

    def _overlayNormalizeClipboardText(self, text):
        return (text.replace("\xa0", " ").replace("\u2009", " "))

    def _overlayBuildTitle(self, character):
        bbox = character.get("bbox")
        text = character.get("text")

        boxX, boxY, boxWidth, boxHeight = self._bboxValue(bbox)

        x = boxX
        y = boxY + boxHeight

        return (
            f'block={character.get("indexBlock")} | '
            f'line={character.get("indexLine")} | '
            f'seq={character.get("seq")} | '
            f'bbox=({boxX:.3f}, {boxY:.3f}, {boxWidth:.3f}, {boxHeight:.3f}) | '
            f'text={text} | '
            f'x={x:.3f} | '
            f'y={y:.3f} | '
            f'fontSize={float(character.get("fontSize")):.3f}'
        )

    def _overlayCharacterSpace(self, character):
        if character == " ":
            return "·"
        
        if character == "\t":
            return "⇥"
        
        if character == "\n":
            return "↵"
        
        if character == "\r":
            return "␍"
        
        if character == "\u3000":
            return "□"
        
        if character == "\xa0":
            return "⍽"

        if character == "\u2009":
            return " "

        return character

    def _layoutBuildBlockFragment(self, characterList):
        resultList = []

        lineObject = {}

        for character in characterList:
            lineObject.setdefault((character["indexBlock"], character["indexLine"]), []).append(character)

        blockObject = {}

        for (indexBlock, indexLine), characterList in lineObject.items():
            characterList.sort(key=lambda character: float(character["bbox"][0]))

            x0 = min(float(character["bbox"][0]) for character in characterList)
            y0 = min(float(character["bbox"][1]) for character in characterList)
            x1 = max(float(character["bbox"][2]) for character in characterList)
            y1 = max(float(character["bbox"][3]) for character in characterList)

            text = "".join(character.get("text") for character in characterList)

            fontSizeList = [float(character.get("fontSize", 10.0)) for character in characterList]
            fontSize = sum(fontSizeList) / len(fontSizeList)

            seqMin = min(int(character.get("seq", 0)) for character in characterList)
            seqMax = max(int(character.get("seq", 0)) for character in characterList)

            lineData = {
                "indexBlock": indexBlock,
                "indexLine": indexLine,
                "text": text,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "fontSize": fontSize,
                "width": x1 - x0,
                "height": y1 - y0,
                "characterList": characterList,
                "seqMin": seqMin,
                "seqMax": seqMax
            }

            blockObject.setdefault(indexBlock, []).append(lineData)

        for indexBlock, lineList in blockObject.items():
            lineList.sort(key=lambda line: (line["y0"], line["x0"]))

            x0 = min(line["x0"] for line in lineList)
            y0 = min(line["y0"] for line in lineList)
            x1 = max(line["x1"] for line in lineList)
            y1 = max(line["y1"] for line in lineList)

            resultList.append({
                "indexBlock": indexBlock,
                "lineList": lineList,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "width": x1 - x0,
                "height": y1 - y0
            })

        resultList.sort(key=lambda frag: (frag["y0"], frag["x0"]))
        
        return resultList

    def _layoutSplitFragmentIntoBand(self, fragmentList, pageHeight):
        resultList = []

        heightList = [fragment["height"] for fragment in fragmentList if fragment["height"] > 0]
        medianHeight = sorted(heightList)[len(heightList) // 2]
        gapThreshold = max(medianHeight * 1.8, pageHeight * 0.015)

        currentBand = [fragmentList[0]]
        currentBottom = fragmentList[0]["y1"]

        for fragment in fragmentList[1:]:
            gap = fragment["y0"] - currentBottom

            if gap > gapThreshold:
                resultList.append(currentBand)

                currentBand = [fragment]
                currentBottom = fragment["y1"]
            else:
                currentBand.append(fragment)
                currentBottom = max(currentBottom, fragment["y1"])

        if currentBand:
            resultList.append(currentBand)

        return resultList

    def _layoutClusterNarrowFragmentIntoColumn(self, fragmentList, pageWidth):
        resultColumnList = []
        
        toleranceX = max(24.0, pageWidth * 0.03)
        centerTolerance = max(30.0, pageWidth * 0.035)

        fragmentSortedList = sorted(fragmentList, key=lambda fragment: fragment["x0"])
        
        for fragmentSorted in fragmentSortedList:
            assigned = None

            fragCenter = (fragmentSorted["x0"] + fragmentSorted["x1"]) / 2.0

            for column in resultColumnList:
                columnCenter = (column["x0"] + column["x1"]) / 2.0

                overlap = max(0.0, min(fragmentSorted["x1"], column["x1"]) - max(fragmentSorted["x0"], column["x0"]))

                widthMin = min(fragmentSorted["width"], column["x1"] - column["x0"])
                overlapRatio = (overlap / widthMin) if widthMin > 0 else 0.0

                sameLeft = abs(fragmentSorted["x0"] - column["x0"]) <= toleranceX
                sameRight = abs(fragmentSorted["x1"] - column["x1"]) <= toleranceX
                sameCenter = abs(fragCenter - columnCenter) <= centerTolerance

                if overlapRatio >= 0.22 or sameLeft or sameRight or sameCenter:
                    assigned = column

                    break

            if assigned is None:
                assigned = {
                    "x0": fragmentSorted["x0"],
                    "x1": fragmentSorted["x1"],
                    "y0": fragmentSorted["y0"],
                    "y1": fragmentSorted["y1"],
                    "fragmentList": []
                }

                resultColumnList.append(assigned)

            assigned["x0"] = min(assigned["x0"], fragmentSorted["x0"])
            assigned["x1"] = max(assigned["x1"], fragmentSorted["x1"])
            assigned["y0"] = min(assigned["y0"], fragmentSorted["y0"])
            assigned["y1"] = max(assigned["y1"], fragmentSorted["y1"])
            assigned["fragmentList"].append(fragmentSorted)

        for column in resultColumnList:
            column["fragmentList"].sort(key=lambda fragment: (fragment["y0"], fragment["x0"]))

            characterCount = sum(len(line["text"]) for fragment in column["fragmentList"] for line in fragment["lineList"])
            lineCount = sum(len(fragment["lineList"]) for fragment in column["fragmentList"])
            width = column["x1"] - column["x0"]
            height = column["y1"] - column["y0"]

            column["score"] = (characterCount * 1.0 + lineCount * 10.0 + width * 0.20 + height * 0.05)

        return resultColumnList

    def _layoutFragmentToRegion(self, fragmentList):
        lineList = []

        for fragment in fragmentList:
            lineList.extend(fragment["lineList"])

        x0 = min(line["x0"] for line in lineList)
        y0 = min(line["y0"] for line in lineList)
        x1 = max(line["x1"] for line in lineList)
        y1 = max(line["y1"] for line in lineList)

        return {
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "lineList": lineList
        }

    def _pageBuildReadingRegion(self, characterList, pageWidth, pageHeight):
        resultList = []
        
        fragmentList = self._layoutBuildBlockFragment(characterList)
        bandList = self._layoutSplitFragmentIntoBand(fragmentList, pageHeight)

        fullWidthThreshold = pageWidth * 0.72

        for band in bandList:
            band = sorted(band, key=lambda fragment: (fragment["y0"], fragment["x0"]))

            pendingNarrowList = []

            for fragment in band:
                if fragment["width"] >= fullWidthThreshold:
                    if pendingNarrowList:
                        columnList = self._layoutClusterNarrowFragmentIntoColumn(pendingNarrowList, pageWidth)
                        columnList = sorted(columnList, key=lambda column: column["x0"])

                        for column in columnList:
                            resultList.append(self._layoutFragmentToRegion(column["fragmentList"]))

                        pendingNarrowList = []

                    resultList.append(self._layoutFragmentToRegion([fragment]))
                else:
                    pendingNarrowList.append(fragment)

            if pendingNarrowList:
                columnList = self._layoutClusterNarrowFragmentIntoColumn(pendingNarrowList, pageWidth)
                columnList = sorted(columnList, key=lambda column: column["x0"])

                for column in columnList:
                    resultList.append(self._layoutFragmentToRegion(column["fragmentList"]))

        return resultList

    def _search(self, characterList):
        highlightList = []

        if not self.textSearch:
            return highlightList

        rectangleList = []

        searchText = self._overlayNormalizeClipboardText(self.textSearch)
        modeOptionList = {item.strip() for item in self.mode.split(",") if item.strip()}
        
        isWholeWord = "wholeWord" in modeOptionList
        isCaseSensitive = "caseSensitive" in modeOptionList
        isBoth = "both" in modeOptionList
        isHorizontal = isBoth or "horizontal" in modeOptionList
        isVertical = isBoth or "vertical" in modeOptionList
        
        lineObject = {}
        blockObject = {}

        for character in characterList:
            lineObject.setdefault((character["indexBlock"], character["indexLine"]), []).append(character)
            blockObject.setdefault(character["indexBlock"], []).append(character)

        groupList = []

        if not isVertical or isHorizontal:
            for _, lineCharacterList in sorted(lineObject.items()):
                groupList.append({
                    "orientation": "line",
                    "characterList": lineCharacterList
                })

        if isVertical:
            for _, blockCharacterList in sorted(blockObject.items()):
                columnObject = {}

                for character in blockCharacterList:
                    x0 = round(float(character["bbox"][0]), 1)
                    columnObject.setdefault(x0, []).append(character)

                for _, columnCharacterList in sorted(columnObject.items()):
                    groupList.append({
                        "orientation": "vertical",
                        "characterList": columnCharacterList
                    })

        for group in groupList:
            groupCharacterList = group["characterList"]
            groupCharacterList.sort(key=lambda character: int(character.get("seq", 0)))

            if not groupCharacterList:
                continue

            if group["orientation"] == "vertical":
                groupCharacterList.sort(key=lambda character: (float(character["bbox"][1]), int(character.get("seq", 0))))

                lineOrientation = "vertical"
            else:
                wmode = int(groupCharacterList[0].get("wmode"))

                direction = groupCharacterList[0].get("direction")
                directionX = abs(float(direction[0]))
                directionY = abs(float(direction[1]))

                lineOrientation = "vertical" if (wmode == 1 or directionY > directionX) else "horizontal"

            if not isBoth and isHorizontal and lineOrientation != "horizontal":
                continue

            if not isBoth and isVertical and lineOrientation != "vertical":
                continue

            lineText = "".join(character.get("text", "") for character in groupCharacterList)
            textNormalized = self._overlayNormalizeClipboardText(lineText)

            matchSpanList = []

            if isWholeWord:
                if isCaseSensitive:
                    pattern = re.compile(rf"(?<!\w){re.escape(searchText)}(?!\w)")
                else:
                    pattern = re.compile(rf"(?<!\w){re.escape(searchText)}(?!\w)", re.IGNORECASE)

                for match in pattern.finditer(textNormalized):
                    matchSpanList.append((match.start(), match.end()))
            else:
                if not isCaseSensitive:
                    searchTextCompare = searchText.lower()
                    textCompare = textNormalized.lower()
                else:
                    searchTextCompare = searchText
                    textCompare = textNormalized

                searchLength = len(searchTextCompare)
                
                startIndex = 0

                while True:
                    index = textCompare.find(searchTextCompare, startIndex)

                    if index == -1:
                        break

                    matchSpanList.append((index, index + searchLength))
                    
                    startIndex = index + 1

            for startIndex, endIndex in matchSpanList:
                matchCharacterList = groupCharacterList[startIndex:endIndex]

                if not matchCharacterList:
                    continue

                rectangleList.append({
                    "x0": min(float(character["bbox"][0]) for character in matchCharacterList),
                    "y0": min(float(character["bbox"][1]) for character in matchCharacterList),
                    "x1": max(float(character["bbox"][2]) for character in matchCharacterList),
                    "y1": max(float(character["bbox"][3]) for character in matchCharacterList)
                })

        for highlight in rectangleList:
            x0 = float(highlight["x0"])
            y0 = float(highlight["y0"])
            width = float(highlight["x1"]) - x0
            height = float(highlight["y1"]) - y0

            highlightList.append(f'<div class="search_highlight" style="left:{x0:.6f}px; top:{y0:.6f}px; width:{width:.6f}px; height:{height:.6f}px;"></div>')

        return "".join(highlightList)

    def _overlay(self, regionList, width, height):
        layerHtmlList = []

        for indexRegion, region in enumerate(regionList):
            regionX = region["x0"]
            regionY = region["y0"]

            regionCharacterList = []

            for line in region["lineList"]:
                regionCharacterList.extend(line["characterList"])

            visualLineList = self._overlayGroupCharacterIntoVisualLine(regionCharacterList)

            x0 = min(line["x0"] for line in visualLineList) if visualLineList else region["x0"]
            y0 = min(line["y0"] for line in visualLineList) if visualLineList else region["y0"]
            x1 = max(line["x1"] for line in visualLineList) if visualLineList else region["x1"]
            y1 = max(line["y1"] for line in visualLineList) if visualLineList else region["y1"]

            regionX = x0
            regionY = y0
            regionWidth = x1 - x0
            regionHeight = y1 - y0

            layerCharacterList = []

            for indexLine, line in enumerate(visualLineList):
                for indexGeometry, geometry in enumerate(line["character"]):
                    character = geometry["raw"]
                    bbox = character.get("bbox")
                    text = character.get("text")
                    textClipboard = self._overlayNormalizeClipboardText(text)
                    fontSize = float(character.get("fontSize"))

                    boxX, boxY, boxWidth, boxHeight = self._bboxValue(bbox)

                    relativeX = boxX - regionX
                    relativeY = boxY - regionY

                    x = relativeX
                    y = relativeY + boxHeight - 1.0

                    title = html.escape(self._overlayBuildTitle(character), quote=True)

                    isSpace = self._isSpace(text)

                    if self.isDebug:
                        textHtml = html.escape(self._overlayCharacterSpace(text), quote=False)
                    else:
                        textHtml = html.escape(text, quote=False)

                    layerDebug = ""
                    
                    if self.isDebug:
                        layerDebug = f'''
<rect x="{relativeX:.6f}" y="{relativeY:.6f}" width="{boxWidth:.6f}" height="{boxHeight:.6f}"/>
<circle cx="{x:.6f}" cy="{y:.6f}" r="1.6">
    <title>{title}</title>
</circle>
'''

                    layerCharacterList.append(f'''
<g class="layer_character">
    {layerDebug}
    <text class="{"space" if isSpace else ""}"
        x="{x:.6f}"
        y="{y:.6f}"
        font-size="{fontSize:.6f}"
        data-indexregion="{indexRegion}"
        data-indexline="{indexLine}"
        data-indexgeometry="{indexGeometry}"
        data-indexblock="{character.get('block')}"
        data-text="{html.escape(textClipboard, quote=True)}"
        xml:space="preserve">{textHtml}</text>
</g>
''')

            layerSvg = f'''
<svg class="layer_svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {regionWidth:.6f} {regionHeight:.6f}" preserveAspectRatio="xMinYMin meet">
    <style>
        .layer_character rect {{
            fill: rgba(255, 0, 0, 0.10);
            stroke: rgba(255, 0, 0, 0.95);
            stroke-width: 0.5;
        }}

        .layer_character circle {{
            fill: rgba(0, 80, 255, 0.95);
            stroke: none;
            cursor: pointer;
        }}

        .layer_character text {{
            fill: rgba(0, 150, 0, {0.95 if self.isDebug else 0});
        }}

        .layer_character text.space {{
            fill: rgba(255, 140, 0, {0.95 if self.isDebug else 0});
        }}

        .layer_character text::selection {{
            background: rgba(0, 120, 215, 0.10);
        }}

        .layer_character text.space::selection {{
            background: transparent;
            color: transparent;
        }}
    </style>
    {''.join(layerCharacterList)}
</svg>
'''
            
            layerHtmlList.append(f'''<div class="region_container" data-indexregion="{indexRegion}" style="left:{regionX:.6f}px; top:{regionY:.6f}px; width:{regionWidth:.6f}px; height:{regionHeight:.6f}px;">{layerSvg}</div>''')

        return f'''<div class="root_container" style="width:{width:.6f}px; height:{height:.6f}px;">{''.join(layerHtmlList)}</div>'''

    def _html(self, pageNumber, width, height, overlay, searchHighlight):
        return f"""
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title></title>
        <style>
            html, body {{
                margin: 0;
                padding: 0;
                background: #808080;
            }}

            body {{
                padding: 16px;
                font-family: Arial, sans-serif;
            }}

            .page {{
                position: relative;
                width: {width:.6f}px;
                height: {height:.6f}px;
                margin: 0 auto;
                background: #ffffff;
                overflow: hidden;
            }}

            .page .layer_template {{
                position: absolute;
                z-index: 1;
                width: 100%;
                height: 100%;
                user-select: none;
            }}

            .page .search_highlight {{
                position: absolute;
                z-index: 2;
                background: rgba(255, 235, 59, 0.65);
                border: 1px solid rgba(224, 181, 0, 0.85);
                box-sizing: border-box;
                pointer-events: none;
            }}

            .page .root_container {{
                position: absolute;
                z-index: 3;
            }}

            .page .root_container .region_container {{
                position: absolute;
            }}

            .page .root_container .region_container .layer_svg {{
                position: absolute;
                width: 100%;
                height: 100%;
                overflow: visible;
            }}
        </style>
    </head>
    <body>
        <div class="page">
            <img class="layer_template" src="{html.escape(self._svgBase64(pageNumber), quote=True)}" alt="">
            {searchHighlight}
            {overlay}
        </div>
        <script>
            document.addEventListener("copy", function (event) {{
                const selection = window.getSelection();

                if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {{
                    return;
                }}

                const overlay = document.querySelector(".root_container");

                if (!overlay) {{
                    return;
                }}

                function textElementFromNode(node) {{
                    if (!node) {{
                        return null;
                    }}

                    let element = null;

                    if (node.nodeType === Node.TEXT_NODE) {{
                        element = node.parentElement;
                    }} else if (node.nodeType === Node.ELEMENT_NODE) {{
                        element = node;
                    }}

                    if (!element) {{
                        return null;
                    }}

                    if (element.tagName && element.tagName.toLowerCase() === "text" && overlay.contains(element)) {{
                        return element;
                    }}

                    if (typeof element.closest === "function") {{
                        const closestText = element.closest("text");

                        if (closestText && overlay.contains(closestText)) {{
                            return closestText;
                        }}
                    }}

                    return null;
                }}

                const anchorText = textElementFromNode(selection.anchorNode);
                const focusText = textElementFromNode(selection.focusNode);

                if (!anchorText || !focusText) {{
                    return;
                }}

                const textNodeList = Array.from(overlay.querySelectorAll("text"));

                if (textNodeList.length === 0) {{
                    return;
                }}

                let startIndex = textNodeList.indexOf(anchorText);
                let endIndex = textNodeList.indexOf(focusText);

                if (startIndex === -1 || endIndex === -1) {{
                    return;
                }}

                if (startIndex > endIndex) {{
                    const temporary = startIndex;
                    startIndex = endIndex;
                    endIndex = temporary;
                }}

                const selectedNodes = textNodeList.slice(startIndex, endIndex + 1);

                if (selectedNodes.length === 0) {{
                    return;
                }}

                const selectedList = selectedNodes.map(function (node) {{
                    const indexRegion = parseInt(node.getAttribute("data-indexregion") || "0", 10);
                    const indexLine = parseInt(node.getAttribute("data-indexline") || "0", 10);
                    const indexGeometry = parseInt(node.getAttribute("data-indexgeometry") || "0", 10);
                    const indexBlock = parseInt(node.getAttribute("data-indexblock") || "0", 10);
                    const text = node.getAttribute("data-text") !== null ? node.getAttribute("data-text") : (node.textContent || "");

                    return {{
                        indexRegion: indexRegion,
                        indexLine: indexLine,
                        indexGeometry: indexGeometry,
                        indexBlock: indexBlock,
                        text: text
                    }};
                }});

                selectedList.sort(function (a, b) {{
                    if (a.indexRegion !== b.indexRegion) {{
                        return a.indexRegion - b.indexRegion;
                    }}

                    if (a.indexLine !== b.indexLine) {{
                        return a.indexLine - b.indexLine;
                    }}

                    return a.indexGeometry - b.indexGeometry;
                }});

                let resultPartList = [];
                let currentRegion = selectedList[0].indexRegion;
                let currentLine = selectedList[0].indexLine;
                let currentBlock = selectedList[0].indexBlock;
                let currentText = "";

                for (let a = 0; a < selectedList.length; a++) {{
                    const item = selectedList[a];

                    if (item.indexRegion !== currentRegion) {{
                        if (currentText) {{
                            resultPartList.push(currentText);
                        }}

                        resultPartList.push("");
                        currentText = "";
                        currentRegion = item.indexRegion;
                        currentLine = item.indexLine;
                        currentBlock = item.indexBlock;
                    }} else if (item.indexLine !== currentLine) {{
                        resultPartList.push(currentText);

                        if (item.indexBlock !== currentBlock) {{
                            resultPartList.push("");
                        }}

                        currentText = "";
                        currentLine = item.indexLine;
                        currentBlock = item.indexBlock;
                    }}

                    currentText += item.text;
                }}

                if (currentText) {{
                    resultPartList.push(currentText);
                }}

                event.preventDefault();
                event.clipboardData.setData("text/plain", resultPartList.join("\\n"));
            }});
        </script>
    </body>
</html>
"""

    def _clean(self):
        commandList = [
            self.pathExecutable,
            "clean",
            "--structure=drop",
            "-gggg",
            "-s",
            "-A",
            self.pathInput,
            f"{self.pathOutput}cleaned.pdf"
        ]

        subprocess.run(commandList, check=True, capture_output=True, text=True)

    def _analyze(self):
        document = pymupdf.open(f"{self.pathOutput}cleaned.pdf")

        for a in range(document.page_count):
            page = document[a]
            data = page.get_text("rawdict")

            seq = -1
            characterList = []

            for indexBlock, block in enumerate(data.get("blocks", [])):
                if block.get("type") != 0:
                    continue

                for indexLine, line in enumerate(block.get("lines", [])):
                    for span in line.get("spans", []):
                        for character in span.get("chars", []):
                            seq += 1

                            origin = character.get("origin")

                            characterList.append({
                                "indexBlock": indexBlock,
                                "indexLine": indexLine,
                                "lineBbox": line.get("bbox"),
                                "wmode": line.get("wmode"),
                                "direction": line.get("dir"),
                                "seq": seq,
                                "quad": None,
                                "bbox": character.get("bbox"),
                                "text": character.get("c"),
                                "x": origin[0],
                                "y": origin[1],
                                "font": span.get("font"),
                                "fontSize": span.get("size"),
                                "color": span.get("color"),
                                "flags": span.get("flags")
                            })

            with open(f"{self.pathAnalyze}{a + 1}.json", "w", encoding="utf-8") as file:
                json.dump({
                    "characterList": characterList,
                    "characterListCount": len(characterList),
                    "page": a + 1
                }, file, ensure_ascii=False, indent=2)

        document.close()

    def _image(self):
        commandList = [
            self.pathExecutable,
            "draw",
            "-q",
            "-r",
            "300",
            "-F",
            "png",
            "-o",
            f"{self.pathImage}%d.png",
            f"{self.pathOutput}cleaned.pdf"
        ]

        subprocess.run(commandList, check=True, capture_output=True, text=True)

    def _template(self):
        commandList = [
            self.pathExecutable,
            "draw",
            "-q",
            "-F",
            "svg",
            "-o",
            f"{self.pathTemplate}%d.svg",
            f"{self.pathOutput}cleaned.pdf"
        ]

        subprocess.run(commandList, check=True, capture_output=True, text=True)

    def _page(self):
        fileNameList = sorted(glob.glob(f"{self.pathAnalyze}*.json"), key=lambda path: int(os.path.splitext(os.path.basename(path))[0]))

        for fileName in fileNameList:
            pageNumber = int(os.path.splitext(os.path.basename(fileName))[0])

            with open(fileName, "r", encoding="utf-8") as file:
                pageData = json.load(file)

            characterList = pageData.get("characterList", [])
            
            svgWidth, svgHeight = self._svgSize(pageNumber)

            regionList = self._pageBuildReadingRegion(characterList, svgWidth, svgHeight)
            overlay = self._overlay(regionList, svgWidth, svgHeight)
            searchHighlight = self._search(characterList)
            htmlContent = self._html(pageNumber, svgWidth, svgHeight, overlay, searchHighlight)

            with open(f"{self.pathPage}{pageNumber}.html", "w", encoding="utf-8") as file:
                file.write(htmlContent)

    def execute(self):
        timeStart = time.perf_counter()

        self._clean()
        self._analyze()
        self._image()
        self._template()
        self._page()

        timeEnd = time.perf_counter() - timeStart

        print(f"Time: {round(timeEnd, 3)}\n")

    def __init__(self):
        self.pathExecutable = sys.argv[1]
        self.pathInput = sys.argv[2]
        self.pathOutput = sys.argv[3]
        self.textSearch = sys.argv[4]
        self.mode = sys.argv[5]

        self.pathAnalyze = f"{self.pathOutput}analyze/"
        self.pathImage = f"{self.pathOutput}image/"
        self.pathTemplate = f"{self.pathOutput}template/"
        self.pathPage = f"{self.pathOutput}page/"

        self.isDebug = False

        if os.path.isfile(f"{self.pathOutput}cleaned.pdf"):
            os.remove(f"{self.pathOutput}cleaned.pdf")

        if os.path.isdir(self.pathAnalyze):
            shutil.rmtree(self.pathAnalyze)

        if os.path.isdir(self.pathImage):
            shutil.rmtree(self.pathImage)

        if os.path.isdir(self.pathTemplate):
            shutil.rmtree(self.pathTemplate)

        if os.path.isdir(self.pathPage):
            shutil.rmtree(self.pathPage)

        os.makedirs(self.pathAnalyze, exist_ok=True)
        os.makedirs(self.pathImage, exist_ok=True)
        os.makedirs(self.pathTemplate, exist_ok=True)
        os.makedirs(self.pathPage, exist_ok=True)

parser = Parser()
parser.execute()
