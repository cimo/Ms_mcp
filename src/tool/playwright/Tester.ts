// Source
import * as helperSrc from "../../HelperSrc.js";
import * as instance from "./Instance.js";
import * as modelHelperSrc from "../../model/HelperSrc.js";

const login = async (): Promise<string> => {
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
            helperSrc.writeLog("Test.ts - login() - api(/login) - catch()", error.message);

            return "ko";
        });
};

const listTest = async (): Promise<string> => {
    return instance.api
        .get<modelHelperSrc.IresponseBody>("/api/list-test", {
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout);

            return stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Test.ts - listTest() - api(/api/list-test) - catch()", error.message);

            return "ko";
        });
};

const run = async (file: string, browser = "desktop_chrome"): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>(
            "/api/run",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            {
                file,
                browser
            }
        )

        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout);

            return stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Test.ts - run() - api(/api/run) - catch()", error.message);

            return "ko";
        });
};

const listVideo = async (video: string): Promise<string> => {
    return instance.api
        .post<modelHelperSrc.IresponseBody>(
            "/api/list-video",
            {
                headers: {
                    "Content-Type": "application/json"
                }
            },
            {
                video
            }
        )
        .then((resultApi) => {
            const data = resultApi.data;
            const stdout = JSON.parse(data.response.stdout);

            return stdout;
        })
        .catch((error: Error) => {
            helperSrc.writeLog("Test.ts - listVideo() - api(/api/list-video) - catch()", error.message);

            return "ko";
        });
};

const logout = async (): Promise<string> => {
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
            helperSrc.writeLog("Test.ts - logout() - api(/logout) - catch()", error.message);

            return "ko";
        });
};

export const execute = (action: string, file?: string, video?: string, browser?: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "";

        await login();

        if (action === "listTest") {
            result = await listTest();
        } else if (action === "run" && file && browser) {
            result = await run(file, browser);
        } else if (action === "listVideo" && video) {
            result = await listVideo(video);
        }

        await logout();

        return result;
    });
};
