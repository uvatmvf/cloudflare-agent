# Demo Agent LLM Chat — Solution Notes

This repository contains a demo agent-based LLM chat application built with the Agents SDK. It's intended as a lightweight reference for exploring agent orchestration, server-side inference, and chat integrations.

## Known Issues
During development we observed duplicated incremental content when streaming Workers AI responses through the current Agents SDK chat stack. Non-streaming inference returns correct output. To preserve correctness without changing the agent architecture, this demo uses non-streaming generation for responses.

What to expect:
- Streaming responses may show duplicate partial content in some environments.
- Non-streaming (batched) generation produces consistent, correct messages and is the recommended mode for this demo.

## Demo Prompts
Use the following prompts when exercising the agent behavior in the demo environment.

1. `We need to build a system that processes documents uploaded by customers. Traffic can be very bursty, and some documents may take several minutes to process.`
2. `We absolutely cannot lose a document. Some documents contain sensitive customer information. We also have a small platform team, so operational simplicity matters.`
## Expected demo output
Using a simple problem statement (and clarifying statements) the application will support generating analysis, recommendation and architectural decision reference.
### Analyze & Recommend
<img width="712" height="1802" alt="image" src="https://github.com/user-attachments/assets/13b24347-cc48-422e-bc94-28db5721bb5e" />
### ADR
<img width="655" height="344" alt="image" src="https://github.com/user-attachments/assets/b8aad30c-c388-4332-8a75-208e5dc188f4" />



Feel free to modify the prompts to test error handling, long-running tasks, or sensitive-data redaction flows.
