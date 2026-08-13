import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
    type ArchitectureDecisionState,
    initialDecisionState
} from "./architecture";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  stepCountIs,
    generateText,
    tool
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env, ArchitectureDecisionState> {
  maxPersistedMessages = 100;
    chatRecovery = true;
    initialState = initialDecisionState;
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

  @callable()
  updateDecisionTitle(title: string) {
    this.setState({
        ...this.state,
         title
    });

    return this.state;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

      const result = await generateText({
          model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
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

When the latest user message contains new architectural facts:
- call updateDecisionState exactly once
- persist only facts supported by the user's actual statements
- do not invent generic requirements such as scalability, reliability, performance, security, or availability unless the user actually expressed them
- after updateDecisionState succeeds, do not call it again during the same turn
- after the tool succeeds, always produce a concise conversational text response
- ask only the next 2-3 highest-value questions

Never end a turn immediately after calling updateDecisionState.
`,

          messages: pruneMessages({
              messages: await convertToModelMessages(this.messages),
              toolCalls: "before-last-2-messages",
              reasoning: "before-last-message"
          }),

          tools: {
              ...mcpTools,

              updateDecisionState: tool({
                  description: `Persist architecture facts from the user's latest message.

Call this tool at most once per user message.

Persist only facts directly stated or strongly implied by the user's words.

Do not add generic architecture qualities such as scalability, reliability,
performance, security, or availability unless the user actually expressed them.

After this tool succeeds, do not call it again during this turn.
Respond to the user in text.`,

                  inputSchema: z.object({
                      problem: z.string().optional(),
                      requirements: z.array(z.string()).optional(),
                      constraints: z.array(z.string()).optional(),
                      assumptions: z.array(z.string()).optional(),
                      openQuestions: z.array(z.string()).optional()
                  }),

                  execute: async ({
                      problem,
                      requirements,
                      constraints,
                      assumptions,
                      openQuestions
                  }) => {
                      const unique = (values: string[]) =>
                          [...new Set(values.map((v) => v.trim()).filter(Boolean))];

                      const nextState = {
                          ...this.state,

                          problem: problem?.trim() || this.state.problem,

                          requirements: unique([
                              ...this.state.requirements,
                              ...(requirements ?? [])
                          ]),

                          constraints: unique([
                              ...this.state.constraints,
                              ...(constraints ?? [])
                          ]),

                          assumptions: unique([
                              ...this.state.assumptions,
                              ...(assumptions ?? [])
                          ]),

                          openQuestions: unique([
                              ...this.state.openQuestions,
                              ...(openQuestions ?? [])
                          ])
                      };

                      this.setState(nextState);

                      return {
                          success: true,
                          instruction:
                              "Architecture decision state was persisted successfully. Do not call updateDecisionState again this turn. Now respond to the user in text."
                      };
                  }
              })
          },

          stopWhen: stepCountIs(2)
      });
 
      console.log("RESULT TEXT:", result.text);
      console.log(
          "STEPS:",
          result.steps.map((step, i) => ({
              step: i,
              text: step.text,
              toolCalls: step.toolCalls,
              toolResults: step.toolResults
          }))
      );
    console.log("CURRENT MESSAGES:", JSON.stringify(this.messages, null, 2));

      let responseText = result.text;

      if (!responseText.trim()) {
          const responseResult = await generateText({
              model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                  sessionAffinity: this.sessionAffinity
              }),

              system: `You are an Architecture Decision Agent.

The architecture decision state has already been updated.

Respond conversationally to the user's latest message.

Briefly summarize what you understood and ask the next 2-3
highest-value architecture questions.

Do not call tools.
Do not invent requirements or constraints.
Do not jump immediately to a solution.

Current architecture decision state:
${JSON.stringify(this.state, null, 2)}
`,

              messages: await convertToModelMessages(this.messages)
          });

          responseText = responseResult.text;
      }

      console.log("RESULT TEXT:", result.text);
      console.log("RESPONSE TEXT:", responseText);

      const stream = createUIMessageStream({
          execute: ({ writer }) => {
              const id = crypto.randomUUID();

              writer.write({ type: "text-start", id });

              writer.write({
                  type: "text-delta",
                  id,
                  delta: responseText
              });

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
