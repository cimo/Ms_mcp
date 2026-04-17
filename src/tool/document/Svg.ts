import mupdf, { Font, Page, PDFPage, Point, Quad, Rect } from "mupdf";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelDocument from "./Model.js";
import * as modelRag from "../rag/Model.js";

const namespaceClipId = (svg: string, pageNumber: number): string => {
    let updatedClipId = svg.replace(/id=("|')clip_(\d+)\1/g, (_m, quote: string, id: string) => {
        return `id=${quote}clip_${pageNumber}_${id}${quote}`;
    });

    updatedClipId = updatedClipId.replace(/(#clip_)(\d+)\b/g, (_m, _prefix: string, id: string) => {
        return `#clip_${pageNumber}_${id}`;
    });

    return updatedClipId;
};

const tokenizePhrase = (searchInput: string): string[] => {
    const partList = searchInput.split(/\s+/);
    const tokenList: string[] = [];

    for (let a = 0; a < partList.length; a++) {
        const part = partList[a].trim().toLocaleLowerCase();

        if (part.length > 0) {
            tokenList.push(part);
        }
    }

    return tokenList;
};

const splitWordPart = (wordPart: string): string[] => {
    const token = wordPart.trim().toLocaleLowerCase();

    return token ? [token] : [];
};

const deleteDuplicateRect = (rectList: Rect[]): Rect[] => {
    const seenList: string[] = [];
    const uniqueList: Rect[] = [];

    for (const rect of rectList) {
        const key = `${rect[0].toFixed(2)}|${rect[1].toFixed(2)}|${rect[2].toFixed(2)}|${rect[3].toFixed(2)}`;

        if (seenList.includes(key)) {
            continue;
        }

        seenList.push(key);
        uniqueList.push(rect);
    }

    return uniqueList;
};

const getPageRectItem = (pageRectList: modelDocument.IpageRectList[], pageNumber: number): modelDocument.IpageRectList | null => {
    for (let a = 0; a < pageRectList.length; a++) {
        if (pageRectList[a].pageNumber === pageNumber) {
            return pageRectList[a];
        }
    }

    return null;
};

const isMatchWord = (token: string, wordToken: string, wordPartList: string[]): boolean => {
    if (!token || !wordToken) {
        return false;
    }

    return token === wordToken || wordPartList.includes(token);
};

const rectFromQuad = (quad: Quad): Rect => {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];

    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const quadFromRect = (rect: Rect): Quad => {
    const [x0, y0, x1, y1] = rect;

    return [x0, y1, x1, y1, x0, y0, x1, y0];
};

const mergeRect = (rectOne: Rect, rectTwo: Rect): Rect => {
    return [Math.min(rectOne[0], rectTwo[0]), Math.min(rectOne[1], rectTwo[1]), Math.max(rectOne[2], rectTwo[2]), Math.max(rectOne[3], rectTwo[3])];
};

const rectForToken = (token: string, word: string, wordRect: Rect, wordToken: string): Rect => {
    if (token === wordToken) {
        return wordRect;
    }

    const lowerCaseWord = word.toLocaleLowerCase();

    if (!lowerCaseWord) {
        return wordRect;
    }

    const start = lowerCaseWord.indexOf(token);

    if (start >= 0) {
        const end = start + token.length;
        const width = Math.max(0, wordRect[2] - wordRect[0]);
        const x0 = wordRect[0] + (width * start) / lowerCaseWord.length;
        const x1 = wordRect[0] + (width * end) / lowerCaseWord.length;

        return [x0, wordRect[1], x1, wordRect[3]];
    }

    return wordRect;
};

const flushWord = (wordList: modelDocument.IwordInfo[], pageNumber: number, currentWord: string, currentRect: Rect | null): void => {
    const token = currentWord.trim().toLocaleLowerCase();

    if (token && currentRect) {
        wordList.push({
            pageNumber,
            token,
            wordPartList: splitWordPart(currentWord),
            word: currentWord,
            rect: currentRect
        });
    }
};

const extractPageWordList = (page: Page, pageNumber: number): modelDocument.IwordInfo[] => {
    const structured = page.toStructuredText();
    const wordList: modelDocument.IwordInfo[] = [];

    let currentWord = "";
    let currentRect: Rect | null = null;

    structured.walk({
        onChar(c: string, _origin: Point, _font: Font, _size: number, quad: Quad) {
            if (/\s/.test(c)) {
                flushWord(wordList, pageNumber, currentWord, currentRect);

                currentWord = "";
                currentRect = null;

                return;
            }

            const charRect = rectFromQuad(quad as Quad);
            currentWord += c;
            currentRect = currentRect ? mergeRect(currentRect, charRect) : charRect;
        },
        endLine() {
            flushWord(wordList, pageNumber, currentWord, currentRect);

            currentWord = "";
            currentRect = null;
        },
        endTextBlock() {
            flushWord(wordList, pageNumber, currentWord, currentRect);

            currentWord = "";
            currentRect = null;
        }
    });

    flushWord(wordList, pageNumber, currentWord, currentRect);

    currentWord = "";
    currentRect = null;

    return wordList;
};

