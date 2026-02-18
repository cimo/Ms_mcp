import { Cr } from "@cimo/request/dist/src/Main.js";

// Source
import * as helperSrc from "./HelperSrc.js";

const protocol = helperSrc.localeFromEnvName() === "jp" ? "https" : "http";

export const api = new Cr(`${protocol}://${helperSrc.DOMAIN}:${helperSrc.SERVER_PORT}`);

api.setRequestInterceptor((config: RequestInit) => {
    return {
        ...config,
        headers: {
            ...config.headers
        }
    };
});

api.setResponseInterceptor((response: Response) => {
    if (response.status === 403 || response.status === 500) {
        helperSrc.writeLog("Instance.ts - setResponseInterceptor() - Error", response.status.toString());
    }

    return response;
});
