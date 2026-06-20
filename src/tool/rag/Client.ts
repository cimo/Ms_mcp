import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "../../HelperSrc.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";
import * as modelRag from "./Model.js";
import * as instance from "./Instance.js";

// Method
const login = async (uniqueId: string): Promise<string> => {
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
            helperSrc.writeLog("Client.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const logout = async (uniqueId: string): Promise<string> => {
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
            helperSrc.writeLog("Client.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

const instanceRagGraphify = new Cr("http://127.0.0.1:1111");

const apiRagGraphify = (path: string, bodyObject: modelRag.IrequestStore | modelRag.IrequestSearch | modelRag.IrequestDelete): Promise<unknown> => {
    return instance.runWithContext(async () => {
        let uniqueId = "";

        if ("uniqueId" in bodyObject) {
            uniqueId = bodyObject.uniqueId;

            if (uniqueId !== "") {
                await login(uniqueId);
            }
        }

        const result = await instanceRagGraphify
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
                helperSrc.writeLog(`Client.ts - apiRagGraphify() - api(${path}) - catch()`, error.message);

                return "";
            });

        if (uniqueId !== "") {
            await logout(uniqueId);
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
