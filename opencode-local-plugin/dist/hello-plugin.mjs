import { z } from "zod";
const hello_tool = {
    description: "Say hello",
    args: {
        name: z.string().describe("Name to greet"),
    },
    async execute(args) {
        return `Hello, ${args.name}!`;
    },
};
const plugin = async () => {
    // 로딩/초기화 확인
    console.log("[hello-plugin] INIT");
    return {
        tool: {
            hello_tool: hello_tool,
        },
        // 일단 raw로 찍기 (훅 payload가 버전마다 다를 수 있음)
        "tool.execute.before": async (evt) => {
            console.log("[hello-plugin][before] raw =", evt);
        },
        "tool.execute.after": async (evt) => {
            console.log("[hello-plugin][after] raw =", evt);
        },
        // chat 훅도 유지
        "chat.message": async (_evt) => {
            console.log("[hello-plugin] chat.message ok");
        },
    };
};
export default plugin;
//# sourceMappingURL=index.js.map