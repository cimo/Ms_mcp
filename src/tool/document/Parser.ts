import { parseOffice, OfficeParserAST, HeadingMetadata } from "officeparser";

// Source
import * as helperSrc from "../../HelperSrc.js";

const parser = (sessionId: string, fileName: string): Promise<OfficeParserAST> => {
    return new Promise<OfficeParserAST>((resolve, reject) => {
        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${fileName}`;

        helperSrc.fileReadStream(input, async (resultFileReadStream) => {
            if (Buffer.isBuffer(resultFileReadStream)) {
                const result = await parseOffice(resultFileReadStream, {
                    newlineDelimiter: "\n",
                    ignoreNotes: false,
                    extractAttachments: false,
                    ocr: false,
                    ocrLanguage: ""
                });

                resolve(result);

                return;
            } else {
                reject(new Error("File read failed."));

                return;
            }
        });
    });
};

const json = (ast: OfficeParserAST): string => {
    return JSON.stringify(ast);
};

const markdown = (ast: OfficeParserAST): string => {
    let resultParts: string[] = [];

    for (const node of ast.content) {
        if (node.type === "heading") {
            const metadata = node.metadata as HeadingMetadata;
            resultParts.push(`${"#".repeat(metadata.level ?? 1)} ${node.text}`);

            continue;
        }

        if (node.type === "list") {
            resultParts.push(`- ${node.text}`);

            continue;
        }

        if (node.type === "table") {
            resultParts.push("[Table Data]");

            continue;
        }

        if (node.text) {
            resultParts.push(node.text);
        }
    }

    const result = resultParts.join("\n\n");

    return result;
};

export const execute = async (sessionId: string, fileName: string, format: string): Promise<string> => {
    let result = "";

    const ast = await parser(sessionId, fileName);

    if (format === "json") {
        result = json(ast);
    } else if (format === "markdown") {
        result = markdown(ast);
    }

    return result;
};
