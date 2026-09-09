// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";

const apiLogin = async (): Promise<string> => {
    return instance.apiAntivirus
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
            helperSrc.writeLog("Antivirus.ts - apiLogin() - catch()", error.message);

            return "ko";
        });
};

const apiCheck = async (formData: FormData): Promise<string> => {
    return instance.apiAntivirus
        .post<modelHelperSrc.IapiResponse>("/api/check", {}, formData)
        .then((resultApi) => {
            const data = resultApi.data;

            return data.response.data as string;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Antivirus.ts - apiCheck() - catch()", error.message);

            return "ko";
        });
};

const apiLogout = async (): Promise<string> => {
    return instance.apiAntivirus
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
            helperSrc.writeLog("Antivirus.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

export const execute = (mcpSessionId: string, fileName: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "";

        await apiLogin();

        const fileDetail = await helperSrc.fileDetail(fileName);

        const pathDirname = await helperSrc.findPathDirnameRecursive(
            `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}input/${mcpSessionId}/workspace/`,
            fileDetail.name
        );

        const fileReadStream = await helperSrc.fileReadStream(`${pathDirname}${fileDetail.name}`);

        if (Buffer.isBuffer(fileReadStream)) {
            const buffer = Buffer.from(fileReadStream);
            const blob = new Blob([buffer], { type: fileDetail.mimeType });

            const formData = new FormData();
            formData.append("file", blob, fileDetail.name);

            result = await apiCheck(formData);
        }

        await apiLogout();

        return result;
    });
};
