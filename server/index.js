import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, "workspace");
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_PORT ?? "3000");
const MCP_PATH = "/mcp";

if (!Number.isInteger(PORT) || PORT <= 0) {
    throw new Error("MCP_PORT must be a valid positive integer.");
}

const app = createMcpExpressApp({ host: HOST });
const transports = new Map();
const servers = new Map();

const log = (message) => {
    console.error(`[${new Date().toISOString()}] ${message}`);
};

const sendJsonRpcError = (res, statusCode, message, code = -32603) => {
    if (res.headersSent) {
        return;
    }

    res.status(statusCode).json({
        jsonrpc: "2.0",
        error: {
            code,
            message
        },
        id: null
    });
};

const resolveWorkspacePath = (fileName) => {
    const targetPath = path.resolve(BASE_DIR, fileName);
    const relativePath = path.relative(BASE_DIR, targetPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("File access outside the workspace directory is not allowed.");
    }

    return targetPath;
};

const createMcpApplicationServer = () => {
    const server = new McpServer({
        name: "mcp-node",
        version: "1.0.0"
    });

    server.registerTool(
        "list_files",
        {
            title: "List",
            description: "Lists all the files in workspace directory"
        },
        async () => {
            const files = await fs.readdir(BASE_DIR);

            return {
                content: [{ type: "text", text: JSON.stringify(files, null, 2) }]
            };
        }
    );

    server.registerTool(
        "read_file",
        {
            title: "Read",
            description: "Read file contents",
            inputSchema: {
                fileName: z.string().describe("Name of the file")
            }
        },
        async ({ fileName }) => {
            const filePath = resolveWorkspacePath(fileName);
            const content = await fs.readFile(filePath, "utf-8");

            return {
                content: [{ type: "text", text: content }]
            };
        }
    );

    server.registerTool(
        "write_file",
        {
            title: "Write",
            description: "Writes in a file",
            inputSchema: {
                fileName: z.string().describe("Name of the file"),
                content: z.string().describe("Content of those files")
            }
        },
        async ({ fileName, content }) => {
            const filePath = resolveWorkspacePath(fileName);
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, content);

            return {
                content: [{ type: "text", text: `Wrote ${fileName}` }]
            };
        }
    );

    server.registerTool(
        "create_file",
        {
            title: "Create",
            description: "Create a new file",
            inputSchema: {
                fileName: z.string().describe("Name of the file to be created")
            }
        },
        async ({ fileName }) => {
            const filePath = resolveWorkspacePath(fileName);
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, "");

            return {
                content: [{ type: "text", text: `Created ${fileName}` }]
            };
        }
    );

    return server;
};

const getSessionIdFromRequest = (req) => {
    return typeof req.headers["mcp-session-id"] === "string"
        ? req.headers["mcp-session-id"]
        : undefined;
};

const removeSession = async (sessionId) => {
    const server = servers.get(sessionId);

    transports.delete(sessionId);
    servers.delete(sessionId);

    if (server) {
        await server.close();
    }
};

const closeSession = async (sessionId) => {
    const transport = transports.get(sessionId);

    if (transport) {
        await transport.close();
        return;
    }

    await removeSession(sessionId);
};

const createSessionTransport = async (req, res) => {
    if (!isInitializeRequest(req.body)) {
        sendJsonRpcError(res, 400, "Bad Request: No valid session ID provided", -32000);
        return undefined;
    }

    const server = createMcpApplicationServer();
    let transport;

    transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
            transports.set(sessionId, transport);
            servers.set(sessionId, server);
            log(`Session initialized: ${sessionId}`);
        }
    });

    transport.onerror = (error) => {
        log(`Transport error: ${error instanceof Error ? error.message : String(error)}`);
    };

    transport.onclose = () => {
        const sessionId = transport.sessionId;

        if (sessionId) {
            void removeSession(sessionId);
            log(`Session closed: ${sessionId}`);
        }
    };

    await server.connect(transport);
    return transport;
};

const handlePostMcpRequest = async (req, res) => {
    const sessionId = getSessionIdFromRequest(req);

    try {
        let transport = sessionId ? transports.get(sessionId) : undefined;

        if (!transport) {
            if (sessionId) {
                sendJsonRpcError(res, 400, "Bad Request: No valid session ID provided", -32000);
                return;
            }

            transport = await createSessionTransport(req, res);
            if (!transport) {
                return;
            }
        }

        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        log(`Failed to handle MCP POST request: ${error instanceof Error ? error.message : String(error)}`);
        sendJsonRpcError(res, 500, "Internal server error");
    }
};

const handleGetMcpRequest = async (req, res) => {
    const sessionId = getSessionIdFromRequest(req);
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
        res.status(400).send("Invalid or missing session ID");
        return;
    }

    try {
        await transport.handleRequest(req, res);
    } catch (error) {
        log(`Failed to handle MCP GET request: ${error instanceof Error ? error.message : String(error)}`);

        if (!res.headersSent) {
            res.status(500).send("Internal server error");
        }
    }
};

const handleDeleteMcpRequest = async (req, res) => {
    const sessionId = getSessionIdFromRequest(req);
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
        res.status(400).send("Invalid or missing session ID");
        return;
    }

    try {
        await transport.handleRequest(req, res);
    } catch (error) {
        log(`Failed to handle MCP DELETE request: ${error instanceof Error ? error.message : String(error)}`);

        if (!res.headersSent) {
            res.status(500).send("Internal server error");
        }
    }
};

const shutdown = async (httpServer) => {
    log("Shutting down MCP server");

    for (const sessionId of [...transports.keys()]) {
        await closeSession(sessionId);
    }

    await new Promise((resolve, reject) => {
        httpServer.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
};

await fs.ensureDir(BASE_DIR);

app.post(MCP_PATH, handlePostMcpRequest);
app.get(MCP_PATH, handleGetMcpRequest);
app.delete(MCP_PATH, handleDeleteMcpRequest);

const httpServer = app.listen(PORT, HOST, (error) => {
    if (error) {
        log(`Failed to start MCP server: ${error.message}`);
        process.exit(1);
    }

    log(`MCP Streamable HTTP server listening on http://${HOST}:${PORT}${MCP_PATH}`);
});

process.on("SIGINT", async () => {
    try {
        await shutdown(httpServer);
    } catch (error) {
        log(`Shutdown error: ${error instanceof Error ? error.message : String(error)}`);
    }

    process.exit(0);
});
