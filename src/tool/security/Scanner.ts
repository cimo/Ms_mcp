// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";

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
            helperSrc.writeLog("Scanner.ts - login() - api(/login) - catch()", error.message);

            result = "ko";
        });

    return result;
};

const scan = async (mode: string, target: string): Promise<string> => {
    return new Promise<string>(async (resolve) => {
        await instance.api
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
                resolve(Buffer.from(resultApi.data.response.stdout, "base64").toString("utf-8"));

                return;
            })
            .catch((error: Error) => {
                helperSrc.writeLog("Scanner.ts - scan() - api(/api/check) - catch()", error.message);

                resolve("");

                return;
            });
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
            helperSrc.writeLog("Scanner.ts - logout() - api(/logout) - catch()", error.message);

            result = "ko";
        });

    return result;
};

export const execute = async (mode: string, target: string): Promise<string> => {
    return await instance.runWithContext(async () => {
        await login();

        const result = await scan(mode, target);

        await logout();

        return result;
    });
};
