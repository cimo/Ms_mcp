import sys
import os
import shutil
import subprocess
import xml.etree.ElementTree as xmlET
import re
import html
import json
import base64

class Tool:
    def _characterGeometry(self, character):
        bbox = character.get("bbox")

        boxX = float(bbox.get("x", 0.0))
        boxY = float(bbox.get("y", 0.0))
        boxW = float(bbox.get("w", 1.0))
        boxH = float(bbox.get("h", 1.0))

        return {
            "x": boxX,
            "y": boxY,
            "w": boxW,
            "h": boxH,
            "centerY": boxY + boxH / 2.0,
            "raw": character
        }
    
    def _groupCharacterIntoLine(self, characterList, toleranceY):
        characterObject = [self._characterGeometry(character) for character in characterList]
        characterObject.sort(key=lambda character: (character["centerY"], character["x"]))

        lineList = []

        for character in characterObject:
            if not lineList:
                lineList.append({
                    "centerY": character["centerY"],
                    "character": [character],
                })

                continue

            lastLine = lineList[-1]

            if abs(character["centerY"] - lastLine["centerY"]) <= toleranceY:
                lastLine["character"].append(character)

                centerYlist = [characterSub["centerY"] for characterSub in lastLine["character"]]

                lastLine["centerY"] = sum(centerYlist) / len(centerYlist)
            else:
                lineList.append({
                    "centerY": character["centerY"],
                    "character": [character],
                })

        for line in lineList:
            line["character"].sort(key=lambda character: character["x"])

        lineList.sort(key=lambda line: line["centerY"])

        return lineList

    def _svgParseLength(self, value):
        if value is None:
            return None

        value = value.strip()
        
        match = re.match(r"^([0-9.]+)\s*(px|pt|pc|mm|cm|in)?$", value)
        
        if not match:
            return None

        number = float(match.group(1))
        unit = match.group(2) or "px"

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

        if width is not None and height is not None:
            return width, height

    def _buildTitle(self, character):
        bbox = character.get("bbox")
        text = character.get("text")

        boxX = float(bbox.get("x", 0.0))
        boxY = float(bbox.get("y", 0.0))
        boxW = float(bbox.get("w", 0.0))
        boxH = float(bbox.get("h", 0.0))

        x = boxX
        y = boxY + boxH

        return (
            f'block={character.get("block")} | '
            f'line={character.get("line")} | '
            f'seq={character.get("seq")} | '
            f'bbox=({boxX:.3f}, {boxY:.3f}, {boxW:.3f}, {boxH:.3f}) | '
            f'text={text} | '
            f'x={x:.3f} | '
            f'y={y:.3f} | '
            f'fontSize={float(character.get("fontSize")):.3f}'
        )

    def _characterSpace(self, character):
        if character == " ":
            return "·"
        if character == "\u3000":
            return "□"
        if character == "\t":
            return "⇥"
        if character == "\n":
            return "↵"
        
        return character

    def _overlay(self, lineList, width, height):
        resultList = []

        for lineIndex, line in enumerate(lineList):
            for characterIndex, item in enumerate(line["character"]):
                character = item["raw"]

                bbox = character.get("bbox")
                text = character.get("text")
                font = character.get("fontSize")
                fontSize = float(font)

                boxX = float(bbox.get("x", 0.0))
                boxY = float(bbox.get("y", 0.0))
                boxW = float(bbox.get("w", 1.0))
                boxH = float(bbox.get("h", 1.0))

                x = boxX
                y = boxY + boxH - 1.0

                title = html.escape(self._buildTitle(character), quote=True)

                isSpace = text in (" ", "\u3000", "\t", "\n")

                if self.isDebug:
                    text = html.escape(self._characterSpace(text), quote=True)
                else:
                    text = html.escape(text, quote=True)

                resultList.append(f"""
<g class="group">
    {f'''
    <rect x="{boxX:.6f}" y="{boxY:.6f}" width="{boxW:.6f}" height="{boxH:.6f}">
        <title>{title}</title>
    </rect>
    <circle cx="{x:.6f}" cy="{y:.6f}" r="1.6">
        <title>{title}</title>
    </circle>
    ''' if self.isDebug else ''}
    <text class="{'space' if isSpace else ''}" x="{x:.6f}" y="{y:.6f}" font-size="{fontSize:.6f}" data-lineIndex="{lineIndex}" data-characterIndex="{characterIndex}" data-text="{text}" xml:space="preserve">{text}</text>
</g>
""")

        return f"""
<svg class="layerOverlay" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.6f} {height:.6f}" preserveAspectRatio="xMinYMin meet">
    <style>
        .group rect {{
            fill: rgba(255, 0, 0, 0.10);
            stroke: rgba(255, 0, 0, 0.95);
            stroke-width: 0.5;
        }}

        .group circle {{
            fill: rgba(0, 80, 255, 0.95);
            stroke: none;
        }}

        .group text {{
            fill: rgba(0, 150, 0, {0.95 if self.isDebug else 0});
        }}

        .group text.space {{
            fill: rgba(255, 140, 0, {0.95 if self.isDebug else 0});
        }}

        .group text::selection {{
            background: rgba(0, 120, 215, 0.10);
        }}

        .group text.space::selection {{
            background: transparent;
            color: transparent;
        }}
    </style>
    {''.join(resultList)}
</svg>
"""

    def _svgBase64(self, pageNumber):
        with open(f"{self.pathTemplate}{pageNumber}.svg", "rb") as file:
            fileRead = file.read()

        svgBase64 = base64.b64encode(fileRead).decode("ascii")

        return f"data:image/svg+xml;base64,{svgBase64}"

    def _html(self, pageNumber, width, height, overlay):
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
            }}

            .layerTemplate {{
                position: absolute;
                width: 100%;
                height: 100%;
                z-index: 1;
                user-select: none;
            }}

            .layerOverlay {{
                position: absolute;
                width: 100%;
                height: 100%;
                z-index: 2;
            }}
        </style>
    </head>
    <body>
        <div class="page">
            <img class="layerTemplate" src="{html.escape(self._svgBase64(pageNumber), quote=True)}" alt="">
            {overlay}
        </div>
        <script>
            document.addEventListener("copy", function (event) {{
                const selection = window.getSelection();

                if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {{
                    return;
                }}

                const overlay = document.querySelector(".layerOverlay");

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
                    const lineIndex = parseInt(node.getAttribute("data-lineIndex") || "0", 10);
                    const characterIndex = parseInt(node.getAttribute("data-characterIndex") || "0", 10);
                    const text = node.getAttribute("data-text") !== null ? node.getAttribute("data-text") : (node.textContent || "");

                    return {{
                        lineIndex,
                        characterIndex,
                        text
                    }};
                }});

                selectedList.sort(function (a, b) {{
                    if (a.lineIndex !== b.lineIndex) {{
                        return a.lineIndex - b.lineIndex;
                    }}

                    return a.characterIndex - b.characterIndex;
                }});

                let resultPartList = [];
                let currentLine = selectedList[0].lineIndex;
                let currentText = "";

                for (let a = 0; a < selectedList.length; a++) {{
                    const item = selectedList[a];

                    if (item.lineIndex !== currentLine) {{
                        resultPartList.push(currentText);

                        currentText = "";
                        currentLine = item.lineIndex;
                    }}

                    currentText += item.text;
                }}

                resultPartList.push(currentText);

                const result = resultPartList.join("\\n");

                event.preventDefault();
                event.clipboardData.setData("text/plain", result);
            }});
        </script>
    </body>
