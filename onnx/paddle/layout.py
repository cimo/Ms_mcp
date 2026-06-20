import sys
sys.dont_write_bytecode = True

import os
import glob
import shutil
import time
import cv2
import numpy
import json

# Source
sys.path.append(f"{os.path.dirname(__file__)}/..")

from helper import onnxSessionBuild

class EngineRealtimeLayout:
	def _drawDebug(self, pageNumber, image, itemList):
		imageCopy = image.copy()

		for item in itemList:
			poly = numpy.array(item["boxList"], dtype=numpy.int32).reshape((-1, 1, 2))

			cv2.polylines(imageCopy, [poly], True, (0, 255, 0), 2)
			cv2.putText(imageCopy, f"{item['label']} {round(item['score'], 3)}", (int(item["boxList"][0][0]), max(8, int(item["boxList"][0][1]) - 4)), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)

		cv2.imwrite(f"{self.pathDebug}{pageNumber}.jpg", imageCopy)

	def _crop(self, pageNumber, image, itemList):
		imageHeight, imageWidth = image.shape[0:2]

		os.makedirs(f"{self.pathCrop}{pageNumber}/", exist_ok=True)

		for indexItem, item in enumerate(itemList, start=1):
			x1 = max(0, min(int(round(item["coordinate"][0])) - self.cropPaddingX, imageWidth))
			y1 = max(0, min(int(round(item["coordinate"][1])) - self.cropPaddingX, imageHeight))
			x2 = max(0, min(int(round(item["coordinate"][2])) + self.cropPaddingY, imageWidth))
			y2 = max(0, min(int(round(item["coordinate"][3])) + self.cropPaddingY, imageHeight))

			if x2 <= x1 or y2 <= y1:
				continue

			cv2.imwrite(f"{self.pathCrop}{pageNumber}/{indexItem}.png", image[y1:y2, x1:x2])

	def _itemContained(self, coordinateA, coordinateB):
		x1 = max(coordinateA[0], coordinateB[0])
		y1 = max(coordinateA[1], coordinateB[1])
		x2 = min(coordinateA[2], coordinateB[2])
		y2 = min(coordinateA[3], coordinateB[3])

		area = max(0.0, coordinateA[2] - coordinateA[0]) * max(0.0, coordinateA[3] - coordinateA[1])
		areaIntersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)

		if area <= 0.0:
			return False

		return areaIntersection / area >= self.levelBoxContained

	def _itemTrimOverlap(self, itemList):
		for indexA, itemA in enumerate(itemList):
			coordinateA = itemA["coordinate"]

			for indexB, itemB in enumerate(itemList):
				if indexA == indexB:
					continue

				coordB = itemB["coordinate"]

				if not (coordinateA[1] < coordB[1] < coordinateA[3]):
					continue

				overlapX = min(coordinateA[2], coordB[2]) - max(coordinateA[0], coordB[0])

				if overlapX <= 0:
					continue

				newY2 = coordB[1]

				itemA["coordinate"] = [coordinateA[0], coordinateA[1], coordinateA[2], newY2]
				itemA["boxList"][2][1] = int(round(newY2))
				itemA["boxList"][3][1] = int(round(newY2))

				coordinateA = itemA["coordinate"]

		return itemList

	def _itemClean(self, itemList):
		if len(itemList) <= 1:
			return itemList

		indexDeleteList = set()

		for indexA, itemA in enumerate(itemList):
			if indexA in indexDeleteList:
				continue

			for indexB, itemB in enumerate(itemList):
				if indexA == indexB or indexB in indexDeleteList:
					continue

				coordinateA = itemA["coordinate"]
				coordinateB = itemB["coordinate"]

				if not self._itemContained(coordinateA, coordinateB):
					continue

				areaA = max(0.0, coordinateA[2] - coordinateA[0]) * max(0.0, coordinateA[3] - coordinateA[1])
				areaB = max(0.0, coordinateB[2] - coordinateB[0]) * max(0.0, coordinateB[3] - coordinateB[1])

				if areaB >= areaA:
					indexDeleteList.add(indexA)

					break

		resultItemList = [item for indexItem, item in enumerate(itemList) if indexItem not in indexDeleteList]
		resultItemList = self._itemTrimOverlap(resultItemList)

		return self._itemSort(resultItemList)

	def _itemSort(self, itemList):
		if len(itemList) <= 1:
			return itemList

		rowList = []

		itemSortedList = sorted(itemList, key=lambda value: value["coordinate"][1])
		currentRow = [itemSortedList[0]]

		for itemSorted in itemSortedList[1:]:
			referenceBox = currentRow[0]
			referenceHeight = referenceBox["coordinate"][3] - referenceBox["coordinate"][1]

			if itemSorted["coordinate"][1] < referenceBox["coordinate"][1] + referenceHeight * 0.5:
				currentRow.append(itemSorted)
			else:
				rowList.append(sorted(currentRow, key=lambda value: value["coordinate"][0]))

				currentRow = [itemSorted]

		rowList.append(sorted(currentRow, key=lambda value: value["coordinate"][0]))

		return [item for row in rowList for item in row]

	def _itemProcess(self, itemRawList, imageShape):
		resultItemList = []

		imageWidth = imageShape[1]
		imageHeight = imageShape[0]
		
		for item in itemRawList:
			classId = int(item[0])
			score = float(item[1])
			x1 = max(0.0, min(float(item[2]), float(imageWidth)))
			y1 = max(0.0, min(float(item[3]), float(imageHeight)))
			x2 = max(0.0, min(float(item[4]), float(imageWidth)))
			y2 = max(0.0, min(float(item[5]), float(imageHeight)))

			if x2 <= x1 or y2 <= y1:
				continue

			label = self.labelList[classId] if classId >= 0 and classId < len(self.labelList) else str(classId)

			resultItemList.append({
				"cls_id": classId,
				"label": label,
				"score": score,
				"coordinate": [x1, y1, x2, y2],
				"boxList": [[int(round(x1)), int(round(y1))], [int(round(x2)), int(round(y1))], [int(round(x2)), int(round(y2))], [int(round(x1)), int(round(y2))]],
			})

		return self._itemSort(resultItemList)

	def _inference(self, imageRgb, session):
		imageHeight, imageWidth = imageRgb.shape[0:2]
		imageResized = cv2.resize(imageRgb, (800, 800), interpolation=cv2.INTER_CUBIC).astype(numpy.float32) / 255.0

		tensor = numpy.expand_dims(imageResized.transpose((2, 0, 1)), axis=0).astype(numpy.float32)
		
		tensorFeed = {"image": tensor}
		tensorFeed["im_shape"] = numpy.array([[800, 800]], dtype=numpy.float32)
		tensorFeed["scale_factor"] = numpy.array([[800 / float(imageHeight), 800 / float(imageWidth)]], dtype=numpy.float32)
		
		tensorOutput = session.run(None, tensorFeed)
		tensorOutputList = tensorOutput[0]
		
		batchBoxCount = int(tensorOutput[1][0]) if len(tensorOutput) > 1 else len(tensorOutputList)
		itemRawList = []

		for value in tensorOutputList[:batchBoxCount]:
			tag = int(value[0])
			score = float(value[1])

			if score < self.scoreThreshold:
				continue

			itemRawList.append([tag, score, float(value[2]), float(value[3]), float(value[4]), float(value[5])])

		itemList = self._itemProcess(itemRawList, imageRgb.shape)
		itemList = self._itemClean(itemList)

		return itemList

	def execute(self):
		timeStart = time.perf_counter()

		cv2.setUseOptimized(True)
		cv2.setNumThreads(1)

		session = onnxSessionBuild(self.pathModel)

		fileNameList = sorted(glob.glob(f"{self.pathInput}*.png"), key=lambda path: int(os.path.splitext(os.path.basename(path))[0]))

		for fileName in fileNameList:
			pageNumber = int(os.path.splitext(os.path.basename(fileName))[0])
			
			image = cv2.imread(fileName)
			imageRgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
			
			itemList = self._inference(imageRgb, session)

			if self.isDebug:
				self._drawDebug(pageNumber, image, itemList)

			self._crop(pageNumber, image, itemList)

			with open(f"{self.pathData}{pageNumber}.json", "w", encoding="utf-8") as file:
				json.dump({
					"imageWidth": int(imageRgb.shape[1]),
					"imageHeight": int(imageRgb.shape[0]),
					"itemList": itemList,
				}, file, ensure_ascii=False, indent=4)
		
		timeEnd = time.perf_counter() - timeStart

		print(f"Time: {round(timeEnd, 3)}\n")

	def __init__(self):
		self.pathModel = sys.argv[1]
		self.pathInput = sys.argv[2]
		self.pathOutput = sys.argv[3]

		self.pathDebug = f"{self.pathOutput}debug/"
		self.pathCrop = f"{self.pathOutput}crop/"
		self.pathData = f"{self.pathOutput}data/"
		
		self.isDebug = False
		self.scoreThreshold = 0.3
		self.levelBoxContained = 0.9
		self.cropPaddingX = 2
		self.cropPaddingY = 10
		self.labelList = [
			"paragraph_title",
			"image",
			"text",
			"number",
			"abstract",
			"content",
			"figure_title",
			"formula",
			"table",
			"reference",
			"doc_title",
			"footnote",
			"header",
			"algorithm",
			"footer",
			"seal",
			"chart",
			"formula_number",
			"aside_text",
			"reference_content",
		]

		if os.path.isdir(self.pathDebug):
			shutil.rmtree(self.pathDebug)

		if os.path.isdir(self.pathCrop):
			shutil.rmtree(self.pathCrop)

		if os.path.isdir(self.pathData):
			shutil.rmtree(self.pathData)

		if self.isDebug:
			os.makedirs(self.pathDebug, exist_ok=True)
		
		os.makedirs(self.pathCrop, exist_ok=True)
		os.makedirs(self.pathData, exist_ok=True)

engineRealtimeLayout = EngineRealtimeLayout()
engineRealtimeLayout.execute()
