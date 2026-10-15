import { unzip } from "fflate";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as instance from "../Instance.js";
import * as modelHelperSrc from "../model/HelperSrc.js";

export default class Document {
    // Variable

    // Method
    private apiFileConverterLogin = async (): Promise<string> => {
        return instance.apiFileConverter
            .get<modelHelperSrc.IapiResponse>("/login", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileConverterLogin() - catch()", error.message);

                return "ko";
            });
    };

    private apiToPdf = async (formData: FormData): Promise<modelHelperSrc.IactionOperation> => {
        return instance.apiFileConverter
            .post<modelHelperSrc.IapiResponse>("/api/toPdf", {}, formData)
            .then((resultApi) => {
                const data = resultApi.data;

                if (data.response.state !== "ok") {
                    helperSrc.writeLog("Document.ts - apiToPdf() - Error", data.response.message as string);
                }

                return data.response;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiToPdf() - catch()", error.message);

                return { state: "error", message: "Service not available." };
            });
    };

    private apiFileConverterLogout = async (): Promise<string> => {
        return instance.apiFileConverter
            .get<modelHelperSrc.IapiResponse>("/logout", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileConverterLogout() - catch()", error.message);

                return "ko";
            });
    };

    private apiFileDataExtractorLogin = async (): Promise<string> => {
        return instance.apiFileDataExtractor
            .get<modelHelperSrc.IapiResponse>("/login", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileDataExtractorLogin() - catch()", error.message);

                return "ko";
            });
    };

    private apiExtract = async (formData: FormData): Promise<modelHelperSrc.IactionOperation> => {
        return instance.apiFileDataExtractor
            .post<modelHelperSrc.IapiResponse>("/api/extract", {}, formData)
            .then((resultApi) => {
                const data = resultApi.data;

                if (data.response.state !== "ok") {
                    helperSrc.writeLog("Document.ts - apiExtract() - Error", data.response.message as string);
                }

                return data.response;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiExtract() - catch()", error.message);

                return { state: "error", message: "Service not available." };
            });
    };

    private apiExtractCheck = async (uniqueId: string): Promise<modelHelperSrc.IactionOperation> => {
        return instance.apiFileDataExtractor
            .post<modelHelperSrc.IapiResponse>(
                "/api/extract-check",
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                },
                { uniqueId }
            )
            .then((resultApi) => {
                const data = resultApi.data;

                return data.response;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiExtractCheck() - catch()", error.message);

                return { state: "error", message: "Service not available." };
            });
    };

    private apiExtractResult = async (uniqueId: string): Promise<modelHelperSrc.IactionOperation> => {
        let resultExtractCheck = await this.apiExtractCheck(uniqueId);

        while (resultExtractCheck.state === "queued" || resultExtractCheck.state === "running") {
            await new Promise((resolve) => setTimeout(resolve, 3 * 1000));

            resultExtractCheck = await this.apiExtractCheck(uniqueId);
        }

        if (resultExtractCheck.state !== "ok") {
            helperSrc.writeLog("Document.ts - apiExtractResult() - Error", resultExtractCheck.message as string);
        }

        return resultExtractCheck;
    };

    private apiFileDataExtractorLogout = async (): Promise<string> => {
        return instance.apiFileDataExtractor
            .get<modelHelperSrc.IapiResponse>("/logout", {
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then((resultApi) => {
                const data = resultApi.data;

                return JSON.stringify(data, null, 2);
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Document.ts - apiFileDataExtractorLogout() - catch()", error.message);

                return "ko";
            });
    };

    private zipWrite = (buffer: Buffer, pathCurrent: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            unzip(buffer, async (error: Error | null, zip: Record<string, Uint8Array>) => {
                if (error) {
                    helperSrc.writeLog("Document.ts - zipWrite() - unzip()", error.message);

                    resolve(false);

                    return;
                }

                const entryList = Object.keys(zip);

                for (let a = 0; a < entryList.length; a++) {
                    if (!helperSrc.checkPathChild(pathCurrent, entryList[a])) {
                        helperSrc.writeLog("Document.ts - zipWrite() - checkPathChild()", entryList[a]);

                        resolve(false);

                        return;
                    }
                }

                for (let a = 0; a < entryList.length; a++) {
                    const entry = entryList[a];

                    if (entry.endsWith("/")) {
                        continue;
                    }

                    const fileWriteStream = await helperSrc.fileWriteStream(`${pathCurrent}${entry}`, Buffer.from(zip[entry]));

                    if (typeof fileWriteStream !== "boolean") {
                        helperSrc.writeLog("Document.ts - zipWrite() - fileWriteStream()", fileWriteStream.toString());
                    }
                }

                resolve(true);
            });
        });
    };

    constructor() {}

    execute = (fileDetail: modelHelperSrc.IfileDetail, pathCurrent: string): Promise<modelHelperSrc.IactionOperation> => {
        return instance.runWithContext(async () => {
            const fileReadStream = await helperSrc.fileReadStream(`${pathCurrent}${fileDetail.name}`);

            if (!Buffer.isBuffer(fileReadStream)) {
                helperSrc.writeLog("Document.ts - execute() - fileReadStream()", fileReadStream.toString());

                return { state: "ko", message: "The file was not found in the workspace, check the name and try again." };
            }

            const buffer = Buffer.from(fileReadStream);
            const blob = new Blob([buffer], { type: fileDetail.mimeType });

            if (fileDetail.category === "document" && fileDetail.extension !== "pdf") {
                const formDataFileConverter = new FormData();
                formDataFileConverter.append("file", blob, fileDetail.name);

                await this.apiFileConverterLogin();

                const resultToPdf = await this.apiToPdf(formDataFileConverter);

                await this.apiFileConverterLogout();

                if (resultToPdf.state !== "ok") {
                    return resultToPdf;
                }

                const fileWriteStream = await helperSrc.fileWriteStream(
                    `${pathCurrent}converted.pdf`,
                    Buffer.from(resultToPdf.data as string, "base64")
                );

                if (typeof fileWriteStream !== "boolean") {
                    helperSrc.writeLog("Document.ts - execute() - fileWriteStream()", fileWriteStream.toString());
                }
            }

            const formDataFileDataExtractor = new FormData();
            formDataFileDataExtractor.append("file", blob, fileDetail.name);

            await this.apiFileDataExtractorLogin();

            let resultExtract = await this.apiExtract(formDataFileDataExtractor);

            if (resultExtract.state === "ok") {
                resultExtract = await this.apiExtractResult(resultExtract.data as string);
            }

            await this.apiFileDataExtractorLogout();

            if (resultExtract.state !== "ok") {
                return resultExtract;
            }

            const isZipWrite = await this.zipWrite(Buffer.from(resultExtract.data as string, "base64"), pathCurrent);

            if (!isZipWrite) {
                return { state: "error", message: "Service not available." };
            }

            return { state: "ok", message: "" };
        });
    };
}
