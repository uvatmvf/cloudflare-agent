import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  stepCountIs,
  generateText  
} from "ai";

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  // Wait for MCP connections to be re-established after hibernation before
  // processing a message, so MCP tools aren't intermittently missing.
  waitForMcpConnections = true;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = await generateText({
          model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct", {
              sessionAffinity: this.sessionAffinity
          }),
          system: `You are an Architecture Decision Agent.

Your role is to help a software architect work through an architecture decision collaboratively.

Do not jump immediately to a solution.

Instead:
- identify the problem being solved
- identify explicit requirements
- identify constraints and assumptions
- ask focused questions when important information is missing
- surface meaningful architecture alternatives
- explain tradeoffs
- make recommendations only when there is enough information

When the user provides architecture context, summarize what you have learned using these categories when useful:

Problem
Requirements
Constraints
Assumptions
Open Questions

Keep responses concise and practical.

Treat the user as the decision maker. Your job is to facilitate and structure architectural reasoning, not replace human judgment.
    `,
      // Prune old tool calls and reasoning to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

      },
      stopWhen: stepCountIs(20),
      abortSignal: options?.abortSignal
    });

    const stream = createUIMessageStream({
          execute: ({ writer }) => {
              const id = crypto.randomUUID();

              writer.write({ type: "text-start", id });
              writer.write({ type: "text-delta", id, delta: result.text });
              writer.write({ type: "text-end", id });
          }
      });

      return createUIMessageStreamResponse({ stream });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
