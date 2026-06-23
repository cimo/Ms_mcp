// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelDocument from "./Model.js";

const apiLogin = async (): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const apiToPdf = async (formData: FormData): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>("/api/toPdf", {}, formData)
        .then((resultApi) => {
            const data = resultApi.data;

            return data.response.stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - convertToPdf() - api(/toPdf) - catch()", error.message);

            return "ko";
        });
};

const apiLogout = async (): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, fileName: string, searchInput: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let resultObject = {} as modelDocument.Iparser;

        await apiLogin();

        const fileDetail = helperSrc.fileDetail(fileName);

        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        if (fileDetail.extension !== "pdf") {
            const resultFileReadStream = await helperSrc.fileReadStream(`${inputFolder}${fileDetail.fileName}`);

            if (Buffer.isBuffer(resultFileReadStream)) {
                const buffer = Buffer.from(resultFileReadStream);
                const blob = new Blob([buffer], { type: fileDetail.mimeType });

                const formData = new FormData();
                formData.append("file", blob, fileDetail.fileName);

                const stdout = await apiToPdf(formData);

                if (stdout !== "ko") {
                    await helperSrc.fileWriteStream(`${inputFolder}converted.pdf`, Buffer.from(stdout, "base64"));
                }
            } else {
                helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, resultFileReadStream.toString());
            }
        } else {
            const resultFileReadStream = await helperSrc.fileReadStream(`${inputFolder}${fileName}`);

            if (Buffer.isBuffer(resultFileReadStream)) {
                await helperSrc.fileWriteStream(`${inputFolder}converted.pdf`, resultFileReadStream);
            } else {
                helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, resultFileReadStream.toString());
            }
        }

        let resultExecute = await helperSrc.executionTerminal(
            `python3 "${helperSrc.PATH_ROOT}muPdf/parser.py" "${helperSrc.PATH_ROOT}muPdf/mutool" "${inputFolder}converted.pdf" "${inputFolder}" "${searchInput}" "wholeWord,caseSensitive,both" >> "${helperSrc.PATH_LOG}muPdf_parser.log" 2>&1`
        );

        if (!resultExecute.error) {
            resultExecute = await helperSrc.executionTerminal(
                `python3 "${helperSrc.PATH_ROOT}onnx/paddle/layout.py" "${helperSrc.PATH_ROOT}onnx/paddle/model/pp-docLayout_plus-l.onnx" "${inputFolder}image/" "${inputFolder}layout/" >> "${helperSrc.PATH_LOG}paddle_layout.log" 2>&1`
            );
        }

        if (!resultExecute.error) {
            resultExecute = await helperSrc.executionTerminal(
                `python3 "${helperSrc.PATH_ROOT}muPdf/markdown.py" "${inputFolder}layout/data/" "${inputFolder}cleaned.pdf" "${inputFolder}" >> "${helperSrc.PATH_LOG}muPdf_markdown.log" 2>&1`
            );
        }

        if (!resultExecute.error) {
            resultObject = {
                fileName,
                resultExecute: resultExecute.stdout
            };
        } else {
            helperSrc.writeLog("Parser.ts - execute() - Error", resultExecute.error.message);
        }

        await apiLogout();

        return JSON.stringify(resultObject);
    });
};
