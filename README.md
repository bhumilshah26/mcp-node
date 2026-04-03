# Mcp Server in Node.js

## What this project does

This project demonstrates an MCP server built using `@modelcontextprotocol/sdk` and `stdio`, along with `OpenAI` integration on the client side to showcase how AI tools can access file system operations.


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

1) Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
```
2) Create a folder named 'workspace':

```bash
mkdir workspace
```

3) Start the MCP server directly:

```bash
npm run server
```

4) Start the client (change the content in messages array to get varied outputs):

```bash
npm run client
```

## To inspect the MCP Server with a inspection-based UI
1) Launch the MCP Inspector:

```bash
npm run inspect
```

2) Click on the connect button to connect to the MCP Server (Check the session token and config details):

3) List all the tools and choose whichever tool you wish to call on the McpServer