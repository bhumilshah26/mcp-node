import fs from "fs-extra";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
    name: "mcp-node",
    version: "1.0.0"
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, "workspace");

function logToTerminal(message) {
    console.error(`[${new Date().toISOString()}] ${message}`);
}


// Tool 1: list files
server.registerTool("list_files", {
        title: "List",
        description: "Lists all the files in workspace directory",
    },
    async () => {
        const files = await fs.readdir(BASE_DIR);
        return {
            content: [{ type: "text", text: JSON.stringify(files, null, 2) }]
        };
    }
);

// Tool 2: read file
server.registerTool("read_file", {
        title: "Read",
        description: "Read file contents",
        inputSchema: {
            fileName: z.string().describe("Name of the file")
        }
    },
    async ({ fileName }) => {
        const filepath = path.join(BASE_DIR, fileName)
        const content = await fs.readFile(filepath, "utf-8");
        return {
            content: [{ type: "text", text: content }]
        };
    }
);

// Tool 3: write file
server.registerTool("write_file", {
        title: "Write",
        description: "Writes in a file",
        inputSchema: {
            fileName: z.string().describe("Name of the file"),
            content: z.string().describe("Content of those files")
        },
        
    },
    async ({ fileName, content }) => {
        const filepath = path.join(BASE_DIR, fileName);
        await fs.writeFile(filepath, content);
        return {
            content: [{ type: "text", text: `Wrote ${fileName}` }]
        };
    }
);

// Tool 4: create file 
server.registerTool("create_file", {
        title: "create",
        description: "Create a new file",
        inputSchema: {
            fileName: z.string().describe("Name of the file to be created")
        },
    },
    async ({ fileName }) => {
        const filepath = path.join(BASE_DIR, fileName)
        await fs.writeFile(filepath, "");
        return {
            content: [{ type: "text", text: `Created ${fileName}` }]
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    
    server.server.oninitialized = () => {
        const client = server.server.getClientVersion();
        const clientLabel = client
            ? `${client.name} ${client.version}`
            : "Unknown MCP client";

        logToTerminal(`Client connected: ${clientLabel}`);
    };

    transport.onclose = () => {
        logToTerminal("Client disconnected");
    };

    await server.connect(transport);
    logToTerminal("MCP server is up and running");
};

main();