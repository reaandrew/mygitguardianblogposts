import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import metadata from "./metadata.js";

let SHORT_DELAY = true;
const LONG_DELAY_MS = 100;
const SHORT_DELAY_MS = 50;

const create = () => {
  const mcpServer = new McpServer({
    name: "demo-mcp-server",
    version: metadata.version
  }, {
    capabilities: {
      tools: {}
    }
  });

  mcpServer.tool("ping", async () => {
    const startTime = Date.now();
    SHORT_DELAY=!SHORT_DELAY;

    if (SHORT_DELAY){
      await new Promise((resolve) => setTimeout(resolve, SHORT_DELAY_MS));
    } else {
      await new Promise((resolve) => setTimeout(resolve, LONG_DELAY_MS));
    }
    const duration = Date.now() - startTime;

    return {
      content: [
        {
          type: "text",
          text: `pong! logStream=${metadata.logStreamName} v=${metadata.version} d=${duration}`
        }
      ]
    }
  });
  
  mcpServer.tool("fetch-file",
    "A tool to fetch file content",
    {
      file_key: z.string().describe('The key of the file to fetch')
    },
    async (input) => {
      console.log('Fetch file input:', JSON.stringify(input, null, 2));
      return {
        content: [
          {
            type: "text",
            text: "Some dummy file content"
          }
        ]
      }
    }, {
      parameters: {
        type: "object",
        properties: {
          file_key: {
            type: "string",
            description: "The key of the file to fetch"
          }
        },
        required: ["file_key"]
      }
    });

  return mcpServer
};

export default { create };
