import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT_URL = process.env.MCP_SERVER_ENDPOINT || 'http://localhost:3000/mcp';
// Change to good_access_token for successful authorization when authorization is enabled
const fake_token = 'bad_access_token'; 

console.log(`Connecting ENDPOINT_URL=${ENDPOINT_URL}`);

const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT_URL), {
    requestInit: {
        headers: {
            'Authorization': `Bearer ${fake_token}`
        }
    }
});

const client = new Client({
    name: "node-client",
    version: "0.0.1"
})

await client.connect(transport);
console.log('connected');

const tools = await client.listTools();
console.log(`listTools response: `, tools);

for (let i = 0; i < 2; i++) {
    let result = await client.callTool({
        name: "ping"
    });
    console.log(`callTool:ping response: `, result);
}

// Call the fetch-file tool
const fetchFileCall = {
    name: "fetch-file",
    arguments: {
        file_key: "example-document.txt"
    }
};
console.log('Calling fetch-file with:', JSON.stringify(fetchFileCall, null, 2));
let fetchFileResult = await client.callTool(fetchFileCall);
console.log(`callTool:fetch-file response: `, fetchFileResult);

await client.close();
