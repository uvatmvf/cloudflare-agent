import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
    type ArchitectureDecisionState,
    type ArchitectureRecommendation,
  initialDecisionState,
} from "./architecture";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  stepCountIs,
  generateText,
  tool,
} from "ai";
import { z } from "zod";

const architectureAlternativeSchema = z.object({
  name: z.string(),
  summary: z.string(),
  strengths: z.array(z.string()),
  tradeoffs: z.array(z.string()),
});

const alternativesResponseSchema = z.object({
  alternatives: z.array(architectureAlternativeSchema).min(2).max(4),
});

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
            status: 200,
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 },
        );
      },
    });
  }

  @callable()
  resetDecision() {
    this.setState(initialDecisionState);
    return this.state;
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
      title,
    });

    return this.state;
  }

  @callable()
  async analyzeOptions() {
    if (!this.state.problem.trim()) {
      throw new Error(
        "Cannot analyze alternatives until the problem has been defined.",
      );
    }

    const workersai = createWorkersAI({ binding: this.env.AI });

    this.setState({
      ...this.state,
      status: "analyzing",
    });

    try {
      const result = await generateText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          sessionAffinity: this.sessionAffinity,
        }),

        system: `You are an Architecture Decision Agent.

Generate 2 to 4 meaningful architecture alternatives for the
architecture decision below.

Each alternative must represent a materially different approach.

Evaluate each alternative against the actual requirements and
constraints in the decision state.

Do not invent requirements or constraints.
Do not select a final recommendation yet.

Return ONLY valid JSON. Do not use Markdown or code fences.

{
  "alternatives": [
    {
      "name": "Alternative name",
      "summary": "Short description",
      "strengths": ["strength"],
      "tradeoffs": ["tradeoff"]
    }
  ]
}

Architecture decision state:
${JSON.stringify(this.state, null, 2)}
`,

        prompt: "Generate architecture alternatives.",
      });

      console.log("ALTERNATIVES RAW:", result.text);

      const cleanedText = result.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      const parsedJson = JSON.parse(cleanedText);
      const parsed = alternativesResponseSchema.parse(parsedJson);

      const nextState: ArchitectureDecisionState = {
        ...this.state,
        alternatives: parsed.alternatives,
        status: "analyzing",
      };

      this.setState(nextState);

      return nextState;
    } catch (error) {
      this.setState({
        ...this.state,
        status: "discovery",
      });

      console.error("Architecture option analysis failed:", error);
      throw error;
    }
  }

    @callable()
    async generateRecommendation() {
        if (!this.state.problem.trim()) {
            throw new Error(
                "Cannot generate a recommendation until the problem has been defined."
            );
        }

        if (!this.state.alternatives.length) {
            throw new Error(
                "Cannot generate a recommendation until alternatives have been analyzed."
            );
        }

        const workersai = createWorkersAI({ binding: this.env.AI });

        const result = await generateText({
            model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                sessionAffinity: this.sessionAffinity
            }),

            system: `You are an Architecture Decision Agent.

Select the strongest architecture alternative from the alternatives
already present in the architecture decision state.

Base the recommendation only on the stated problem, requirements,
constraints, assumptions, and alternatives.

Do not invent new requirements or constraints.

Explain why the selected alternative is the best fit for this
specific decision.

Explicitly identify the important tradeoffs being accepted.

Return ONLY valid JSON in this exact shape:

{
  "alternative": "Exact alternative name",
  "rationale": "Concise explanation of why this alternative is preferred",
  "acceptedTradeoffs": [
    "Tradeoff being accepted"
  ]
}

Current architecture decision state:
${JSON.stringify(this.state, null, 2)}
`,

            prompt: "Generate the architecture recommendation."
        });

        const parsed = JSON.parse(result.text) as ArchitectureRecommendation;

        const nextState: ArchitectureDecisionState = {
            ...this.state,
            recommendation: parsed,
            status: "recommended"
        };

        this.setState(nextState);

        return nextState;
    }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = await generateText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        sessionAffinity: this.sessionAffinity,
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
Classify each fact into exactly one category.

Requirements:
Capabilities or qualities the solution must satisfy.

Constraints:
External limitations that restrict solution choices, such as team size,
budget, mandated technology, regulation, or existing infrastructure.

Assumptions:
Things believed to be true but not yet confirmed.

Open Questions:
Important unknowns that materially affect the decision.

Do not store the same fact in more than one category.
Prefer concise canonical wording.
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
        reasoning: "before-last-message",
      }),

      tools: {
        ...mcpTools,

        updateDecisionState: tool({
          description: `Persist architecture facts from the user's latest message.
                  Classify each fact into exactly one category.

Requirements:
Capabilities or qualities the solution must satisfy.

Constraints:
External limitations that restrict solution choices, such as team size,
budget, mandated technologies, regulations, or existing infrastructure.

Assumptions:
Things believed to be true but not yet confirmed.

Open Questions:
Important unknowns that materially affect the architecture decision.

Do not place the same fact in multiple categories.
Prefer concise canonical wording.
Persist only facts stated or strongly implied by the user.
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
            openQuestions: z.array(z.string()).optional(),
          }),

          execute: async ({
            problem,
            requirements,
            constraints,
            assumptions,
            openQuestions,
          }) => {
            const unique = (values: string[]) => [
              ...new Set(values.map((v) => v.trim()).filter(Boolean)),
            ];

            const nextState = {
              ...this.state,

              problem: problem?.trim() || this.state.problem,

              requirements: unique([
                ...this.state.requirements,
                ...(requirements ?? []),
              ]),

              constraints: unique([
                ...this.state.constraints,
                ...(constraints ?? []),
              ]),

              assumptions: unique([
                ...this.state.assumptions,
                ...(assumptions ?? []),
              ]),

              openQuestions: unique([
                ...this.state.openQuestions,
                ...(openQuestions ?? []),
              ]),
            };

            this.setState(nextState);

            return {
              success: true,
              instruction:
                "Architecture decision state was persisted successfully. Do not call updateDecisionState again this turn. Now respond to the user in text.",
            };
          },
        }),
      },

      stopWhen: stepCountIs(2),
    });

    console.log("RESULT TEXT:", result.text);
    console.log(
      "STEPS:",
      result.steps.map((step, i) => ({
        step: i,
        text: step.text,
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
      })),
    );
    console.log("CURRENT MESSAGES:", JSON.stringify(this.messages, null, 2));

    let responseText = result.text;

    if (!responseText.trim()) {
      const responseResult = await generateText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          sessionAffinity: this.sessionAffinity,
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

        messages: await convertToModelMessages(this.messages),
      });

      responseText = responseResult.text;
    }

    console.log("RESPONSE TEXT:", responseText);

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const id = crypto.randomUUID();

        writer.write({ type: "text-start", id });

        writer.write({
          type: "text-delta",
          id,
          delta: responseText,
        });

        writer.write({ type: "text-end", id });
      },
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
  },
} satisfies ExportedHandler<Env>;
