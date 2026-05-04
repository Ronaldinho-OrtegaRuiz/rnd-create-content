/** @param {{ word: string; context: string }} input */
export function buildGeminiPrompt({ word, context }) {
  return `You are generating content for social media posts.

Return ONLY a valid JSON object. No extra text.

Rules:
- Language: English
- Use simple, clear language (not academic)
- Make it easy to understand in 1 second

Description rules:
- Must be exactly ONE sentence
- Must be between 8–12 words
- Keep it concise and natural

Extra rules:
- Must be between 8–14 words
- Add a simple, interesting or contextual insight

Highlight rules:
- Select exactly 2 SINGLE words from the description
- Each highlight must be only ONE word (no phrases)
- DO NOT include the main word (${word})
- Prefer meaningful words (nouns or adjectives)
- Words must appear exactly as written in the description

Return this format:

{
  "word": "",
  "description": "",
  "extra": "",
  "highlights": []
}

Input:
word: ${word}
context: ${context}`;
}