const collectPhraseRectList = (pages: Page[], searchInput: string): modelDocument.IpageRectList[] => {
    const phraseTokenList = tokenizePhrase(searchInput);

    if (phraseTokenList.length === 0) {
        return [];
    }

    const globalWordList: modelDocument.IwordInfo[] = [];

    for (let a = 0; a < pages.length; a++) {
        const pageWords = extractPageWordList(pages[a], a);
        globalWordList.push(...pageWords);
    }

    if (globalWordList.length < phraseTokenList.length) {
        return [];
    }

    const pageRectList: modelDocument.IpageRectList[] = [];
    const windowSize = phraseTokenList.length;
    const matchList: number[][] = [];

    for (let a = 0; a <= globalWordList.length - windowSize; a++) {
        let isMatch = true;

        for (let b = 0; b < windowSize; b++) {
            const word = globalWordList[a + b];

            if (!isMatchWord(phraseTokenList[b], word.token, word.wordPartList)) {
                isMatch = false;

                break;
            }
        }

        if (isMatch) {
            const indexList: number[] = [];

            for (let b = 0; b < windowSize; b++) {
                indexList.push(a + b);
            }

            matchList.push(indexList);
        }
    }

    const seenList: string[] = [];

    for (const match of matchList) {
        const key = match.join(",");

        if (seenList.includes(key)) {
            continue;
        }

        seenList.push(key);

        for (let a = 0; a < match.length; a++) {
            const word = globalWordList[match[a]];
            const tokenRect = rectForToken(phraseTokenList[a], word.word, word.rect, word.token);

            let item = getPageRectItem(pageRectList, word.pageNumber);

            if (!item) {
                pageRectList.push({
                    pageNumber: word.pageNumber,
                    rectList: [tokenRect]
                });
            } else {
                item.rectList.push(tokenRect);
            }
        }
    }

    for (let a = 0; a < pageRectList.length; a++) {
        pageRectList[a].rectList = deleteDuplicateRect(pageRectList[a].rectList);
    }

    return pageRectList;
};

const pageToSvgHtml = (page: Page, pageNumber: number): string => {
    const boundRect = page.getBounds();
    const pageWidth = boundRect[2] - boundRect[0];
    const pageHeight = boundRect[3] - boundRect[1];

    const buffer = new mupdf.Buffer();
    const writer = new mupdf.DocumentWriter(buffer, "svg", "text=text");
    const device = writer.beginPage(boundRect);

    page.runPageContents(device, mupdf.Matrix.identity);
    page.runPageAnnots(device, mupdf.Matrix.identity);
    page.runPageWidgets(device, mupdf.Matrix.identity);

    device.close();
    writer.endPage();
    writer.close();

    let svg = buffer.asString();
    svg = namespaceClipId(svg, pageNumber + 1);

    return `<div class="pdf-page" style="width:${pageWidth.toFixed(3)}pt;height:${pageHeight.toFixed(3)}pt;">\n${svg}\n</div>`;
};

export const convert = (inputFolder: string, fileName: string, searchInput: string): modelRag.IapiRag => {
    const baseFileName = helperSrc.baseFileName(fileName);
    const inputPdf = `${inputFolder}${baseFileName}_copy.pdf`;

    const doc = mupdf.Document.openDocument(inputPdf);
    const pageCount = doc.countPages();
    const pageList: Page[] = [];

    for (let a = 0; a < pageCount; a++) {
        pageList.push(doc.loadPage(a));
    }

    const searchText = searchInput.trim();

    let isSearchMatch = false;
    let firstMatchPageIndex: number = 0;

    if (searchText) {
        const phraseTokens = tokenizePhrase(searchText);
        const pageRectsByNumber = phraseTokens.length > 1 ? collectPhraseRectList(pageList, searchText) : [];

        for (let a = 0; a < pageList.length; a++) {
            const currentPage = pageList[a];
            const matchList = currentPage.search(searchText);

            const pdfPage = currentPage.isPDF() ? (currentPage as PDFPage) : null;

            if (pdfPage && matchList.length > 0) {
                isSearchMatch = true;

                if (firstMatchPageIndex === 0) {
                    firstMatchPageIndex = a;
                }

                for (const hit of matchList) {
                    const annot = pdfPage.createAnnotation("Highlight");
                    annot.setQuadPoints(hit as Quad[]);
                    annot.setOpacity(0.25);
                    annot.update();
                }

                pdfPage.update();
            }

            const fallbackPageItem = getPageRectItem(pageRectsByNumber, a);
            const fallbackRects = matchList.length > 0 ? [] : fallbackPageItem ? fallbackPageItem.rectList : [];

            if (pdfPage && fallbackRects.length > 0) {
                isSearchMatch = true;

                if (firstMatchPageIndex === 0) {
                    firstMatchPageIndex = a;
                }

                for (const rect of fallbackRects) {
                    const annot = pdfPage.createAnnotation("Highlight");
                    annot.setQuadPoints([quadFromRect(rect)]);
                    annot.setOpacity(0.25);
                    annot.update();
                }

                pdfPage.update();
            }
        }

        if (!isSearchMatch) {
            firstMatchPageIndex = 1;
        }
    }

    for (let a = 0; a < pageList.length; a++) {
        const page = pageList[a];
        const outputLines: string[] = ["<html>"];

        outputLines.push(`<!-- page ${a + 1} -->`);
        outputLines.push(pageToSvgHtml(page, a));

        outputLines.push("</html>");

        helperSrc.fileWriteStream(`${inputFolder}${baseFileName}_${a + 1}.html`, Buffer.from(outputLines.join("\n")), () => {});
    }

    return { fileName, pageNumber: firstMatchPageIndex + 1 };
};
