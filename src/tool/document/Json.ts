import mupdf from "mupdf";

// Source
import * as modelDocument from "./Model.js";

export const convert = (file: string): string => {
    const doc = mupdf.Document.openDocument(file);
    const pageCount = doc.countPages();

    const pageList: modelDocument.IjsonDocumentPage[] = [];

    for (let a = 0; a < pageCount; a++) {
        const page = doc.loadPage(a);
        const jsonText = page.toStructuredText("preserve-spans").asJSON();

        pageList.push({
            pageNumber: a + 1,
            content: JSON.parse(jsonText) as modelDocument.IstructuredTextPage
        });
    }

    const documentJson: modelDocument.IjsonDocument = {
        pageCount,
        pageList
    };

    const result = `\`\`\`json\n${JSON.stringify(documentJson, null, 2)}\n\`\`\``;

    return result;
};
