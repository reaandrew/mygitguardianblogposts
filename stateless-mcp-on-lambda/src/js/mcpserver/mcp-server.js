import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import metadata from "./metadata.js";
import fs from 'fs';
import { gitguardian_wrapper } from 'secure-llm-libs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

let SHORT_DELAY = true;
const LONG_DELAY_MS = 100;
const SHORT_DELAY_MS = 50;

// Initialize the SSM client
const ssmClient = new SSMClient();

/**
 * Fetches the GitGuardian API key from SSM Parameter Store
 * @returns {Promise<string>} The API key
 */
async function getGitGuardianApiKey() {
    const command = new GetParameterCommand({
        Name: '/ara/gitguardian/apikey/scan',
        WithDecryption: true
    });

    const response = await ssmClient.send(command);
    return response.Parameter.Value;
}

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

            // Always use output.json regardless of file_key argument
            const filePath = './output.json';

            try {
                // Read the file content
                const fileContent = fs.readFileSync(filePath, 'utf8');

                // Get API key from SSM Parameter Store
                const apiKey = await getGitGuardianApiKey();

                // Scan the content with GitGuardian
                const { content: redactedContent, redactions } = await gitguardian_wrapper.scan(fileContent, apiKey, { filename: 'output.json' });

                // Log any detected sensitive information
                if (redactions && redactions.length > 0) {
                    console.log('GitGuardian scan found sensitive content:', {
                        redactions_count: redactions.length,
                        policies: redactions.map(r => r.policy).filter((v, i, a) => a.indexOf(v) === i)
                    });

                    // Log each policy type separately for detailed monitoring
                    const policyCounts = redactions.reduce((acc, redaction) => {
                        const policy = redaction.policy || 'unknown';
                        acc[policy] = (acc[policy] || 0) + 1;
                        return acc;
                    }, {});

                    Object.entries(policyCounts).forEach(([policy, count]) => {
                        console.log({
                            security_event: true,
                            type: 'sensitive_data_detected',
                            policy: policy,
                            matches: count,
                            severity: 'medium'
                        });
                    });
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: redactedContent
                        }
                    ]
                };
            } catch (error) {
                console.error('Error scanning file content:', error);
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error processing file content: " + error.message
                        }
                    ]
                };
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
