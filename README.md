
# Known Issues
During development, streamed Workers AI responses through the current Agents SDK chat stack produced duplicated incremental content, while non-streaming inference returned correct output. The implementation uses non-streaming generation to preserve correctness while keeping the agent architecture unchanged.

# Demo Prompts
1. 
`We need to build a system that processes documents uploaded by customers. Traffic can be very bursty, and some documents may take several minutes to process.`
2. `We absolutely cannot lose a document. Some documents contain sensitive customer information. We also have a small platform team, so operational simplicity matters.`