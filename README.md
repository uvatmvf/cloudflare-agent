# Architecture Decision Agent

A small, production-minded AI application built on Cloudflare's Agents
SDK and Workers AI. The agent turns an architecture conversation into
durable decision state, analyzes competing approaches, recommends an
option with explicit tradeoffs, and supports a human-in-the-loop
decision workflow.

The project was built as a focused demonstration of the core
capabilities of an AI-powered Cloudflare application:

-   **LLM:** Cloudflare Workers AI using Llama
-   **Coordination:** Cloudflare Agents SDK with explicit decision
    lifecycle actions
-   **User input:** Interactive chat UI
-   **Memory / state:** Durable agent state for the architecture
    decision
-   **Human in the loop:** The user explicitly analyzes, reviews, and
    accepts the decision

## What It Does

The agent begins in **discovery** mode. A user describes an architecture
problem conversationally, and the agent captures the important facts as
structured state rather than treating chat history as the system of
record.

The decision progresses through a simple lifecycle:

``` text
Discovery
   ↓
Analyze Options
   ↓
Analyzing
   ↓
Generate Recommendation
   ↓
Recommended
   ↓
Accept Decision
   ↓
Accepted ADR
```

The durable decision model captures:

-   Problem
-   Requirements
-   Constraints
-   Assumptions
-   Open questions
-   Architecture alternatives
-   Strengths and tradeoffs for each alternative
-   Recommendation and rationale
-   Accepted tradeoffs
-   Final ADR state

This intentionally separates **conversation** from **application
state**: the LLM interprets natural language, while the agent owns the
durable architecture decision.

## Demo Flow

A useful demo starts with:

> We need to build a system that processes documents uploaded by
> customers. Traffic can be very bursty, and some documents may take
> several minutes to process.

Then add important decision drivers:

> We absolutely cannot lose a document. Some documents contain sensitive
> customer information. We also have a small platform team, so
> operational simplicity matters.

From there:

1.  Review the facts captured in the Architecture Decision panel.
2.  Select **Analyze Options** to generate competing architecture
    approaches.
3.  Review each option's strengths and tradeoffs.
4.  Select **Generate Recommendation** to choose the strongest
    alternative against the stored decision drivers.
5.  Review the rationale and explicitly accepted tradeoffs.
6.  Select **Accept Decision** to finalize the ADR.
7.  Refresh/reconnect to verify that the decision state persists.

The prompts are intentionally replaceable. The same workflow can be
exercised with other architecture problems.

## Screenshots

### Analyze & Recommend

<img width="712" height="1802" alt="Architecture Decision Agent showing analyzed alternatives and recommendation" src="https://github.com/user-attachments/assets/13b24347-cc48-422e-bc94-28db5721bb5e" />

### Architecture Decision Record

<img width="655" height="344" alt="Final architecture decision record" src="https://github.com/user-attachments/assets/b8aad30c-c388-4332-8a75-208e5dc188f4" />

## Architecture

At a high level:

``` text
Browser / Chat UI
       │
       ▼
Cloudflare Agent
       │
       ├── Durable architecture decision state
       │
       ├── Discovery / state update
       │
       ├── Analyze Options
       │
       ├── Generate Recommendation
       │
       └── Accept Decision
       │
       ▼
Workers AI / Llama
```

The LLM is used where interpretation or architectural reasoning is
valuable. Deterministic lifecycle operations---such as accepting a
recommendation---remain application actions rather than LLM decisions.

## Design Choices

### Structured state instead of chat-as-memory

Architecture facts are persisted as typed agent state. The UI renders
that state directly, which keeps the decision model independent from the
prose generated in the conversation.

### Explicit workflow transitions

Analysis and recommendation are user-triggered actions. This makes the
workflow visible and keeps the human in control rather than allowing the
model to silently finalize architectural decisions.

### Alternatives before recommendations

The agent first generates materially different approaches and their
tradeoffs. Recommendation is a separate step that evaluates those
alternatives against the stored problem, requirements, and constraints.

### Intentionally small scope

The submission focuses on a coherent end-to-end workflow rather than
adding unrelated integrations. The goal is to demonstrate LLM reasoning,
coordination, durable state, and human decision-making with a small
amount of application code.

## Known Issue: Streaming Responses

During development, incremental Workers AI responses produced duplicated
partial content when passed through the current Agents SDK chat
streaming path. The same prompts returned clean completed output with
non-streaming generation.

To preserve correctness while retaining the agent architecture, this
application currently uses completed/non-streaming generation and
returns the resulting assistant message through the chat UI.

This was isolated during development by:

-   testing multiple Workers AI models;
-   removing the Markdown renderer from the path;
-   disabling chat recovery/resume behavior;
-   simplifying the client chat configuration; and
-   comparing streaming output with completed `generateText()` output.

The completed model response was clean, isolating the behavior to the
streaming integration rather than the prompt or model inference.

## Why This Is an Agent

The application does more than send a prompt to an LLM. It maintains a
durable decision model and coordinates a multi-step process:

``` text
Natural-language input
        ↓
Interpret architecture facts
        ↓
Persist decision state
        ↓
Generate alternatives
        ↓
Evaluate alternatives
        ↓
Recommend with tradeoffs
        ↓
Human acceptance
        ↓
Persist final ADR
```

The LLM supplies interpretation and reasoning; the agent supplies
identity, state, coordination, and lifecycle.

## Future Improvements

The intentionally small implementation leaves several natural
extensions:

-   Semantic normalization of near-duplicate requirements
-   Stronger structured-output validation and recovery
-   Markdown or document export of the final ADR
-   Authentication and per-user/per-team decision ownership
-   Additional architecture evaluation criteria
-   Re-enable token streaming when the streaming integration is reliable
-   Observability for model calls, decision transitions, and failures

## Running the Project

Install dependencies and start the local development server:

``` bash
npm install
npm run dev
```

Use the application in the browser, enter an architecture problem, and
follow the decision workflow shown above.

# AI-Assited Development 
This project was developed with AI-assisted engineering using ChatGPT.

The development conversation includes the initial architecture discussion,
incremental implementation, debugging of the Agents SDK / Workers AI streaming
path, durable state design, alternatives analysis, recommendation workflow,
and final UI refinement.

[Development conversation](https://chatgpt.com/share/6a7e3c40-60cc-83e8-a5f0-8ca94e70a54c)

