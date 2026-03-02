// Source
import * as model from "./Model.js";

const splitParagraph = (text: string): string[] => {
    return text
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
};

const splitSentence = (text: string): string[] => {
    return text
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[\p{STerm}…]+(?:[\p{Pe}\p{Pf}"']+)?)/u)
        .filter(Boolean);
};

const flush = (buffer: string[], overlap: number, chunkList: string[]): string[] => {
    if (!buffer.length) {
        return buffer;
    }

    chunkList.push(buffer.join(" ").trim());
    buffer = buffer.slice(-overlap);

    return buffer;
};

export const chunkList = (text: string, options: model.TsemanticChunkOption): string[] => {
    const maxChars = options.maxChars;
    const overlap = options.overlapSentences ?? 2;

    const chunkList: string[] = [];

    let buffer: string[] = [];
    let bufferLen = 0;

    for (const paragraph of splitParagraph(text)) {
        for (const sentence of splitSentence(paragraph)) {
            if (sentence.length > maxChars) {
                buffer = flush(buffer, overlap, chunkList);
                bufferLen = buffer.join(" ").length;

                for (let a = 0; a < sentence.length; a += maxChars) {
                    chunkList.push(sentence.slice(a, a + maxChars).trim());
                }

                continue;
            }

            const extra = (buffer.length ? 1 : 0) + sentence.length;
            if (bufferLen + extra > maxChars) {
                buffer = flush(buffer, overlap, chunkList);
                bufferLen = buffer.join(" ").length;
            }

            buffer.push(sentence);
            bufferLen += extra;
        }

        buffer = flush(buffer, overlap, chunkList);
        bufferLen = buffer.join(" ").length;
    }

    if (buffer.length) {
        chunkList.push(buffer.join(" ").trim());
    }

    return chunkList;
};
