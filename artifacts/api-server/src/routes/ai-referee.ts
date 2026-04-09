import { Router } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAuth } from "./auth.js";

const router = Router();

router.post("/api/ai/analyze-screenshot", requireAuth, async (req, res) => {
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

    const prompt = `You are an AI referee for a mobile gaming tournament. Analyze this match result screenshot carefully.

${gameContext} ${participantList}

Extract the following information from the screenshot and respond ONLY with valid JSON (no markdown, no explanation):
{
  "game": "detected game name (BGMI/Free Fire/COD Mobile/Valorant/PUBG PC/Unknown)",
  "players": [
    {
      "name": "player or team name as shown in screenshot",
      "rank": <finishing rank as integer, 1 = winner>,
      "kills": <kill count as integer>,
      "damage": <damage dealt if visible, else null>
    }
  ],
  "winner": "name of the winner/1st place",
  "suspicious": <true if something looks edited, inconsistent, or tampered>,
  "suspiciousReason": "explain why suspicious or null if not suspicious",
  "confidence": <0 to 100 integer indicating how confident you are in this analysis>,
  "notes": "any other observations about the screenshot"
}

Important checks for cheating detection:
- Look for signs of image editing (fonts that don't match, inconsistent pixel patterns, UI elements that look out of place)
- Check if kill counts seem unrealistically high for the game mode
- Look for any text that appears added/modified
- Check if the screenshot matches the claimed game's actual UI
- Look for inconsistencies in the scoreboard layout`;

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

export default router;
