import Fs from "fs";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelDocument from "./Model.js";

const login = async (): Promise<string> => {
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

const convertToPdf = (inputFolder: string, fileName: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const fileDetail = helperSrc.fileDetail(fileName);

        if (fileDetail.extension !== "pdf") {
            helperSrc.fileReadStream(`${inputFolder}${fileDetail.fileName}`).then((resultFileReadStream) => {
                if (Buffer.isBuffer(resultFileReadStream)) {
                    const buffer = Buffer.from(resultFileReadStream);
                    const blob = new Blob([buffer], { type: fileDetail.mimeType });

                    const formData = new FormData();
                    formData.append("file", blob, fileDetail.fileName);

                    instance.api
                        .post<modelHelperSrc.IresponseBody>("/api/toPdf", {}, formData)
                        .then((resultApi) => {
                            const stdout = resultApi.data.response.stdout;

                            helperSrc.fileWriteStream(`${inputFolder}converted.pdf`, Buffer.from(stdout, "base64")).then((resultFileWriteStream) => {
                                if (typeof resultFileWriteStream === "boolean" && resultFileWriteStream) {
                                    resolve(true);

                                    return;
                                } else {
                                    helperSrc.writeLog(
                                        `Parser.ts - convertToPdf() - api(/toPdf) - fileWriteStream()`,
                                        resultFileWriteStream.toString()
                                    );

                                    reject(new Error(`fileWriteStream failed: ${resultFileWriteStream.toString()}`));

                                    return;
                                }
                            });
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Parser.ts - convertToPdf() - api(/toPdf) - catch()", error.message);

                            reject(new Error(error.message));

                            return;
                        });
                } else {
                    helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, resultFileReadStream.toString());

                    reject(new Error(`fileReadStream failed: ${resultFileReadStream.toString()}`));

                    return;
                }
            });
        } else {
            Fs.copyFile(`${inputFolder}${fileName}`, `${inputFolder}converted.pdf`, (error) => {
                if (error) {
                    helperSrc.writeLog(`Parser.ts - convertToPdf() - copyFile()`, error.message);

                    reject(new Error(error.message));

                    return;
                }

                resolve(true);

                return;
            });
        }
    });
};

const logout = async (): Promise<string> => {
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

        await login();

        const fileDetail = helperSrc.fileDetail(fileName);

        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        await convertToPdf(inputFolder, fileName);

        let resultExecute = await helperSrc.executionTerminal(
            `python3 "${helperSrc.PATH_ROOT}muPdf/parser.py" "${helperSrc.PATH_ROOT}muPdf/mutool" "${inputFolder}converted.pdf" "${inputFolder}" "${searchInput}" "wholeWord,caseSensitive,both" >> "${helperSrc.PATH_LOG}muPdf_parser.log" 2>&1`
        );

        if (!resultExecute.error) {
            resultExecute = await helperSrc.executionTerminal(
                `python3 "${helperSrc.PATH_ROOT}paddle/layout.py" "${helperSrc.PATH_ROOT}paddle/pp-doclayout_plus-l.inference.onnx" "${inputFolder}image/" "${inputFolder}layout/" >> "${helperSrc.PATH_LOG}paddle_layout.log" 2>&1`
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

        await logout();

        return JSON.stringify(resultObject);
    });
};
