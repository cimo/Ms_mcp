// Source
import * as helperSrc from "../../HelperSrc.js";
import * as model from "./Model.js";

export const execute = async (mcpSessionId: string, fileNameList: string[]): Promise<model.IdocumentParser> => {
    const pathWorkspace = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`;

    const documentList: model.Idocument[] = [];

    for (let a = 0; a < fileNameList.length; a++) {
        const fileDetail = await helperSrc.fileDetail(fileNameList[a]);

        const pathDirname = await helperSrc.findPathDirnameRecursive(pathWorkspace, fileDetail.name);

        const fileReadStream = await helperSrc.fileReadStream(`${pathDirname}result.md`);

        if (!Buffer.isBuffer(fileReadStream)) {
            helperSrc.writeLog("Parser.ts - execute() - fileReadStream()", fileReadStream.toString());

            return { documentList: [], message: "The file was not found in the workspace, check the name and try again." };
        }

        documentList.push({ fileName: fileDetail.name, markdown: fileReadStream.toString("utf-8") });
    }

    return { documentList, message: "" };
};
