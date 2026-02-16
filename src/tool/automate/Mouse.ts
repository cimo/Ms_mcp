import { mouse, straightTo, Point, MouseClass } from "@nut-tree-fork/nut-js";

export const move = (x: number, y: number): Promise<MouseClass> => {
    return mouse.move(straightTo(new Point(x, y)));
};

export const click = (button: number): Promise<MouseClass> => {
    return mouse.click(button);
};
