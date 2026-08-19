// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as model from "./Model.js";

const apiLogin = async (): Promise<string> => {
    return instance.api
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
            helperSrc.writeLog("Extractor.ts - apiLogin() - catch()", error.message);

            return "ko";
        });
};

const apiExtract = async (formData: FormData): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IapiResponse>("/api/extract", {}, formData)
        .then((resultApi) => {
            const data = resultApi.data;

            return data.response.stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Extractor.ts - apiExtract() - catch()", error.message);

            return "ko";
        });
};

const apiLogout = async (): Promise<string> => {
    return instance.api
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
            helperSrc.writeLog("Extractor.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, fileName: string, searchText: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let resultObject = { uniqueId: "", layoutList: [], itemList: [] } as model.IapiExtractResponse;

        await apiLogin();

        const fileDetail = await helperSrc.fileDetail(fileName);

        const pathDocument = `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/document/${fileDetail.baseName}/`;

        const fileReadStream = await helperSrc.fileReadStream(`${pathDocument}${fileDetail.fileName}`);

        if (!Buffer.isBuffer(fileReadStream)) {
            helperSrc.writeLog(`Extractor.ts - execute() - fileReadStream()`, fileReadStream.toString());
        } else {
            const buffer = Buffer.from(fileReadStream);
            const blob = new Blob([buffer], { type: fileDetail.mimeType });

            const formData = new FormData();
            formData.append("file", blob, fileDetail.fileName);
            formData.append("searchText", searchText);

            const stdout = await apiExtract(formData);

            if (stdout !== "ko") {
                resultObject = JSON.parse(stdout) as model.IapiExtractResponse;
            }
        }

        await apiLogout();

        return JSON.stringify(resultObject);
    });
};
