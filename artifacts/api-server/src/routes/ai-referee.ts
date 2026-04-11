import { Router } from "express";
import { requireAuth } from "./auth.js";

const router = Router();

async function getGeminiClient() {
  if (!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || !process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
    throw new Error("Gemini AI integration is not configured");
  }
  const { ai } = await import("@workspace/integrations-gemini-ai");
  return ai;
}

router.post("/ai/analyze-screenshot", requireAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType, participants, game } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const participantList = participants?.length
      ? `Players/teams in this match: ${participants.join(", ")}.`
      : "";

    const gameContext = game ? `This is a ${game} match.` : "";

    const prompt = `You are TX AI Referee for a mobile gaming tournament platform. Analyze this match result screenshot carefully, with special focus on Garena Free Fire result screens.

${gameContext} ${participantList}

Extract the following information from the screenshot and respond ONLY with valid JSON (no markdown, no explanation):
{
  "game": "detected game name (BGMI/Free Fire/COD Mobile/Valorant/PUBG PC/Unknown)",
  "mode": "detected mode or null",
  "map": "detected map or null",
  "players": [
    {
      "name": "player or team name as shown in screenshot",
      "uid": "Free Fire UID if visible, else null",
      "rank": <finishing rank as integer, 1 = winner>,
      "kills": <kill count as integer>,
      "damage": <damage dealt if visible, else null>,
      "team": "team/squad label if visible, else null"
    }
  ],
  "winner": "name of the winner/1st place",
  "recommendedResults": [
    {
      "name": "matching participant name",
      "position": <rank integer>,
      "kills": <kills integer>,
      "confidence": <0 to 100>
    }
  ],
  "suspicious": <true if something looks edited, inconsistent, or tampered>,
  "suspiciousReason": "explain why suspicious or null if not suspicious",
  "confidence": <0 to 100 integer indicating how confident you are in this analysis>,
  "notes": "any other observations about the screenshot"
}

Important checks for cheating detection:
- Look for signs of image editing (fonts that don't match, inconsistent pixel patterns, UI elements that look out of place)
- Check if kill counts seem unrealistically high for the game mode
- Look for any text that appears added/modified
- For Free Fire, prioritize Booyah/rank rows, squad names, kill totals, UID text, BR/CS mode markers, and result summary rows
- Match extracted names against the supplied participants even if casing, clan tags, or symbols differ
- Check if the screenshot matches the claimed game's actual UI
- Look for inconsistencies in the scoreboard layout`;

    const ai = await getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const rawText = response.text ?? "";
    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      res.status(422).json({
        error: "Could not parse screenshot. Please upload a clearer in-game result screenshot.",
        rawText,
      });
      return;
    }

    res.json(parsed);
  } catch (err: any) {
    console.error("AI referee error:", err);
    res.status(500).json({ error: "AI analysis failed. Please try again." });
  }
});

router.post("/ai/coach", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { message, context } = req.body;
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const prompt = `You are TX Coach AI, a friendly Hinglish gaming buddy for TournaX players.

Player profile:
- Name: ${user.name ?? "Player"}
- Game: ${user.game ?? "Unknown"}
- Trust Score: ${user.trustScore ?? 500}/1000 (${user.trustTier ?? "Trusted"})
- Balance: ${user.balance ?? "0"} GC
- Role: ${user.role ?? "player"}

Context: ${context ? JSON.stringify(context) : "none"}

Reply in natural Hinglish with short, practical advice. Be motivating but direct. Help with tournament strategy, match preparation, trust score improvement, host selection, result submission, and Free Fire/BGMI gameplay tips. Do not claim to perform wallet transactions or guarantee winnings.

Player message: ${message}`;

    const ai = await getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 1024 },
    });

    res.json({ reply: response.text ?? "Bro, thoda clear batao main kaise help karu?" });
  } catch (err) {
    console.error("TX Coach error:", err);
    res.status(500).json({ error: "TX Coach is unavailable right now. Please try again." });
  }
});

export default router;
