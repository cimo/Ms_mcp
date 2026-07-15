// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelRag from "./Model.js";

// Method
const apiRagGraphify = (path: string, bodyObject: modelRag.IrequestStore | modelRag.IrequestSearch | modelRag.IrequestDelete): Promise<unknown> => {
    return instance.api
        .post<unknown>(
            path,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            bodyObject as unknown as Record<string, unknown>
        )
        .then((resultApi) => {
            return resultApi.data;
        })
        .catch((error: Error) => {
            helperSrc.writeLog(`Process.ts - apiRagGraphify() - catch()`, error.message);

            return "";
        });
};

export const databaseStore = async (mcpSessionId: string, fileName: string): Promise<string> => {
    return (await apiRagGraphify("/store", { mcpSessionId, fileName })) as string;
};

export const databaseSearch = async (mcpSessionId: string, prompt: string, entityList: string[], themeList: string[]): Promise<string> => {
    const result = await apiRagGraphify("/search", { mcpSessionId, prompt, entityList, themeList });

    return JSON.stringify(result);
};

export const databaseDelete = async (mcpSessionId: string, fileName: string): Promise<string> => {
    return (await apiRagGraphify("/delete", { mcpSessionId, fileName })) as string;
};
