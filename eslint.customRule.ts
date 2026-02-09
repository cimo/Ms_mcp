import { TSESLint, TSESTree, ESLintUtils } from "@typescript-eslint/utils";

const rules = {
    "no-array-assignment-for-object-type": {
        meta: {
            type: "problem",
            docs: {
                description: "Safe array assignment for object type.",
                recommended: false
            },
            messages: {
                noArrayAssignmentForObjectType: "Array assign for object type is disallowed."
            },
            schema: []
        },
        create(context: TSESLint.RuleContext<"noArrayAssignmentForObjectType", []>) {
            const parserServices = ESLintUtils.getParserServices(context);

            return {
                TSArrayType(node: TSESTree.TSArrayType) {
                    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node.elementType);
                    const checker = parserServices.program.getTypeChecker();
                    const type = checker.getTypeAtLocation(tsNode);

                    const indexType = type.getStringIndexType();

                    if (indexType) {
                        context.report({
                            node,
                            messageId: "noArrayAssignmentForObjectType"
                        });
                    }
                }
            };
        }
    }
};

export default { rules };
