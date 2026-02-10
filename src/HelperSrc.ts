import Fs from "fs";
import { Response } from "express";
import { Ce } from "@cimo/environment/dist/src/Main.js";

// Source
import * as modelHelperSrc from "./model/HelperSrc.js";

export const ENV_NAME = Ce.checkVariable("ENV_NAME") || (process.env["ENV_NAME"] as string);

Ce.loadFile(`./env/${ENV_NAME}.env`);

export const DOMAIN = Ce.checkVariable("DOMAIN") || (process.env["DOMAIN"] as string);
export const TIME_ZONE = Ce.checkVariable("TIME_ZONE") || (process.env["TIME_ZONE"] as string);
export const LANG = Ce.checkVariable("LANG") || (process.env["LANG"] as string);
export const SERVER_PORT = Ce.checkVariable("SERVER_PORT") || (process.env["SERVER_PORT"] as string);
export const PATH_ROOT = Ce.checkVariable("PATH_ROOT");
export const NAME = Ce.checkVariable("MS_M_NAME") || (process.env["MS_A_NAME"] as string);
export const LABEL = Ce.checkVariable("MS_M_LABEL") || (process.env["MS_A_LABEL"] as string);
export const IS_DEBUG = Ce.checkVariable("MS_M_IS_DEBUG") || (process.env["MS_A_IS_DEBUG"] as string);
export const NODE_ENV = Ce.checkVariable("MS_M_NODE_ENV") || (process.env["MS_A_NODE_ENV"] as string);
export const URL_ROOT = Ce.checkVariable("MS_M_URL_ROOT") || (process.env["MS_A_URL_ROOT"] as string);
export const URL_CORS_ORIGIN = Ce.checkVariable("MS_M_URL_CORS_ORIGIN") || (process.env["MS_A_URL_CORS_ORIGIN"] as string);
export const URL_ENGINE = Ce.checkVariable("MS_M_URL_ENGINE") || (process.env["MS_M_URL_ENGINE"] as string);
export const URL_MS_O = Ce.checkVariable("MS_M_URL_MS_O") || (process.env["MS_M_URL_MS_O"] as string);
export const PATH_CERTIFICATE_KEY = Ce.checkVariable("MS_M_PATH_CERTIFICATE_KEY");
export const PATH_CERTIFICATE_CRT = Ce.checkVariable("MS_M_PATH_CERTIFICATE_CRT");
export const PATH_FILE = Ce.checkVariable("MS_M_PATH_FILE");
export const PATH_LOG = Ce.checkVariable("MS_M_PATH_LOG");
export const PATH_PUBLIC = Ce.checkVariable("MS_M_PATH_PUBLIC");
export const PATH_SCRIPT = Ce.checkVariable("MS_M_PATH_SCRIPT");
export const MIME_TYPE = Ce.checkVariable("MS_M_MIME_TYPE") || (process.env["MS_M_MIME_TYPE"] as string);
export const FILE_SIZE_MB = Ce.checkVariable("MS_M_FILE_SIZE_MB") || (process.env["MS_M_FILE_SIZE_MB"] as string);

export const localeConfiguration: Record<string, { locale: string; currency: string; dateFormat: string }> = {
    // Asia
    jp: { locale: "ja-JP", currency: "JPY", dateFormat: "a" },
    cn: { locale: "zh-CN", currency: "CNY", dateFormat: "a" },
    tw: { locale: "zh-TW", currency: "TWD", dateFormat: "a" },
    kr: { locale: "ko-KR", currency: "KRW", dateFormat: "a" },
    in: { locale: "hi-IN", currency: "INR", dateFormat: "a" },
    th: { locale: "th-TH", currency: "THB", dateFormat: "a" },
    // Europe
    it: { locale: "it-IT", currency: "EUR", dateFormat: "b" },
    fr: { locale: "fr-FR", currency: "EUR", dateFormat: "b" },
    de: { locale: "de-DE", currency: "EUR", dateFormat: "b" },
    es: { locale: "es-ES", currency: "EUR", dateFormat: "b" },
    pt: { locale: "pt-PT", currency: "EUR", dateFormat: "b" },
    nl: { locale: "nl-NL", currency: "EUR", dateFormat: "b" },
    ru: { locale: "ru-RU", currency: "RUB", dateFormat: "b" },
    pl: { locale: "pl-PL", currency: "PLN", dateFormat: "b" },
    sv: { locale: "sv-SE", currency: "SEK", dateFormat: "b" },
    // America
    us: { locale: "en-US", currency: "USD", dateFormat: "c" },
    mx: { locale: "es-MX", currency: "MXN", dateFormat: "c" },
    br: { locale: "pt-BR", currency: "BRL", dateFormat: "c" },
    ca: { locale: "fr-CA", currency: "CAD", dateFormat: "c" },
    // Africa
    ke: { locale: "sw-KE", currency: "KES", dateFormat: "c" },
    za: { locale: "af-ZA", currency: "ZAR", dateFormat: "c" },
    eg: { locale: "ar-EG", currency: "EGP", dateFormat: "c" },
    // Oceania
    au: { locale: "en-AU", currency: "AUD", dateFormat: "c" },
    nz: { locale: "mi-NZ", currency: "NZD", dateFormat: "c" }
};

export const localeFromEnvName = (): string => {
    let result = ENV_NAME.split("_").pop();

    if (!result || result === "local") {
        result = "jp";
    }

    return result;
};

export const LOCALE = localeFromEnvName();

