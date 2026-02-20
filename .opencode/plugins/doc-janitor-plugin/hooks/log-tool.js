export function createLogToolHooks(toolNames) {
    return {
        before: async (evt) => {
            const toolName = evt?.tool?.name ?? evt?.name;
            if (toolName && toolNames.includes(toolName)) {
                const args = evt?.input ?? evt?.args ?? {};
                console.log(`[local-plugin][before] ${toolName} args:`, args);
            }
        },
        after: async (evt) => {
            const toolName = evt?.tool?.name ?? evt?.name;
            if (toolName && toolNames.includes(toolName)) {
                const result = evt?.output ?? evt?.result ?? evt;
                console.log(`[local-plugin][after] ${toolName} result:`, result);
            }
        }
    };
}
//# sourceMappingURL=log-tool.js.map