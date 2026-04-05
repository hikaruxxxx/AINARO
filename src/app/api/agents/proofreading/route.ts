import { NextRequest, NextResponse } from "next/server";
import {
  proofread,
  type StyleProfile,
  type SettingsInput,
} from "@/lib/agents/proofreading/analyzer";
import type { CharacterSetting } from "@/lib/agents/settings-consistency/analyzer";

const MIN_TEXT_LENGTH = 200;
const VALID_TEMPOS = ["slow", "medium", "fast"] as const;
const VALID_LINE_BREAKS = ["sparse", "normal", "frequent"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, styleProfile, settings } = body;

    // テキストのバリデーション
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "テキストが必要です" },
        { status: 400 }
      );
    }

    const trimmed = text.trim();
    if (trimmed.length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `テキストは${MIN_TEXT_LENGTH}文字以上必要です（現在: ${trimmed.length}文字）` },
        { status: 400 }
      );
    }

    // スタイルプロファイルのバリデーション
    const validatedProfile: Partial<StyleProfile> = {};
    if (styleProfile && typeof styleProfile === "object") {
      if (typeof styleProfile.sentenceLengthAvg === "number" && styleProfile.sentenceLengthAvg > 0) {
        validatedProfile.sentenceLengthAvg = styleProfile.sentenceLengthAvg;
      }
      if (typeof styleProfile.dialogueRatio === "number" && styleProfile.dialogueRatio >= 0 && styleProfile.dialogueRatio <= 1) {
        validatedProfile.dialogueRatio = styleProfile.dialogueRatio;
      }
      if (typeof styleProfile.innerMonologueRatio === "number" && styleProfile.innerMonologueRatio >= 0 && styleProfile.innerMonologueRatio <= 1) {
        validatedProfile.innerMonologueRatio = styleProfile.innerMonologueRatio;
      }
      if (VALID_TEMPOS.includes(styleProfile.tempo)) {
        validatedProfile.tempo = styleProfile.tempo;
      }
      if (VALID_LINE_BREAKS.includes(styleProfile.lineBreakFrequency)) {
        validatedProfile.lineBreakFrequency = styleProfile.lineBreakFrequency;
      }
    }

    // 設定のバリデーション
    const validatedSettings: SettingsInput = {
      characters: [],
    };

    if (settings && typeof settings === "object") {
      if (Array.isArray(settings.characters)) {
        validatedSettings.characters = settings.characters
          .filter(
            (c: CharacterSetting) =>
              c && typeof c.name === "string" && c.name.trim().length > 0
          )
          .map((c: CharacterSetting) => ({
            name: c.name.trim(),
            speechPatterns: Array.isArray(c.speechPatterns)
              ? c.speechPatterns.filter((p: string) => typeof p === "string")
              : [],
            innerSpeechPatterns: Array.isArray(c.innerSpeechPatterns)
              ? c.innerSpeechPatterns.filter((p: string) => typeof p === "string")
              : undefined,
            traits: Array.isArray(c.traits)
              ? c.traits.filter((t: string) => typeof t === "string")
              : undefined,
          }));
      }

      if (settings.worldBuilding && typeof settings.worldBuilding === "object") {
        validatedSettings.worldBuilding = {
          terms: Array.isArray(settings.worldBuilding.terms)
            ? settings.worldBuilding.terms.filter((t: string) => typeof t === "string")
            : [],
          rules: Array.isArray(settings.worldBuilding.rules)
            ? settings.worldBuilding.rules.filter((r: string) => typeof r === "string")
            : [],
        };
      }

      if (Array.isArray(settings.plotNotes)) {
        validatedSettings.plotNotes = settings.plotNotes.filter(
          (n: string) => typeof n === "string"
        );
      }
    }

    const result = proofread(trimmed, validatedProfile, validatedSettings);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "リクエストの処理に失敗しました" },
      { status: 500 }
    );
  }
}
