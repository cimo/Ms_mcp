// Source
import * as helperSrc from "../../HelperSrc.js";

export const execute = async (mcpSessionId: string, fileName: string): Promise<string> => {
    const pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

    const fileDetail = await helperSrc.fileDetail(fileName);

    const pathDirname = await helperSrc.findPathDirnameRecursive(pathWorkspace, fileDetail.name);

    const fileReadStream = await helperSrc.fileReadStream(`${pathDirname}result.md`);

    if (!Buffer.isBuffer(fileReadStream)) {
        helperSrc.writeLog("Parser.ts - execute() - fileReadStream()", fileReadStream.toString());

        return "The file was not found in the workspace, check the name and try again.";
    }

    return fileReadStream.toString("utf-8");
};
