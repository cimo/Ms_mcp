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

        const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        if (fileDetail.extension !== "pdf") {
            const fileReadStream = await helperSrc.fileReadStream(`${pathDocument}${fileDetail.fileName}`);

            if (Buffer.isBuffer(fileReadStream)) {
                const buffer = Buffer.from(fileReadStream);
                const blob = new Blob([buffer], { type: fileDetail.mimeType });

                const formData = new FormData();
                formData.append("file", blob, fileDetail.fileName);

                const stdout = await apiToPdf(formData);

                if (stdout !== "ko") {
                    await helperSrc.fileWriteStream(`${pathDocument}converted.pdf`, Buffer.from(stdout, "base64"));
                }
            } else {
                helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, fileReadStream.toString());
            }
        } else {
            const fileReadStream = await helperSrc.fileReadStream(`${pathDocument}${fileName}`);

            if (Buffer.isBuffer(fileReadStream)) {
                await helperSrc.fileWriteStream(`${pathDocument}converted.pdf`, fileReadStream);
            } else {
                helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, fileReadStream.toString());
            }
        }

        let execute = await helperSrc.executionTerminal(
            `python3 "${helperSrc.PATH_ROOT}muPdf/parser.py" "${helperSrc.PATH_ROOT}muPdf/mutool" "${pathDocument}converted.pdf" "${pathDocument}" "${searchInput}" "wholeWord,caseSensitive,both" >> "${helperSrc.PATH_LOG}muPdf_parser.log" 2>&1`
        );

        if (!execute.error) {
            execute = await helperSrc.executionTerminal(
                `python3 "${helperSrc.PATH_ROOT}onnx/paddle/layout.py" "${helperSrc.PATH_ROOT}onnx/paddle/model/pp-docLayout_plus-l.onnx" "${pathDocument}image/" "${pathDocument}layout/" >> "${helperSrc.PATH_LOG}paddle_layout.log" 2>&1`
            );
        }

        if (!execute.error) {
            execute = await helperSrc.executionTerminal(
                `python3 "${helperSrc.PATH_ROOT}muPdf/markdown.py" "${pathDocument}layout/data/" "${pathDocument}cleaned.pdf" "${pathDocument}" >> "${helperSrc.PATH_LOG}muPdf_markdown.log" 2>&1`
            );
        }

        if (!execute.error) {
            resultObject = {
                fileName,
                searchInput
            };
        } else {
            helperSrc.writeLog("Parser.ts - execute() - Error", execute.error.message);
        }

        await apiLogout();

        return JSON.stringify(resultObject);
    });
};
