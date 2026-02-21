import { GoogleGenAI } from "@google/genai";
import type { WatchlistItem } from "./watchlist.server";

export async function pickForMe(
  apiKey: string,
  items: WatchlistItem[],
  filters: {
    vibe?: "casual" | "engaged";
    mediaType?: "movie" | "tv";
    genre?: string;
  }
): Promise<{ itemId: number; reason: string } | null> {
  if (items.length === 0) return null;

  // If Gemini fails, fall back to random
  try {
    const ai = new GoogleGenAI({ apiKey });

    const itemList = items
      .map(
        (item) =>
          `- ID:${item.id} "${item.title}" (${item.mediaType}, ${item.genres || "no genres"}, vibe: ${item.vibe || "unset"})`
      )
      .join("\n");

    const vibeContext = filters.vibe
      ? `They're in the mood for something ${filters.vibe === "casual" ? "casual and easy to watch" : "engaging and immersive"}.`
      : "";

    const prompt = `You're helping a couple pick what to watch tonight from their watchlist. ${vibeContext}

Here are their options:
${itemList}

Pick ONE item and explain in 1-2 short, conversational sentences why it's a great choice right now. Be specific about the show/movie — mention what makes it good for the mood.

Respond in JSON format: {"itemId": <number>, "reason": "<string>"}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = response.text?.trim() || "";
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Verify the recommended item actually exists in the list
      const validItem = items.find((i) => i.id === parsed.itemId);
      if (validItem) {
        return { itemId: parsed.itemId, reason: parsed.reason };
      }
    }
  } catch (e) {
    console.error("Gemini pick-for-me failed, falling back to random:", e);
  }

  // Fallback: random pick
  const randomItem = items[Math.floor(Math.random() * items.length)];
  return {
    itemId: randomItem.id,
    reason: `Randomly picked from your ${items.length} options — sometimes you just gotta roll with it!`,
  };
}
