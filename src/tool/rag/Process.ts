// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instanceRagGraphify from "./InstanceRagGraphify.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelRag from "./Model.js";

// Method
const apiLogin = async (uniqueId: string): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/login", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Process.ts - apiLogin() - catch()", error.message);

            return "ko";
        });
};

const apiLogout = async (uniqueId: string): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/logout", {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${uniqueId}`
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;

            return JSON.stringify(data, null, 2);
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Process.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

const apiRagGraphify = (path: string, bodyObject: modelRag.IrequestStore | modelRag.IrequestSearch | modelRag.IrequestDelete): Promise<unknown> => {
    return instance.runWithContext(async () => {
        let uniqueId = "";

        if ("uniqueId" in bodyObject) {
            uniqueId = bodyObject.uniqueId;

            if (uniqueId !== "") {
                await apiLogin(uniqueId);
            }
        }

        const result = await instanceRagGraphify.api
            .post<unknown>(
                path,
                {
                    headers: {
                        "Content-Type": "application/json"
                    }
                },
                { ...bodyObject, cookie: instance.cookieRead() } as unknown as Record<string, unknown>
            )
            .then((resultApi) => {
                return resultApi.data;
            })
            .catch((error: Error) => {
                helperSrc.writeLog(`Process.ts - apiRagGraphify() - catch()`, error.message);

                return "";
            });

        if (uniqueId !== "") {
            await apiLogout(uniqueId);
        }

        return result;
    });
};

export const databaseStore = async (mcpSessionId: string, uniqueId: string, fileName: string): Promise<string> => {
    return (await apiRagGraphify("/store", { mcpSessionId, uniqueId, fileName })) as string;
};

export const databaseSearch = async (
    mcpSessionId: string,
    uniqueId: string,
    prompt: string,
    entityList: string[],
    themeList: string[]
): Promise<string> => {
    const result = await apiRagGraphify("/search", { mcpSessionId, uniqueId, prompt, entityList, themeList });

    return JSON.stringify(result);
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    return (await apiRagGraphify("/delete", { mcpSessionId, fileName })) as string;
};
