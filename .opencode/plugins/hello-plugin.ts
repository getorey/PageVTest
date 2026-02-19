import { type Plugin, tool } from "@opencode-ai/plugin"

export const HelloPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "hello-plugin", level: "info", message: "INIT" },
  })

  return {
    tool: {
      hello_tool: tool({
        description: "Say hello",
        args: {
          name: tool.schema.string().describe("Name to greet"),
        },
        async execute(args) {
          return `Hello, ${args.name}!`
        },
      }),
    },

    "tool.execute.before": async (input, output) => {
      if (input.tool === "hello_tool") {
        await client.app.log({
          body: {
            service: "hello-plugin",
            level: "debug",
            message: "before hello_tool",
            extra: { args: output.args },
          },
        })
      }
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool === "hello_tool") {
        await client.app.log({
          body: {
            service: "hello-plugin",
            level: "debug",
            message: "after hello_tool",
            extra: { result: output.result },
          },
        })
      }
    },
  }
}

export default HelloPlugin
