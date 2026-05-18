import sys
sys.dont_write_bytecode = True

import os
import shutil
import time
import re
import json
import base64

import pymupdf

class Markdown:
	def _drawDebug(self, page, pageNumber, index, label, rectangle):
		pixmap = page.get_pixmap(clip=rectangle, alpha=False)

		labelStrip = re.sub(r"[^a-zA-Z0-9_\-]+", "_", label).strip("_") or "block"
		
		pixmap.save(f"{self.pathDebug}{pageNumber}_{index}_{labelStrip}.png")
	
	def _wordJoinContinuation(self, entry, line):
		if not entry or not line:
			return entry + line

		if re.match(r"^[a-z]+://", line):
			return entry + line

		httpIndexLast = entry.rfind("://")

		if httpIndexLast >= 0:
			httpAfter = entry[httpIndexLast:]

			if " " not in httpAfter:
				return entry + line

		characterLast = entry[-1]

		if characterLast in "/-_=?&#%~+–—":
			return entry + line

		return entry + " " + line

	def _listFormat(self, text):
		resultEntryList = []

		lineList = [line.strip() for line in text.split("\n") if line.strip()]
		
		currentEntry = None

		for line in lineList:
			if self.listMarker.match(line):
				if currentEntry is not None and currentEntry[-1] in "–—":
					currentEntry = self._wordJoinContinuation(currentEntry, line)
				else:
					if currentEntry is not None:
						resultEntryList.append(currentEntry)
					
					currentEntry = line
			elif currentEntry is not None:
				currentEntry = self._wordJoinContinuation(currentEntry, line)

		if currentEntry is not None:
			resultEntryList.append(currentEntry)

		return "\n".join(resultEntryList)

	def _isBlockList(self, text):
		lineList = [line.strip() for line in text.split("\n") if line.strip()]

		if len(lineList) < 2:
			return False

		return sum(1 for line in lineList if self.listMarker.match(line)) >= 2

	def _textNormalize(self, text):
		return re.sub(r"\s+", " ", text).strip()
	
	def _block(self, label, text):
		if not text:
			return ""

		if label == "header":
			return f"## {self._textNormalize(text)}"

		if label == "paragraph_title":
			return f"### {self._textNormalize(text)}"

		if self._isBlockList(text):
			return self._listFormat(text)

		return self._textNormalize(text)

	def _text(self, page, rectangle):
		resultLineList = []

		wordList = page.get_text("words", clip=rectangle, sort=True)

		if not wordList:
			return self._textNormalize(page.get_text("text", clip=rectangle, sort=True))

		wordList = [word for word in wordList if len(word) >= 8 and str(word[4]).strip()]
		wordList.sort(key=lambda word: (float(word[1]), float(word[0])))

		if not wordList:
			return ""

		heightList = [float(word[3]) - float(word[1]) for word in wordList if float(word[3]) - float(word[1]) > 0]
		toleranceY = max(2.0, (sorted(heightList)[len(heightList) // 2] if heightList else 8.0) * 0.6)

		lineList = []
		currentLine = [wordList[0]]

		for word in wordList[1:]:
			if abs(float(word[1]) - float(currentLine[0][1])) <= toleranceY:
				currentLine.append(word)
			else:
				lineList.append(currentLine)
				currentLine = [word]

		lineList.append(currentLine)

		for lineWord in lineList:
			lineWord.sort(key=lambda word: float(word[0]))
			lineText = " ".join(str(word[4]) for word in lineWord)

			if lineText:
				resultLineList.append(lineText)

		return "\n".join(resultLineList)

	def _layoutRectangle(self, coordinate, pageRectangle, layoutWidth, layoutHeight):
		scaleX = float(pageRectangle.width) / float(layoutWidth)
		scaleY = float(pageRectangle.height) / float(layoutHeight)

		resultRectangle = pymupdf.Rect(
			float(coordinate[0]) * scaleX,
			float(coordinate[1]) * scaleY,
			float(coordinate[2]) * scaleX,
			float(coordinate[3]) * scaleY,
		)

		resultRectangle.x1 = min(float(pageRectangle.x1), resultRectangle.x1 + self.cropPaddingRightBottom)
		resultRectangle.y1 = min(float(pageRectangle.y1), resultRectangle.y1 + self.cropPaddingRightBottom)

		return resultRectangle

	def _layoutRead(self, pageNumber):
		with open(f"{self.pathLayout}{pageNumber}.json", "r", encoding="utf-8") as file:
			data = json.load(file)

		itemList = data.get("itemList")
		itemList.sort(key=lambda item: (item["coordinate"][1], item["coordinate"][0]))

		isChanged = True

		while isChanged:
			isChanged = False

			for a in range(len(itemList) - 1):
				itemCurrent = itemList[a]
				itemNext = itemList[a + 1]

				centerCurrentX = (itemCurrent["coordinate"][0] + itemCurrent["coordinate"][2]) / 2
				centerNextX = (itemNext["coordinate"][0] + itemNext["coordinate"][2]) / 2

				if centerCurrentX <= centerNextX:
					continue

				overlapY = min(itemCurrent["coordinate"][3], itemNext["coordinate"][3]) - max(itemCurrent["coordinate"][1], itemNext["coordinate"][1])

				if overlapY > 0:
					itemList[a], itemList[a + 1] = itemList[a + 1], itemList[a]

					isChanged = True

		return data, itemList

	def _imageBase64(self, page, rectangle):
		pixmap = page.get_pixmap(clip=rectangle, alpha=False)

		return base64.b64encode(pixmap.tobytes("png")).decode("utf-8")

	def _page(self, page, pageNumber):
		data, itemList = self._layoutRead(pageNumber)

		pageRectangle = page.rect

		layoutWidth = int(data["imageWidth"])
		layoutHeight = int(data["imageHeight"])

		blockList = []
		sideContentList = []
		pendingImage = None

		for indexItem, item in enumerate(itemList, start=1):
			label = item.get("label")
			coordinate = item.get("coordinate")

			if len(coordinate) != 4:
				continue

			rectangle = self._layoutRectangle(coordinate, pageRectangle, layoutWidth, layoutHeight)

			if label in self.labelPrimary:
				text = self._text(page, rectangle)
				block = self._block(label, text).strip()

				if not block:
					continue

				if blockList and blockList[-1] == block:
					continue

				blockList.append(block)

				if self.isDebug:
					self._drawDebug(page, pageNumber, indexItem, label, rectangle)

			elif label == "image":
				if pendingImage is not None:
					sideContentList.append({"image": {"figure": pendingImage, "text": ""}})

				pendingImage = self._imageBase64(page, rectangle) if self.isDetailed else ""

			elif label == "figure_title":
				if pendingImage is not None:
					sideContentList.append({"image": {"figure": pendingImage, "text": self._text(page, rectangle)}})

					pendingImage = None

			elif label == "table":
				sideContentList.append({"table": {"text": self._text(page, rectangle) if self.isDetailed else ""}})

		if pendingImage is not None:
			sideContentList.append({"image": {"figure": pendingImage, "text": ""}})

		return "\n\n".join(blockList).strip(), sideContentList

	def execute(self):
		timeStart = time.perf_counter()

		blockList = []
		sideContentObject = {}

		document = pymupdf.open(self.pathInput)

		for index in range(document.page_count):
			block, sideContentList = self._page(document[index], index + 1)

			if block:
				blockList.append(block)

			if sideContentList:
				sideContentObject[index + 1] = sideContentList

		document.close()

		partList = ["\n\n".join(blockList).strip()]

		if sideContentObject:
			sideLineList = [f"---  \nSIDE CONTENT:"]

			for pageNumber, sideContentList in sorted(sideContentObject.items()):
				sideLineList.append(f"\n- Page {pageNumber}:")

				entryLineList = []

				for entry in sideContentList:
					if "image" in entry:
						text = entry["image"]["text"]

						if self.isDetailed:
							figure = entry["image"]["figure"]

							entryLineList.append(f"\n  Figure:  \n  ![{text}](data:image/png;base64,{figure})  \n  Title: \"{text}\"")
						else:
							entryLineList.append(f"\n  Figure: [image]  \n  Title: \"{text}\"")
					elif "table" in entry:
						if self.isDetailed:
							tableText = "\n  ".join(entry['table']['text'].split("\n"))
							entryLineList.append(f"\n  Table:  \n  {tableText}")
						else:
							entryLineList.append(f"\n  Table: [table]")

				sideLineList.append("\n\n".join(entryLineList))

			partList.append("\n".join(sideLineList))

		with open(f"{self.pathOutput}result.md", "w", encoding="utf-8") as file:
			file.write("\n\n".join(partList) + "\n")

		timeEnd = time.perf_counter() - timeStart

		print(f"Time: {round(timeEnd, 3)}\n")

	def __init__(self):
		self.pathLayout = sys.argv[1]
		self.pathInput = sys.argv[2]
		self.pathOutput = sys.argv[3]
		
		self.pathDebug = f"{self.pathOutput}debug/"

		self.isDebug = False
		self.isDetailed = False
		self.cropPaddingRightBottom = 2.0
		self.listMarker = re.compile(r"^[•·‣⁃◦▪▸►●○◎✓✗→]\s|^\d+[\.\)]\s|^[a-z]\.\s")
		self.labelPrimary = {
			"paragraph_title",
			"text",
			"reference",
			"header"
		}

		if os.path.isdir(self.pathDebug):
			shutil.rmtree(self.pathDebug)

		if self.isDebug:
			os.makedirs(self.pathDebug, exist_ok=True)

markdown = Markdown()
markdown.execute()
