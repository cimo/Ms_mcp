// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";

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
            helperSrc.writeLog("Scanner.ts - apiLogin() - catch()", error.message);

            return "ko";
        });
};

const apiCheck = async (mode: string, target: string): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>(
            "/api/check",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            { mode, target }
        )
        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = data.response.stdout;

            return Buffer.from(stdout, "base64").toString("utf-8");
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Scanner.ts - apiCheck() - catch()", error.message);

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
            helperSrc.writeLog("Scanner.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

export const execute = (mode: string, target: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "";

        await apiLogin();

        result = await apiCheck(mode, target);

        await apiLogout();

        return result;
    });
};
