import { launch } from "chrome-launcher";

// Source
import * as helperSrc from "./HelperSrc.js";

const argumentList: string[] = process.argv.slice(2);

const pathExtension: string = "/home/app/docker/ce_microsoft_sso";
const displayNumber: string = argumentList[0];
const urlPage: string = argumentList[1];

const execute = async (): Promise<void> => {
    const flagBaseList: string[] = [
        `--display=:${displayNumber}`,
        "--ozone-platform=x11",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-crash-restore-bubble",
        "--window-position=0,0",
        "--window-size=1920,1080"
    ];

    const flagRdpList: string[] = ["--remote-debugging-pipe", "--enable-unsafe-extension-debugging"];

    const environmentList: NodeJS.ProcessEnv = {
        ...process.env,
        DISPLAY: `:${displayNumber}`,
        XDG_SESSION_TYPE: "x11"
    };

    delete environmentList["WAYLAND_DISPLAY"];

    const chrome = await launch({
        chromeFlags: [...flagBaseList, ...flagRdpList],
        startingUrl: urlPage,
        chromePath: "/usr/bin/google-chrome",
        ignoreDefaultFlags: true,
        envVars: environmentList
    });

    const remotePipe = chrome.remoteDebuggingPipes;

    if (!remotePipe) {
        helperSrc.writeLog("Chrome.ts - execute() - Error", "Remote-debugging-pipe is not available.");

        process.exit(1);
    }

    const request = {
        id: 1234,
        method: "Extensions.loadUnpacked",
        params: { path: pathExtension }
    };

    remotePipe.outgoing.write(`${JSON.stringify(request)}\x00`);

    await new Promise((resolve, reject) => {
        let pending = "";

        remotePipe.outgoing.on("error", () => reject("Chrome.ts - execute() - outgoing - onerror(): Pipe interupted."));

        remotePipe.incoming.on("error", () => reject("Chrome.ts - execute() - incoming - onerror(): Pipe interupted."));

        remotePipe.incoming.on("close", () => reject("Chrome.ts - execute() - incoming - onclose(): Pipe closed before response."));

        remotePipe.incoming.on("data", (chunk: Buffer) => {
            pending += chunk.toString();

            let end = pending.indexOf("\x00");

            while (end !== -1) {
                const message = pending.slice(0, end);

                pending = pending.slice(end + 1);

                end = pending.indexOf("\x00");

                resolve(JSON.parse(message));

                return;
            }
        });
    });

    chrome.process.on("exit", () => {
        process.exit(0);
    });
};

execute().catch((error: Error) => {
    helperSrc.writeLog("Chrome.ts - execute() - catch()", error.message || error);

    process.exit(1);
});
