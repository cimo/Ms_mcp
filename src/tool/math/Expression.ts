// Source
import * as model from "./Model.js";

const checkDigit = (character: string): boolean => {
    return character >= "0" && character <= "9";
};

const checkUnaryMinus = (input: string, count: number, lastType: "number" | "operator" | "lparen" | "rparen" | null): boolean => {
    if (input[count] !== "-") {
        return false;
    }

    const start = lastType === null;
    const afterOp = lastType === "operator" || lastType === "lparen";

    const next = input[count + 1];
    const isNextNumCharacter = next === "." || (next >= "0" && next <= "9");

    return (start || afterOp) && isNextNumCharacter;
};

const checkOp = (x: model.Ttoken): boolean => {
    return x === "+" || x === "-" || x === "*" || x === "/" || x === "^";
};

const tokenize = (input: string): model.Ttoken[] => {
    const result: model.Ttoken[] = [];

    let count = 0;
    let lastType: "number" | "operator" | "lparen" | "rparen" | null = null;

    while (count < input.length) {
        const character = input[count];

        if (character === " " || character === "\t" || character === "\n" || character === "\r") {
            count++;

            continue;
        }

        if (checkDigit(character) || character === "." || checkUnaryMinus(input, count, lastType)) {
            const start = count;

            if (input[count] === "-" && checkUnaryMinus(input, count, lastType)) {
                count++;
            }

            let isDigit = false;

            while (count < input.length && (checkDigit(input[count]) || input[count] === ".")) {
                if (checkDigit(input[count])) {
                    isDigit = true;
                }

                count++;
            }

            if (!isDigit) {
                throw new Error(`Tool expression: Invalid number at position ${start}`);
            }

            const num = Number(input.slice(start, count));

            if (!Number.isFinite(num)) {
                throw new Error("Tool expression: Invalid numeric literal.");
            }

            result.push(num);

            lastType = "number";

            continue;
        }

        if (character === "+" || character === "-" || character === "*" || character === "/" || character === "^") {
            result.push(character as model.Ttoken);

            count++;

            lastType = "operator";

            continue;
        }

        if (character === "(") {
            result.push("(");

            count++;

            lastType = "lparen";

            continue;
        }

        if (character === ")") {
            result.push(")");

            count++;

            lastType = "rparen";

            continue;
        }

        throw new Error(`Tool expression: Unsupported character ${character}`);
    }

    return result;
};

const toRpn = (tokenList: model.Ttoken[]): model.Ttoken[] => {
    const result: model.Ttoken[] = [];

    const stack: model.Ttoken[] = [];
    const operatorPrecedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
    const operatorAssociativity: Record<string, boolean> = { "^": true };

    for (const token of tokenList) {
        if (typeof token === "number") {
            result.push(token);

            continue;
        }

        if (token === "+" || token === "-" || token === "*" || token === "/" || token === "^") {
            while (
                stack.length &&
                checkOp(stack[stack.length - 1]) &&
                ((operatorAssociativity[token] !== true && operatorPrecedence[token] <= operatorPrecedence[stack[stack.length - 1] as string]) ||
                    (operatorAssociativity[token] === true && operatorPrecedence[token] < operatorPrecedence[stack[stack.length - 1] as string]))
            ) {
                result.push(stack.pop() as model.Ttoken);
            }

            stack.push(token);

            continue;
        }

        if (token === "(") {
            stack.push(token);

            continue;
        }

        if (token === ")") {
            while (stack.length && stack[stack.length - 1] !== "(") {
                result.push(stack.pop() as model.Ttoken);
            }

            if (!stack.length) {
                throw new Error("Tool expression: Mismatched parentheses.");
            }

            stack.pop();

            continue;
        }

        throw new Error(`Tool expression: Unsupported token in shunting-yard ${String(token)}`);
    }

    while (stack.length) {
        const s = stack.pop() as model.Ttoken;

        if (s === "(" || s === ")") {
            throw new Error("Tool expression: Mismatched parentheses.");
        }

        result.push(s);
    }

    return result;
};

const evaluate = (rpnList: model.Ttoken[]): number => {
    const stack: number[] = [];

    for (const rpn of rpnList) {
        if (typeof rpn === "number") {
            stack.push(rpn);

            continue;
        }

        const b = stack.pop() as number;
        const a = stack.pop() as number;

        if (typeof a !== "number" || typeof b !== "number") {
            throw new Error("Tool expression: Insufficient operands.");
        }

        if (rpn === "+") {
            stack.push(a + b);
        } else if (rpn === "-") {
            stack.push(a - b);
        } else if (rpn === "*") {
            stack.push(a * b);
        } else if (rpn === "/") {
            stack.push(a / b);
        } else if (rpn === "^") {
            stack.push(Math.pow(a, b));
        } else {
            throw new Error(`Tool expression: Unknown operator ${String(rpn)}`);
        }
    }

    if (stack.length !== 1) {
        throw new Error("Tool expression: Remaining operands.");
    }

    return stack[0];
};

export const execute = (input: string): number => {
    const tokenList = tokenize(input);
    const rpnList = toRpn(tokenList);

    return evaluate(rpnList);
};
