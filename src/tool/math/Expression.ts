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
    const resultList: model.Ttoken[] = [];

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
                throw new Error(`Invalid number at position ${start}`);
            }

            const num = Number(input.slice(start, count));

            if (!Number.isFinite(num)) {
                throw new Error("Invalid numeric literal.");
            }

            resultList.push(num);

            lastType = "number";

            continue;
        }

        if (character === "+" || character === "-" || character === "*" || character === "/" || character === "^") {
            resultList.push(character as model.Ttoken);

            count++;

            lastType = "operator";

            continue;
        }

        if (character === "(") {
            resultList.push("(");

            count++;

            lastType = "lparen";

            continue;
        }

        if (character === ")") {
            resultList.push(")");

            count++;

            lastType = "rparen";

            continue;
        }

        throw new Error(`Unsupported character ${character}`);
    }

    return resultList;
};

const toRpn = (tokenList: model.Ttoken[]): model.Ttoken[] => {
    const resultList: model.Ttoken[] = [];

    const stackList: model.Ttoken[] = [];
    const operatorPrecedenceObject = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 } as Record<string, number>;
    const operatorAssociativityObject = { "^": true } as Record<string, boolean>;

    for (let a = 0; a < tokenList.length; a++) {
        const token = tokenList[a];

        if (typeof token === "number") {
            resultList.push(token);

            continue;
        }

        if (token === "+" || token === "-" || token === "*" || token === "/" || token === "^") {
            while (
                stackList.length &&
                checkOp(stackList[stackList.length - 1]) &&
                ((operatorAssociativityObject[token] !== true &&
                    operatorPrecedenceObject[token] <= operatorPrecedenceObject[stackList[stackList.length - 1] as string]) ||
                    (operatorAssociativityObject[token] === true &&
                        operatorPrecedenceObject[token] < operatorPrecedenceObject[stackList[stackList.length - 1] as string]))
            ) {
                resultList.push(stackList.pop() as model.Ttoken);
            }

            stackList.push(token);

            continue;
        }

        if (token === "(") {
            stackList.push(token);

            continue;
        }

        if (token === ")") {
            while (stackList.length && stackList[stackList.length - 1] !== "(") {
                resultList.push(stackList.pop() as model.Ttoken);
            }

            if (!stackList.length) {
                throw new Error("Mismatched parentheses.");
            }

            stackList.pop();

            continue;
        }

        throw new Error(`Unsupported token in shunting-yard ${String(token)}`);
    }

    while (stackList.length) {
        const s = stackList.pop() as model.Ttoken;

        if (s === "(" || s === ")") {
            throw new Error("Mismatched parentheses.");
        }

        resultList.push(s);
    }

    return resultList;
};

const evaluate = (rpnList: model.Ttoken[]): number => {
    const stackList: number[] = [];

    for (let a = 0; a < rpnList.length; a++) {
        const rpn = rpnList[a];

        if (typeof rpn === "number") {
            stackList.push(rpn);

            continue;
        }

        const stackB = stackList.pop() as number;
        const stackA = stackList.pop() as number;

        if (typeof stackA !== "number" || typeof stackB !== "number") {
            throw new Error("Insufficient operands.");
        }

        if (rpn === "+") {
            stackList.push(stackA + stackB);
        } else if (rpn === "-") {
            stackList.push(stackA - stackB);
        } else if (rpn === "*") {
            stackList.push(stackA * stackB);
        } else if (rpn === "/") {
            stackList.push(stackA / stackB);
        } else if (rpn === "^") {
            stackList.push(Math.pow(stackA, stackB));
        } else {
            throw new Error(`Unknown operator ${String(rpn)}`);
        }
    }

    if (stackList.length !== 1) {
        throw new Error("Remaining operands.");
    }

    return stackList[0];
};

export const execute = (input: string): string => {
    const tokenList = tokenize(input);
    const rpnList = toRpn(tokenList);

    return evaluate(rpnList).toString();
};
