import { mouse, straightTo, Point } from "@nut-tree-fork/nut-js";

const move = async (x: number, y: number): Promise<string> => {
    await mouse.move(straightTo(new Point(x, y)));

    return "ok";
};

const click = async (button: number): Promise<string> => {
    await mouse.click(button);

    return "ok";
};

const argumentList = process.argv.slice(2);

let result = "";

if (argumentList[0] === "move") {
    result = await move(Number(argumentList[1]), Number(argumentList[2]));
} else if (argumentList[0] === "click") {
    result = await click(Number(argumentList[1]));
}

process.stdout.write(result);
