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
            helperSrc.writeLog("Test.ts - apiLogin() - catch()", error.message);

            return "ko";
        });
};

const apiListTest = async (): Promise<string> => {
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
            helperSrc.writeLog("Test.ts - apiListTest() - catch()", error.message);

            return "ko";
        });
};

const apiRun = async (file: string, browser = "desktop_chrome"): Promise<string> => {
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
            helperSrc.writeLog("Test.ts - apiRun() - catch()", error.message);

            return "ko";
        });
};

const apiListVideo = async (video: string): Promise<string> => {
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
            helperSrc.writeLog("Test.ts - apiListVideo() - catch()", error.message);

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
            helperSrc.writeLog("Test.ts - apiLogout() - catch()", error.message);

            return "ko";
        });
};

export const execute = (action: string, file?: string, video?: string, browser?: string): Promise<string> => {
    return instance.runWithContext(async () => {
        let result = "";

        await apiLogin();

        if (action === "listTest") {
            result = await apiListTest();
        } else if (action === "run" && file && browser) {
            result = await apiRun(file, browser);
        } else if (action === "listVideo" && video) {
            result = await apiListVideo(video);
        }

        await apiLogout();

        return result;
    });
};
