import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { OpenAI } from "openai";
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in the .env file");
}

const openai = new OpenAI({ apiKey });

const transport = new StdioClientTransport({
    command: "node",
    args: ["./server/index.js"]
});

const client = new Client(
    {
        name: "client-1",
        version: "1.0.0"
    },
    {
        capabilities: {}
    }
);

function formatMcpToolsForOpenAI(mcpTools) {
    return mcpTools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description ?? tool.title ?? `Run the ${tool.name} tool`,
            parameters: tool.inputSchema ?? {
                type: "object",
                properties: {}
            }
        }
    }));
}

async function connectAndGetTools() {
    await client.connect(transport);

    const { tools } = await client.listTools();
    console.log("Available tools:", tools.map((tool) => tool.name).join(", ") || "(none)");

    return tools;
}

async function runClientWithAgent() {
    const mcpTools = await connectAndGetTools();
    const openAITools = formatMcpToolsForOpenAI(mcpTools);

    const messages = [
        {
            role: "user",
            content: "List all the files in the workspace directory"
        }
    ];

    const firstResponse = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        tools: openAITools
    });

    const assistantMessage = firstResponse.choices[0]?.message;

    if (!assistantMessage) {
        throw new Error("OpenAI did not return a message");
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];

    for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
            continue;
        }

        const args = toolCall.function.arguments
            ? JSON.parse(toolCall.function.arguments)
            : {};

        const result = await client.callTool({
            name: toolCall.function.name,
            arguments: args
        });

        const toolText = result.content
            ?.filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n") ?? "Tool executed successfully.";

        messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolText
        });
    }

    if (toolCalls.length === 0) {
        console.log("Response:", assistantMessage.content ?? "No response content");
        return;
    }

    const finalResponse = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages
    });

    console.log("Final response:", finalResponse.choices[0]?.message?.content ?? "No response content");
}

runClientWithAgent().catch(console.error)
