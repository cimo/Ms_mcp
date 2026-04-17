import mupdf from "mupdf";

const isHeadingLine = (line: string): boolean => {
    return /^#{1,6}\s/.test(line.trim());
};

const startsWithLowercase = (line: string): boolean => {
    return /^[a-z]/.test(line.trim());
};

const canMergeSplitToken = (left: string, right: string): boolean => {
    const singleTokenRegex = /^\S+$/;
    const specialCharRegex = /^[#\-+|]+$/;
    const punctuationRegex = /[.:!?]$/;

    if (!singleTokenRegex.test(left.trim()) || !singleTokenRegex.test(right.trim())) {
        return false;
    }

    if (specialCharRegex.test(left.trim()) || specialCharRegex.test(right.trim())) {
        return false;
    }

    if (punctuationRegex.test(left.trim())) {
        return false;
    }

    return /[A-Za-z]/.test(left) && /[A-Za-z0-9]/.test(right);
};

const isTableCell = (line: string): boolean => {
    if (!line) {
        return false;
    }

    if (/[.:!?]$/.test(line)) {
        return false;
    }

    return /\d/.test(line);
};

const extractGroupingKey = (line: string): string => {
    const numbered = line.match(/\b(\d+)[A-Za-z]?\b/);

    if (numbered) {
        return `n:${numbered[1]}`;
    }

    const firstWord = line.match(/^([A-Za-z]{2,})\b/);

    if (firstWord) {
        return `w:${firstWord[1].toLocaleLowerCase()}`;
    }

    return "";
};

const normalizeLayout = (text: string): string => {
    const bulletRegex = /^\s*[\u2022\u25CF\u25E6\u25AA\u25AB\uF06C]\s*/u;
    const bulletWithSpaceRegex = /^\s*[\u2022\u25CF\u25E6\u25AA\u25AB\uF06C]\s*$/u;

    const lineList = text.split(/\r?\n/);
    const cleanedList: string[] = [];

    for (const rawLine of lineList) {
        let cleanedLine = rawLine.replace(bulletRegex, "");
        cleanedLine = cleanedLine.replace(/\s+$/g, "");

        if (bulletWithSpaceRegex.test(rawLine)) {
            continue;
        }

        cleanedList.push(cleanedLine);
    }

    const mergedLineList: string[] = [];

    for (let a = 0; a < cleanedList.length; a++) {
        const current = cleanedList[a].trim();

        if (current) {
            let nextIndex = a + 1;
            while (nextIndex < cleanedList.length && !cleanedList[nextIndex].trim()) {
                nextIndex += 1;
            }

            const next = cleanedList[nextIndex]?.trim() ?? "";
            if (canMergeSplitToken(current, next)) {
                mergedLineList.push(`${current} ${next}`);
                a = nextIndex;

                continue;
            }
        }

        mergedLineList.push(cleanedList[a]);
    }

    const cleanedMergeList: string[] = [];
    for (let a = 0; a < mergedLineList.length; a++) {
        const current = mergedLineList[a].trim();

        if (current) {
            cleanedMergeList.push(mergedLineList[a]);

            continue;
        }

        let nextIndex = a + 1;
        while (nextIndex < mergedLineList.length && !mergedLineList[nextIndex].trim()) {
            nextIndex += 1;
        }

        const prev = cleanedMergeList.length > 0 ? cleanedMergeList[cleanedMergeList.length - 1].trim() : "";
        const next = nextIndex < mergedLineList.length ? mergedLineList[nextIndex].trim() : "";

        if (isTableCell(prev) && isTableCell(next)) {
            continue;
        }

        cleanedMergeList.push(mergedLineList[a]);
    }

    const joinedList: string[] = [];

    for (let a = 0; a < cleanedMergeList.length; a++) {
        const current = cleanedMergeList[a].trim();

        if (current) {
            joinedList.push(cleanedMergeList[a]);

            continue;
        }

        let nextIndex = a + 1;
        while (nextIndex < cleanedMergeList.length && !cleanedMergeList[nextIndex].trim()) {
            nextIndex += 1;
        }

        const prev = joinedList.length > 0 ? joinedList[joinedList.length - 1].trim() : "";
        const nextLine = nextIndex < cleanedMergeList.length ? cleanedMergeList[nextIndex].trim() : "";
        const shouldJoinAcrossBlank =
            prev.length > 0 &&
            nextLine.length > 0 &&
            !isHeadingLine(prev) &&
            !isHeadingLine(nextLine) &&
            !isTableCell(prev) &&
            !isTableCell(nextLine) &&
            !/[.:!?]$/.test(prev) &&
            startsWithLowercase(nextLine);

        if (!shouldJoinAcrossBlank) {
            joinedList.push("");
        }
    }

    const outputList: string[] = [];
    let index = 0;

    while (index < joinedList.length) {
        if (!joinedList[index].trim()) {
            outputList.push("");
            index += 1;

            continue;
        }

        const block: string[] = [];
        while (index < joinedList.length && joinedList[index].trim()) {
            block.push(joinedList[index].trim());
            index += 1;
        }

        if (block.length === 1) {
            outputList.push(block[0]);

            continue;
        }

        if (block.every((line) => isTableCell(line))) {
            const groupedRowList: string[] = [];

            for (let a = 0; a < block.length; ) {
                const current = block[a];
                const groupKey = extractGroupingKey(current);

                if (groupKey === "") {
                    groupedRowList.push(current);
                    a += 1;

                    continue;
                }

                const rowCellList: string[] = [];

                while (a < block.length) {
                    const line = block[a];

                    if (extractGroupingKey(line) !== groupKey) {
                        break;
                    }

                    rowCellList.push(line);
                    a += 1;
                }

                groupedRowList.push(rowCellList.join(" "));
            }

            outputList.push(...groupedRowList);

            continue;
        }

        if (/^#{1,6}\s/.test(block[0])) {
            outputList.push(...block);

            continue;
        }

        let paragraph = block[0];

        for (let a = 1; a < block.length; a++) {
            paragraph += ` ${block[a]}`;
        }

        outputList.push(paragraph);
    }

    return outputList
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

const extractTextFromPdf = (inputPdf: string): string => {
    const doc = mupdf.Document.openDocument(inputPdf);
    const pageCount = doc.countPages();
    const partList: string[] = [];

    for (let a = 0; a < pageCount; a++) {
        const page = doc.loadPage(a);
        const structured = page.toStructuredText("segment,table-hunt,preserve-whitespace,preserve-spans");

        partList.push(structured.asText());
    }

    return partList.join("\n");
};

export const convert = (inputPdf: string): string => {
    const extractedText = extractTextFromPdf(inputPdf);
    const structuredText = normalizeLayout(extractedText);

    return structuredText;
};
