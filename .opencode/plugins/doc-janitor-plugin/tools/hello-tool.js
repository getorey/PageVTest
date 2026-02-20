export const helloTool = {
    name: "hello_tool",
    description: "Say hello. Returns a greeting string.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Name to greet" }
        },
        required: ["name"]
    },
    async execute(input) {
        const name = String(input?.name ?? "world");
        return `Hello, ${name}!`;
    }
};
//# sourceMappingURL=hello-tool.js.map