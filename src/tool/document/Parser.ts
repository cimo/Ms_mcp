import { parseOffice, OfficeParserAST, HeadingMetadata, OfficeContentNode } from "officeparser";

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
    const resultList: string[] = [];

    for (const node of ast.content) {
        if (node.type === "heading") {
            const metadata = node.metadata as HeadingMetadata;
            resultList.push(`${"#".repeat(metadata.level ?? 1)} ${node.text}`);

            continue;
        }

        if (node.type === "list") {
            resultList.push(`- ${node.text}`);

            continue;
        }

        if (node.type === "table") {
            if (node.children && node.children.length > 0) {
                const rowList: string[] = [];

                if (node.children[0].children) {
                    const headerList: string[] = [];
                    const separatorList: string[] = [];

                    for (const headerCell of node.children[0].children) {
                        headerList.push(` ${headerCell.text ?? ""} `);
                        separatorList.push(" --- ");
                    }

                    rowList.push(`|${headerList.join("|")}|`);
                    rowList.push(`|${separatorList.join("|")}|`);
                }

                for (let a = 1; a < node.children.length; a++) {
                    const bodyList: string[] = [];
                    const childList = node.children[a].children;

                    if (childList) {
                        for (const childCell of childList) {
                            bodyList.push(` ${childCell.text ?? ""} `);
                        }
                    }

                    rowList.push(`|${bodyList.join("|")}|`);
                }

                resultList.push(rowList.join("\n"));
            } else {
                resultList.push("[Empty Table]");
            }

            continue;
        }

        if (node.text) {
            resultList.push(node.text);
        }
    }

    const result = resultList.join("\n\n");

    return result;
};

const convertChildren = (node: OfficeContentNode, tag: string = ""): string => {
    const htmlList: string[] = [];

    if (node.children) {
        for (const child of node.children) {
            let childHtml = "";

            if (tag === "") {
                childHtml = nodeToHtml(child);
            } else {
                childHtml = `<${tag}>${nodeToHtml(child)}</${tag}>`;
            }

            htmlList.push(childHtml);
        }
    }

    return htmlList.join("\n");
};

const nodeToHtml = (node: OfficeContentNode): string => {
    let html = "";

    switch (node.type) {
        case "paragraph":
            const text = convertChildren(node);
            html = `<p>${text ? text : ""}</p>`;

            break;
        case "text":
            html = node.text ? node.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

            break;
        case "table":
            html = `<table>${convertChildren(node)}</table>`;

            break;
        case "row":
            html = `<tr>${convertChildren(node)}</tr>`;

            break;
        case "cell":
            html = `<td>${convertChildren(node)}</td>`;

            break;
        case "list":
            html = `<ul>${convertChildren(node, "li")}</ul>`;

            break;
        default:
            html = node.children ? convertChildren(node) : "";

            break;
    }

    return html;
};

const html = (ast: OfficeParserAST): string => {
    const htmlList: string[] = [];

    for (const node of ast.content) {
        htmlList.push(nodeToHtml(node));
    }

    return `<html>${htmlList.join("\n")}</html>`;
};

export const execute = async (sessionId: string, fileName: string, format: string): Promise<string> => {
    let result = "";

    const ast = await parser(sessionId, fileName);

    if (format === "json") {
        result = json(ast);
    } else if (format === "markdown") {
        result = markdown(ast);
    } else if (format === "html") {
        result = html(ast);
    }

    return result;
};