</html>
"""

    def javascriptAnalyze(self):
        print()
        
        commandList = [
            self.pathExecutable,
            "run",
            f"{self.pathBaseDir}runAnalyze.js",
            self.pathInput
        ]

        result = subprocess.run(commandList, check=True, capture_output=True, text=True)

        for line in result.stdout.splitlines():
            line = line.strip()

            if not line:
                continue

            data = json.loads(line)
            pageNumber = int(data["page"])
            pathJson = f"{self.pathAnalyze}{pageNumber}.json"

            with open(pathJson, "w", encoding="utf-8") as file:
                json.dump(data, file, ensure_ascii=False, indent=2)

    def template(self):
        commandList = [
            self.pathExecutable,
            "draw",
            "-q",
            "-F",
            "svg",
            "-o",
            f"{self.pathTemplate}%d.svg",
            self.pathInput
        ]

        subprocess.run(commandList, check=True)

    def build(self):
        for filename in os.listdir(self.pathAnalyze):
            with open(f"{self.pathAnalyze}{filename}", "r", encoding="utf-8") as file:
                pageData = json.load(file)

            characterList = pageData.get("characterList", [])
            lineList = self._groupCharacterIntoLine(characterList, 3.0)

            pageNumber = int(os.path.splitext(filename)[0])

            svgWidth, svgHeight = self._svgSize(pageNumber)

            overlay = self._overlay(lineList, svgWidth, svgHeight)

            html = self._html(pageNumber, svgWidth, svgHeight, overlay)

            with open(f"{self.pathPage}{pageNumber}.html", "w", encoding="utf-8") as file:
                file.write(html)

    def __init__(self):
        self.pathExecutable = sys.argv[1]
        self.pathInput = sys.argv[2]
        self.textSearch = sys.argv[3]
        self.mode = sys.argv[4]
        self.pathOutput = sys.argv[5]
        self.pathBaseDir = f"{os.path.dirname(os.path.abspath(__file__))}/"
        self.pathAnalyze = f"{self.pathOutput}analyze/"
        self.pathTemplate = f"{self.pathOutput}template/"
        self.pathPage = f"{self.pathOutput}page/"
        self.isDebug = False

        if os.path.isdir(self.pathAnalyze):
            shutil.rmtree(self.pathAnalyze)

        if os.path.isdir(self.pathTemplate):
            shutil.rmtree(self.pathTemplate)

        if os.path.isdir(self.pathPage):
            shutil.rmtree(self.pathPage)
              
        os.makedirs(self.pathOutput, exist_ok=True)
        os.makedirs(self.pathAnalyze, exist_ok=True)
        os.makedirs(self.pathTemplate, exist_ok=True)
        os.makedirs(self.pathPage, exist_ok=True)

tool = Tool()
tool.javascriptAnalyze()
tool.template()
tool.build()
