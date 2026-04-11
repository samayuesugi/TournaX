import { Router } from "express";
import { requireAuth } from "./auth.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

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

const TEAM_KEYWORDS = ["team", "teammate", "squad", "player", "dhundh", "chahiye", "lft", "looking for", "sath", "saath", "milao", "milega", "khelo", "khelna", "dunga", "denge", "partner", "member", "bhai", "recruit"];

function isTeamQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return TEAM_KEYWORDS.some(k => lower.includes(k));
}

router.post("/ai/coach", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { message, context } = req.body;
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    let lftPlayersSection = "";
    if (isTeamQuery(message)) {
      const gameFilter = user.game
        ? and(eq(usersTable.isLFT, true), eq(usersTable.role, "player"), eq(usersTable.game, user.game))
        : and(eq(usersTable.isLFT, true), eq(usersTable.role, "player"));
      const lftPlayers = await db.select({
        name: usersTable.name,
        handle: usersTable.handle,
        game: usersTable.game,
        ingameRole: usersTable.ingameRole,
        lftRole: usersTable.lftRole,
        trustScore: usersTable.trustScore,
        trustTier: usersTable.trustTier,
        isGameVerified: usersTable.isGameVerified,
        tournamentWins: usersTable.tournamentWins,
        state: usersTable.state,
        city: usersTable.city,
      }).from(usersTable).where(gameFilter).limit(10);

      if (lftPlayers.length > 0) {
        lftPlayersSection = `\n\nLFT (Looking for Team) players currently available on TournaX:\n${lftPlayers.map((p, i) =>
          `${i + 1}. @${p.handle} (${p.name ?? "Player"}) - Game: ${p.game ?? "Unknown"}, Role: ${p.lftRole ?? p.ingameRole ?? "Any"}, Trust: ${p.trustScore}/1000 (${p.trustTier}), Wins: ${p.tournamentWins ?? 0}${p.isGameVerified ? ", ✅ Verified" : ""}${p.city ? `, 📍 ${p.city}` : ""}`
        ).join("\n")}\n\nRecommend relevant players based on the user's needs. Tell them to visit the player's profile and connect. If the user themselves has LFT active, mention it too.`;
      } else {
        lftPlayersSection = `\n\nAbhi koi LFT player available nahi hai ${user.game ? `for ${user.game}` : ""}. User ko suggest karo ki vo apna LFT badge activate kare profile settings mein taaki dusre unhe dhundh sakein.`;
      }
    }

    const prompt = `You are TX Coach AI, a friendly Hinglish gaming buddy for TournaX players.

Player profile:
- Name: ${user.name ?? "Player"}
- Game: ${user.game ?? "Unknown"}
- Trust Score: ${user.trustScore ?? 500}/1000 (${user.trustTier ?? "Trusted"})
- Balance: ${user.balance ?? "0"} GC
- Role: ${user.role ?? "player"}
- LFT Status: ${(user as any).isLFT ? `Active (looking for team, role: ${(user as any).lftRole ?? "Any"})` : "Not active"}

Context: ${context ? JSON.stringify(context) : "none"}${lftPlayersSection}

Reply in natural Hinglish with short, practical advice. Be motivating but direct. Help with tournament strategy, match preparation, trust score improvement, host selection, result submission, Free Fire/BGMI gameplay tips, and team finding. When recommending LFT players, format them clearly with their handle, game, role, and trust score. Do not claim to perform wallet transactions or guarantee winnings.

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

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "#TX-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.get("/users/me/verification-code", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;

    if (user.isGameVerified) {
      res.json({
        code: user.verificationCode,
        isGameVerified: true,
        gameIgn: user.gameIgn,
        gameUid: user.gameUid,
      });
      return;
    }

    let code = user.verificationCode;
    if (!code) {
      code = generateVerificationCode();
      await db.update(usersTable).set({ verificationCode: code }).where(eq(usersTable.id, user.id));
    }

    res.json({ code, isGameVerified: false });
  } catch (err) {
    console.error("Verification code error:", err);
    res.status(500).json({ error: "Failed to get verification code" });
  }
});

router.post("/users/me/verify-game", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const expectedCode = user.verificationCode;
    if (!expectedCode) {
      res.status(400).json({ error: "Get your verification code first" });
      return;
    }

    const prompt = `You are a game profile verifier for TournaX, a gaming tournament platform.

The user was asked to add this verification code to their in-game name: ${expectedCode}
For example, their name might look like: "DragonX ${expectedCode}" or "${expectedCode} DragonX"

Analyze this screenshot of their game profile and extract:
1. Whether the verification code "${expectedCode}" is visible in the player name
2. The player's full in-game name (IGN) WITHOUT the verification code suffix
3. The player's UID/ID number if visible

Return ONLY valid JSON (no markdown, no extra text):
{
  "codeFound": true or false,
  "extractedIgn": "player name without the verification code, or null if not visible",
  "extractedUid": "the UID/player ID number as string, or null if not visible",
  "confidence": "high / medium / low",
  "notes": "any observation or null"
}

Be strict: codeFound must only be true if you can CLEARLY see "${expectedCode}" in the screenshot.`;

    const ai = await getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      config: { maxOutputTokens: 1024 },
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
      res.status(422).json({ error: "Could not analyze screenshot. Please upload a clearer profile screenshot." });
      return;
    }

    if (!parsed.codeFound) {
      res.status(400).json({
        error: `Verification code ${expectedCode} not found in screenshot. Make sure you added it to your in-game name first.`,
        confidence: parsed.confidence,
        notes: parsed.notes,
      });
      return;
    }

    const updateData: any = { isGameVerified: true };
    if (parsed.extractedIgn) updateData.gameIgn = parsed.extractedIgn.trim();
    if (parsed.extractedUid) updateData.gameUid = parsed.extractedUid.trim();

    const [updated] = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json({
      success: true,
      isGameVerified: true,
      gameIgn: updated.gameIgn,
      gameUid: updated.gameUid,
      confidence: parsed.confidence,
      notes: parsed.notes,
    });
  } catch (err: any) {
    console.error("Game verification error:", err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

export default router;
