import { parseOffice, OfficeParserAST, HeadingMetadata } from "officeparser";

// Source
import * as helperSrc from "../../HelperSrc.js";

const parse = (fileName: string, sessionId: string): Promise<OfficeParserAST> => {
    return new Promise<OfficeParserAST>((resolve, reject) => {
        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${fileName}`;

        helperSrc.fileReadStream(input, async (resultFileReadStream) => {
            if (Buffer.isBuffer(resultFileReadStream)) {
                helperSrc.fileOrFolderRemove(input, (resultFileRemove) => {
                    if (typeof resultFileRemove !== "boolean") {
                        helperSrc.writeLog("Parse.ts - execute() - fileReadStream() - fileOrFolderRemove(input)", resultFileRemove.toString());
                    }
                });

                const result = await parseOffice(resultFileReadStream, {
                    newlineDelimiter: "\n\n",
                    extractAttachments: false,
                    ocr: false,
                    ocrLanguage: ""
                });

                resolve(result);

                return;
            } else {
                reject("File input not exists.");

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

export const execute = async (fileName: string, format: string, sessionId: string): Promise<string> => {
    let result = "";

    const ast = await parse(fileName, sessionId);

    if (format === "json") {
        result = json(ast);
    } else if (format === "markdown") {
        result = markdown(ast);
    }

    return result;
};