export const localeFormat = (value: number | Date, isMonth = true, isDay = true, isTime = true): string | undefined => {
    if (typeof value === "number") {
        const formatOption: Intl.NumberFormatOptions = {
            style: "decimal",
            currency: localeConfiguration[LOCALE].currency
        };

        return new Intl.NumberFormat(localeConfiguration[LOCALE].locale, formatOption).format(value);
    } else if (value instanceof Date) {
        let formatOption: Intl.DateTimeFormatOptions = {
            year: "numeric"
        };

        if (isMonth) {
            formatOption.month = "numeric";
        }

        if (isDay) {
            formatOption.day = "numeric";
        }

        if (isTime) {
            formatOption.hour = "2-digit";
            formatOption.minute = "2-digit";
            formatOption.second = "2-digit";
            formatOption.hour12 = false;
        }

        let result = new Intl.DateTimeFormat(localeConfiguration[LOCALE].locale, formatOption).format(value);

        if (!isMonth && !isDay && !isTime) {
            result = parseInt(result).toString();
        }

        return result;
    }

    return undefined;
};

export const writeLog = (tag: string, value: string | Record<string, unknown> | Error): void => {
    if (IS_DEBUG === "true") {
        const text = `Time: ${localeFormat(new Date())} - ${tag}: `;

        if (typeof process !== "undefined") {
            Fs.appendFile(`${PATH_ROOT}${PATH_LOG}debug.log`, `${text}${value.toString()}\n`, () => {
                // eslint-disable-next-line no-console
                console.log(`WriteLog => ${text}`, value);
            });
        } else {
            // eslint-disable-next-line no-console
            console.log(`WriteLog => ${text}`, value);
        }
    }
};

export const fileWriteStream = (filePath: string, buffer: Buffer, callback: (result: NodeJS.ErrnoException | boolean) => void): void => {
    const writeStream = Fs.createWriteStream(filePath);

    writeStream.on("open", () => {
        writeStream.write(buffer);
        writeStream.end();
    });

    writeStream.on("finish", () => {
        callback(true);
    });

    writeStream.on("error", (error) => {
        callback(error);
    });
};

export const fileReadStream = (filePath: string, callback: (result: NodeJS.ErrnoException | Buffer) => void): void => {
    const chunkList: Buffer[] = [];

    const readStream = Fs.createReadStream(filePath);

    readStream.on("data", (chunk: Buffer) => {
        chunkList.push(chunk);
    });

    readStream.on("end", () => {
        callback(Buffer.concat(chunkList));
    });

    readStream.on("error", (error) => {
        callback(error);
    });
};

export const fileOrFolderRemove = (path: string, callback: (result: NodeJS.ErrnoException | boolean) => void): void => {
    Fs.stat(path, (error, stats) => {
        if (error) {
            return callback(error);
        }

        if (stats.isDirectory()) {
            Fs.rm(path, { recursive: true, force: true }, (error) => {
                if (error) {
                    return callback(error);
                }

                callback(true);
            });
        } else {
            Fs.unlink(path, (error) => {
                if (error) {
                    return callback(error);
                }

                callback(true);
            });
        }
    });
};

export const fileCheckMimeType = (value: string): boolean => {
    if (MIME_TYPE && MIME_TYPE.includes(value)) {
        return true;
    }

    return false;
};

export const fileCheckSize = (byte: number): boolean => {
    const maxSizeByte = parseInt(FILE_SIZE_MB) * 1024 * 1024;

    if (byte > maxSizeByte) {
        return false;
    }

    return true;
};

export const responseBody = (stdoutValue: string, stderrValue: string | Error, response: Response, mode: number): void => {
    const responseBody: modelHelperSrc.IresponseBody = { response: { stdout: stdoutValue, stderr: stderrValue } };

    response.status(mode).send(responseBody);
};

export const keepProcess = (): void => {
    for (const event of ["uncaughtException", "unhandledRejection"]) {
        process.on(event, (error: Error) => {
            writeLog("HelperSrc.ts - keepProcess()", `Event: "${event}" - ${error.toString()}`);
        });
    }
};

export const isJson = (value: string): boolean => {
    try {
        JSON.parse(value);

        return true;
    } catch {
        return false;
    }
};

export const removeAnsiEscape = (text: string): string => {
    const regex = new RegExp(["\x1b", "[", "[0-9;]*", "[a-zA-Z]"].join(""), "g");

    return text.replace(regex, "");
};

export const generateUniqueId = (): string => {
    const timestamp = Date.now().toString(36);
    const randomPart = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);

    return `${timestamp}-${randomPart}`;
};

export const findFileInDirectoryRecursive = (path: string, extension: string, callback: (resultList: string[]) => void): void => {
    const resultList: string[] = [];

    Fs.access(path, Fs.constants.F_OK, (errorAccess) => {
        if (errorAccess) {
            return callback(resultList);
        }

        Fs.readdir(path, (errorReadDir, dataList) => {
            if (errorReadDir) {
                return callback(resultList);
            }

            let count = 0;

            const next = () => {
                if (count >= dataList.length) {
                    return callback(resultList);
                }

                const data = dataList[count++];
                const pathData = `${path}${data}`;

                Fs.stat(pathData, (errorStat, statData) => {
                    if (!errorStat && statData.isDirectory()) {
                        findFileInDirectoryRecursive(`${pathData}/`, extension, (dataSubList) => {
                            for (const dataSub of dataSubList) {
                                resultList.push(dataSub);
                            }

                            next();
                        });
                    } else if (!errorStat && statData.isFile() && data.endsWith(extension)) {
                        resultList.push(pathData);

                        next();
                    } else {
                        next();
                    }
                });
            };

            next();
        });
    });
};

export const headerBearerToken = (authorization: string | undefined): string => {
    return authorization ? authorization.substring(7) : "";
};
