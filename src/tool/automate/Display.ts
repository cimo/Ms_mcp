import { mouse, screen, FileType } from "@nut-tree-fork/nut-js";
import sharp, { Channels } from "sharp";

// Source
import * as helperSrc from "../../HelperSrc.js";

const drawCursor = async (file: string, x: number, y: number): Promise<void> => {
    const cursor = Buffer.from(`<svg width="20" height="20"><circle cx="5" cy="5" r="5" fill="red"/></svg>`);

    await sharp(file)
        .composite([{ input: cursor, top: y, left: x }])
        .toFile(file.replace(".jpg", "_cursor.jpg"));
};

const screenshot = async (): Promise<string> => {
    if (helperSrc.IS_DEBUG) {
        const mousePosition = await mouse.getPosition();

        await screen.capture("screenshot", FileType.JPG, `${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}tmp/`);

        await drawCursor(`${helperSrc.PATH_ROOT}${helperSrc.PATH_FILE}tmp/screenshot.jpg`, mousePosition.x, mousePosition.y);
    }

    const imagePixel = await screen.grab();
    const imageRbg = await imagePixel.toRGB();

    const imageBuffer = await sharp(imageRbg.data, {
        raw: {
            width: imageRbg.width,
            height: imageRbg.height,
            channels: imageRbg.channels as Channels
        }
    })
        .jpeg()
        .removeAlpha()
        .toBuffer();

    return imageBuffer.toString("base64");
};

const argumentList = process.argv.slice(2);

let result = "";

if (argumentList[0] === "screenshot") {
    result = await screenshot();
}

process.stdout.write(result);
