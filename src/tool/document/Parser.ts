import Fs from "fs";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelDocument from "./Model.js";

const login = async (): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            result = JSON.stringify(resultApi.data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - login() - api(/login) - catch()", error.message);

            result = "ko";
        });

    return result;
};

const convertToPdf = async (inputFolder: string, fileName: string): Promise<boolean> => {
    return new Promise<boolean>(async (resolve) => {
        const baseFileName = helperSrc.baseFileName(fileName);

        if (!fileName.toLowerCase().endsWith(".pdf")) {
            helperSrc.fileReadStream(`${inputFolder}${fileName}`, async (resultFileReadStream) => {
                if (Buffer.isBuffer(resultFileReadStream)) {
                    const buffer = Buffer.from(resultFileReadStream);
                    const mimeType = helperSrc.readMimeType(buffer);
                    const blob = new Blob([buffer], { type: mimeType.content });

                    const formData = new FormData();
                    formData.append("file", blob, `${fileName}`);

                    await instance.api
                        .post<modelHelperSrc.IresponseBody>("/api/toPdf", {}, formData)
                        .then((resultApi) => {
                            const baseFileName = helperSrc.baseFileName(fileName);

                            helperSrc.fileWriteStream(
                                `${inputFolder}${baseFileName}_copy.pdf`,
                                Buffer.from(resultApi.data.response.stdout, "base64"),
                                (resultFileWriteStream) => {
                                    if (typeof resultFileWriteStream === "boolean" && resultFileWriteStream) {
                                        resolve(true);
                                    } else {
                                        helperSrc.writeLog(
                                            `Parser.ts - convertToPdf() - api(/toPdf) - fileWriteStream()`,
                                            resultFileWriteStream.toString()
                                        );

                                        resolve(false);
                                    }
                                }
                            );
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Parser.ts - convertToPdf() - api(/toPdf) - catch()", error.message);

                            resolve(false);
                        });
                } else {
                    helperSrc.writeLog(`Parser.ts - convertToPdf() - fileReadStream()`, resultFileReadStream.toString());

                    resolve(false);
                }
            });
        } else {
            Fs.copyFile(`${inputFolder}${fileName}`, `${inputFolder}${baseFileName}_copy.pdf`, (error) => {
                if (error) {
                    helperSrc.writeLog(`Parser.ts - convertToPdf() - copyFile()`, error.message);

                    resolve(false);

                    return;
                }

                resolve(true);
            });
        }
    });
};

const logout = async (): Promise<string> => {
    let result = "";

    await instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            result = JSON.stringify(resultApi.data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - logout() - api(/logout) - catch()", error.message);

            result = "ko";
        });

    return result;
};

export const execute = async (sessionId: string, fileName: string, searchInput: string): Promise<modelDocument.Iparser> => {
    return await instance.runWithContext(async () => {
        let result = {} as modelDocument.Iparser;

        await login();

        const baseFileName = helperSrc.baseFileName(fileName);
        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

        const resultConvert = await convertToPdf(inputFolder, fileName);

        if (resultConvert) {
            const resultExec = await helperSrc.terminalExecution(
                `python3 "${helperSrc.PATH_ROOT}muPdf/tool.py" "${helperSrc.PATH_ROOT}muPdf/mutool" "${inputFolder}${baseFileName}_copy.pdf" "${searchInput}" "horizontal" "${inputFolder}"`
            );

            if (typeof resultExec !== "string") {
                helperSrc.writeLog("Parser.ts - execute() - terminalExecution() - ExecException", resultExec);
            } else {
                result = {
                    fileName,
                    terminalExecution: resultExec
                };
            }
        }

        await logout();

        return result;
    });
};
