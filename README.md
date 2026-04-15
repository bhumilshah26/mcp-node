# Mcp Server in Node.js

## What this project does

This project demonstrates an MCP server built using `@modelcontextprotocol/sdk` and `StreamableHTTPClientTransport`, along with `OpenAI` integration on the client side to showcase how AI tools can access file system operations.


The server works inside the local `workspace/` folder and exposes these tools:

- `list_files`
- `read_file`
- `write_file`
- `create_file`

## Installation

Install dependencies:

```bash
npm install
```

## Steps to run the project (You must have a folder named 'workspace')
### Note: Can directly start to run the project atfer cloning using `npm install && npm run inspect` commands !!!

1) Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
```
2) Create a folder named 'workspace':

```bash
cd server
mkdir workspace
```

3) Install dependencies: 

```bash
npm install
```

4) Start the MCP server directly:

```bash
npm run server
```

5) Start the client (change the content in messages array to get varied outputs):

```bash
npm run client
```

## To run the MCP Server with a inspection-based UI
1) Launch the server:
```bash
npm run server
```

2) Launch the MCP Inspector:

```bash
npm run inspect
```

3) Click on the connect button to connect to the MCP Server (Check the session token and config details):

4) List all the tools and choose whichever tool you wish to call on the McpServer