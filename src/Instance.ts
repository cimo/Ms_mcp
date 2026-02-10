import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as HelperSrc from "./HelperSrc.js";

export const api = new Cr(`${HelperSrc.URL_ENGINE || ""}`);

api.setRequestInterceptor((config: RequestInit) => {
    return {
        ...config,
        headers: {
            ...config.headers
        },
        credentials: "include"
    };
});

api.setResponseInterceptor((response: Response) => {
    if (response.status === 403 || response.status === 500) {
        HelperSrc.writeLog("Instance.ts - responseLogic() - Error", response.status.toString());
    }

    return response;
});
