import Fs from "fs";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelRag from "../rag/Model.js";
import * as json from "./Json.js";
import * as markdown from "./Markdown.js";
import * as svg from "./Svg.js";

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
    return new Promise<boolean>(async (resolve, reject) => {
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
                            helperSrc.fileWriteStream(
                                `${inputFolder}${baseFileName}_copy.pdf`,
                                Buffer.from(resultApi.data.response.stdout, "base64"),
                                () => {
                                    resolve(true);

                                    return;
                                }
                            );
                        })
                        .catch((error: Error) => {
                            helperSrc.writeLog("Parser.ts - convertToPdf() - api(/toPdf) - catch()", error.message);

                            reject(new Error(error.message));

                            return;
                        });
                } else {
                    reject(new Error("File read failed."));

                    return;
                }
            });
        } else {
            Fs.copyFile(`${inputFolder}${fileName}`, `${inputFolder}${baseFileName}_copy.pdf`, (error) => {
                if (error) {
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

export const execute = async (sessionId: string, fileName: string, format: string): Promise<string> => {
    return await instance.runWithContext(async () => {
        let result = "";

        await login();

        const baseFileName = helperSrc.baseFileName(fileName);
        const inputFolder = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${sessionId}/${baseFileName}/`;

        const isConverted = await convertToPdf(inputFolder, fileName);

        if (!isConverted) {
            return "Conversion to PDF failed.";
        }

        const pdfFile = `${inputFolder}${baseFileName}_copy.pdf`;

        if (format === "json") {
            result = json.convert(pdfFile);
        } else if (format === "markdown") {
            result = markdown.convert(pdfFile);
        } else if (format === "html") {
            const convertResult = svg.convert(inputFolder, fileName, "");

            const documentResult: modelRag.IapiRagResult = {
                type: "html",
                resultList: [
                    {
                        fileName,
                        pageNumber: convertResult.pageNumber
                    } as modelRag.IapiRag
                ]
            };

            result = JSON.stringify(documentResult);
        }

        await logout();

        return result;
    });
};
