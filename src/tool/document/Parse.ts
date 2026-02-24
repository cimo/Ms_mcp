import { parseOffice } from "officeparser";

// Source
import * as helperSrc from "../../HelperSrc.js";

export const execute = (fileName: string): Promise<string> => {
    return new Promise<string>((resolve) => {
        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${fileName}`;

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

                resolve(JSON.stringify(result));

                return;
            }
        });
    });
};
