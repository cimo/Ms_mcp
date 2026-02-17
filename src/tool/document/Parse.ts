import { OfficeParserAST, parseOffice } from "officeparser";

// Source
import * as helperSrc from "../../HelperSrc.js";

export const execute = async (fileName: string): Promise<OfficeParserAST> => {
    return new Promise<OfficeParserAST>((resolve) => {
        const input = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${fileName}`;

        helperSrc.fileReadStream(input, async (resultFileReadStream) => {
            if (Buffer.isBuffer(resultFileReadStream)) {
                const result = await parseOffice(resultFileReadStream, {
                    extractAttachments: true
                });

                helperSrc.fileOrFolderRemove(input, (resultFileRemove) => {
                    if (typeof resultFileRemove !== "boolean") {
                        helperSrc.writeLog("Parse.ts - execute() - fileReadStream() - fileOrFolderRemove(input)", resultFileRemove.toString());
                    }
                });

                resolve(result);
            }
        });
    });
};
