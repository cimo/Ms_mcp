import Express, { Request, Response, NextFunction } from "express";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import CookieParser from "cookie-parser";
import Cors from "cors";
import * as Http from "http";
import * as Https from "https";
import Fs from "fs";
import { Ca } from "@cimo/authentication/dist/src/Main.js";
import { Cc } from "@cimo/cronjob/dist/src/Main.js";

// Source
import * as helperSrc from "../HelperSrc.js";
import * as modelServer from "../model/Server.js";
import * as toolRagEngine from "../tool/rag/Engine.js";
import ControllerUser from "./User.js";
import ControllerSetting from "./Setting.js";
import ControllerAgent from "./Agent.js";
import ControllerTool from "./Tool.js";
import ControllerXvfb from "./Xvfb.js";

export default class Server {
    // Variable
    private corsOption: modelServer.Icors;
    private limiter: RateLimitRequestHandler;
    private app: Express.Express;
    private sessionObject: Record<string, modelServer.Isession>;

    // Method
    constructor() {
        this.corsOption = {
            originList: JSON.parse(helperSrc.URL_CORS_ORIGIN) as string[],
            methodList: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
            preflightContinue: false,
            optionsSuccessStatus: 200
        };

        this.limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: 100,
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (request: Request) => {
                return helperSrc.headerClientIp(request).split(":").pop() as string;
            }
        });

        this.sessionObject = {};

        this.app = Express();
    }

    createSetting = (): void => {
        Ca.setCookieNameCustom("mcp-cookie");

        this.app.set("trust proxy", "loopback");
        this.app.use(Express.json());
        this.app.use(Express.urlencoded({ extended: true }));
        this.app.use(CookieParser());
        this.app.use(
            Cors({
                origin: this.corsOption.originList,
                methods: this.corsOption.methodList,
                optionsSuccessStatus: this.corsOption.optionsSuccessStatus
            })
        );
        this.app.use((request: modelServer.Irequest, response: Response, next: NextFunction) => {
            response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("Expires", "0");

            const remoteAddress = request.socket.remoteAddress ? request.socket.remoteAddress : "";

            request.clientIp = helperSrc.headerClientIp(request) || remoteAddress;

            next();
        });
        this.app.use("/asset", Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}asset/`));
        this.app.use("/file", this.limiter, Ca.authenticationMiddleware, Express.static(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}file/`));
    };

    createServer = (): void => {
        let creation: Http.Server | Https.Server;

        if (helperSrc.localeFromEnvName() === "jp") {
            creation = Https.createServer(
                {
                    key: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_KEY),
                    cert: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_CRT),
                    ca: Fs.readFileSync(helperSrc.PATH_CERTIFICATE_PEM)
                },
                this.app
            );
        } else {
            creation = Http.createServer(this.app);
        }

        const server = creation;

        server.listen(helperSrc.SERVER_PORT, () => {
            const controllerUser = new ControllerUser(this.app, this.limiter);
            controllerUser.api();
            controllerUser.tableCreate();

            const controllerSetting = new ControllerSetting(this.app, this.limiter);
            controllerSetting.api();

            const controllerAgent = new ControllerAgent(this.app, this.limiter);
            controllerAgent.api();

            const controllerTool = new ControllerTool(this.app, this.limiter, this.sessionObject);
            controllerTool.rpc();
            controllerTool.api();

            const controllerXvfb = new ControllerXvfb(this.sessionObject);

            helperSrc.writeLog("Server.ts - createServer() - listen() - Port", helperSrc.SERVER_PORT);

            this.app.get("/", this.limiter, Ca.authenticationMiddleware, (request: Request, response: Response) => {
                if (request.accepts("html")) {
                    response.sendFile(`${helperSrc.PATH_ROOT}${helperSrc.PATH_PUBLIC}index.html`);
                } else {
                    response.status(404).send("/: html not found!");
                }
            });

            this.app.get("/info", (request: modelServer.Irequest, response: Response) => {
                helperSrc.responseBody(`Client ip: ${request.clientIp || ""}`, "", response, 200);
            });

            this.app.post("/login", this.limiter, async (request: Request, response: Response) => {
                Ca.writeCookie(`${helperSrc.LABEL}_authentication`, response);

                const body = request.body as modelServer.IapiLoginBody;

                const loginSession = controllerUser.loginSessionVerify(body.username, body.password);

                if (loginSession.mcpSessionId !== "" && loginSession.message === "") {
                    const loginRpc = await controllerTool.loginRpc(response, loginSession.mcpSessionId);

                    if (loginRpc !== "ko") {
                        controllerXvfb.start(loginSession.mcpSessionId);

                        controllerSetting.tableCreate(loginSession.mcpSessionId);
                        controllerAgent.tableCreate(loginSession.mcpSessionId);
                        toolRagEngine.tableCreate(loginSession.mcpSessionId);

                        helperSrc.responseBody(JSON.stringify({ mcpSessionId: loginSession.mcpSessionId, message: "" }), "", response, 200);
                    } else {
                        helperSrc.responseBody("", "ko", response, 500);
                    }
                } else if (loginSession.mcpSessionId === "" && loginSession.message !== "") {
                    helperSrc.responseBody(
                        JSON.stringify({ mcpSessionId: loginSession.mcpSessionId, message: loginSession.message }),
                        "",
                        response,
                        200
                    );
                }
            });

            this.app.get("/logout", this.limiter, Ca.authenticationMiddleware, async (request: Request, response: Response) => {
                const resultRpc = await controllerTool.logoutRpc(request);

                Ca.deleteCookie(`${helperSrc.LABEL}_authentication`, request, response);

                if (resultRpc !== "ko") {
                    controllerXvfb.stop(resultRpc);

                    helperSrc.responseBody(resultRpc, "", response, 200);
                } else {
                    helperSrc.responseBody("", resultRpc, response, 500);
                }

                delete this.sessionObject[resultRpc];
            });
        });
    };
}

const controllerServer = new Server();
controllerServer.createSetting();
controllerServer.createServer();

Cc.execute(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}cronjob/`);

helperSrc.keepProcess();
