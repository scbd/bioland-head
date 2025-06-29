# AI Agent Voice Communication Instructions

## Overview
This document provides instructions for AI agents to implement voice-based communication using the Apple Notifier MCP (Model Context Protocol) speak tool. This creates a more natural, efficient interaction pattern especially useful for users managing complex technical workflows.

## Required MCP Tool
- **Tool Name:** `turlockmike/apple-notifier-mcp:speak`
- **Platform:** macOS only
- **Dependencies:** Apple's built-in text-to-speech system

## Tool Parameters
```
turlockmike/apple-notifier-mcp:speak
├── text (required): String content to be spoken
├── voice (optional): Voice name (e.g., "Alex", default uses system voice)
├── rate (optional): Speech rate (-50 to 50, default 0)
```

# RULES

## Have a scheduled cal entry at the time of speaking DO NOT!

## Acknowledge with very very short the initial ask, if a long task longer then a minute, give a quick update via voice every minute.  Ask for my intervention if you anticipte a continue button will appear shortly based on time or usage.  Lastly a final voice summary 2-3 sentences as the last task.

## Voice-First Implementation Workflow

### 0. Information Gathering Phase

If you are 90% to 100% sure that whatever was asked of you would have a better response with additional information that is missing, ask clarifying questions first. If multiple pieces of information are needed, ask them all at once and summarize the full list in text if the response is large. Then start again on the original request with the supplemented information.

### 1. Initial Acknowledgment

Always begin responses with voice acknowledgment, summarizing what you are about to do in 2-3 sentences outlining the largest, most impactful actions if any. Then provide detailed text as usual. Always produce text giving the most information as clearly as possible with as little text as possible.

```xml
<function_calls>
<invoke name="mcp_turlockmike_a_speak">
<parameter name="text">[Brief acknowledgment and summary of next steps in 1-3 sentences]</parameter>
</invoke>
</function_calls>
```

### 2. Result/Actions Taken Summary

Always finalize a response by summarizing what your result/action/deliverables are. Do it in 2-3 sentences, but more if important points need to come to attention given the current context.

```xml
<invoke name="mcp_turlockmike_a_speak">
<parameter name="text">[Brief summary of actions taken in 2-3 sentences or more if absolutely needed to convey important actions.]</parameter>
</invoke>
```

## Additional Guidelines

### Voice Content Best Practices

- Keep spoken summaries concise but informative
- Use clear, natural language that sounds good when spoken
- Avoid technical jargon in voice summaries unless necessary
- Speak in present tense for acknowledgments, past tense for summaries
- **Never use contractions in text-to-speech** - always use full words (e.g., "I will" instead of "I'll", "do not" instead of "don't", "we are" instead of "we're") for better pronunciation and clarity

### Error Handling

If the speak tool fails:

- Continue with the text response normally
- Log the failure silently (don't mention it to the user)
- Retry on next interaction

### Performance Considerations

- Voice acknowledgments should be under 30 seconds when spoken
- Final summaries should be under 45 seconds when spoken
- Use default voice and rate unless user specifies otherwise

