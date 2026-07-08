// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instanceDocumentParser from "./InstanceDocumentParser.js";
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
            helperSrc.writeLog("Parser.ts - apiLogin() - catch()", error.message);

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
            helperSrc.writeLog("Parser.ts - apiToPdf() - catch()", error.message);

            return "ko";
        });
};

const apiToJpg = async (formData: FormData): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>("/api/toJpg", {}, formData)
        .then((resultApi) => {
            const data = resultApi.data;

            return data.response.stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - apiToJpg() - catch()", error.message);

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
            helperSrc.writeLog("Parser.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

const apiDocumentParser = async (path: string, pathInput: string, pathOutput: string): Promise<string> => {
    return instanceDocumentParser.api
        .post<unknown>(
            path,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            { pathInput, pathOutput }
        )
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Parser.ts - apiDocumentParser() - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, fileName: string, searchInput: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let resultObject = {} as modelDocument.Iparser;

        await apiLogin();

        const fileDetail = helperSrc.fileDetail(fileName);

        const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        if (fileDetail.extension === "pdf") {
            const fileReadStream = await helperSrc.fileReadStream(`${pathDocument}${fileDetail.fileName}`);

            if (Buffer.isBuffer(fileReadStream)) {
                const buffer = Buffer.from(fileReadStream);
                const blob = new Blob([buffer], { type: fileDetail.mimeType });

                const formData = new FormData();
                formData.append("file", blob, fileDetail.fileName);

                const stdout = await apiToJpg(formData);

                if (stdout !== "ko") {
                    await helperSrc.fileWriteStream(`${pathDocument}result.pdf`, fileReadStream);

                    const base64List = JSON.parse(stdout) as string[];

                    for (let a = 0; a < base64List.length; a++) {
                        await helperSrc.fileWriteStream(`${pathDocument}image/${a + 1}.jpg`, Buffer.from(base64List[a], "base64"));
                    }

                    await apiDocumentParser("/layout", `${pathDocument}image/`, pathDocument);
                }
            } else {
                helperSrc.writeLog(`Parser.ts - execute() - pdf - fileReadStream()`, fileReadStream.toString());
            }
        } else {
            const fileReadStream = await helperSrc.fileReadStream(`${pathDocument}${fileDetail.fileName}`);

            if (Buffer.isBuffer(fileReadStream)) {
                const buffer = Buffer.from(fileReadStream);
                const blob = new Blob([buffer], { type: fileDetail.mimeType });

                const formData = new FormData();
                formData.append("file", blob, fileDetail.fileName);

                const stdout = await apiToPdf(formData);

                if (stdout !== "ko") {
                    await helperSrc.fileWriteStream(`${pathDocument}result.pdf`, Buffer.from(stdout, "base64"));
                }
            } else {
                helperSrc.writeLog(`Parser.ts - execute() - no pdf - fileReadStream()`, fileReadStream.toString());
            }
        }

        const engineData = await apiDocumentParser("/engine", `${pathDocument}result.pdf`, `${pathDocument}result.md`);

        if (engineData !== "ko") {
            resultObject = {
                fileName,
                searchInput
            };
        }

        await apiLogout();

        return JSON.stringify(resultObject);
    });
};
