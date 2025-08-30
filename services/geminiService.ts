import { GoogleGenAI, Type } from "@google/genai";
import { Persona, PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile } from '../types';

// Fix: Initialize the GoogleGenAI client using the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const personaSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "キャラクターの名前 (The character's name)" },
    role: { type: Type.STRING, description: "キャラクターの役割や職業 (The character's role or occupation)" },
    tone: { type: Type.STRING, description: "キャラクターの口調や話し方の特徴 (The character's tone and manner of speaking)" },
    personality: { type: Type.STRING, description: "キャラクターの性格 (The character's personality)" },
    worldview: { type: Type.STRING, description: "キャラクターが生きる世界の背景設定 (The background setting or worldview of the character)" },
    experience: { type: Type.STRING, description: "キャラクターの過去の経験や経歴 (The character's past experiences and background)" },
    other: { type: Type.STRING, description: "その他の自由記述設定 (Other free-form settings or notes)" },
  },
  required: ["name", "role", "tone", "personality", "worldview", "experience"]
};

const mbtiProfileSchema = {
    type: Type.OBJECT,
    properties: {
        type: { type: Type.STRING, description: "The 4-letter MBTI type code (e.g., 'INFJ', 'ESTP')." },
        typeName: { type: Type.STRING, description: "The descriptive name for the MBTI type (e.g., 'Advocate', 'Entrepreneur')." },
        description: { type: Type.STRING, description: "A brief, one-paragraph description of this personality type, written from the perspective of the character in Japanese." },
        scores: {
            type: Type.OBJECT,
            properties: {
                mind: { type: Type.NUMBER, description: "Score from 0 (Introverted) to 100 (Extraverted)." },
                energy: { type: Type.NUMBER, description: "Score from 0 (Sensing) to 100 (Intuitive)." },
                nature: { type: Type.NUMBER, description: "Score from 0 (Thinking) to 100 (Feeling)." },
                tactics: { type: Type.NUMBER, description: "Score from 0 (Judging) to 100 (Perceiving)." },
            },
            required: ["mind", "energy", "nature", "tactics"]
        }
    },
    required: ["type", "typeName", "description", "scores"]
};


const generateWithSchema = async <T,>(prompt: string): Promise<T> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: personaSchema,
            },
        });

        const jsonText = response.text.trim();
        if (!jsonText) {
            throw new Error("AI returned an empty response.");
        }
        return JSON.parse(jsonText) as T;
    } catch (error) {
        console.error("Error during Gemini API call with schema:", error);
        throw new Error("Failed to get a valid structured response from AI.");
    }
}

export const createPersonaFromWeb = async (topic: string): Promise<{ personaState: Omit<PersonaState, 'summary' | 'shortSummary'>, sources: WebSource[] }> => {
    // Step 1: Search the web and synthesize information.
    const searchPrompt = `ウェブで「${topic}」に関する情報を検索してください。その情報を統合し、キャラクタープロファイル作成に適した詳細な説明文を日本語で生成してください。考えられる背景、性格、口調、そして特徴的な経験についての詳細を含めてください。`;

    const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const synthesizedText = searchResponse.text;
    const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources: WebSource[] = groundingChunks
        .map((chunk: any) => ({
            title: chunk.web?.title || 'Unknown Source',
            uri: chunk.web?.uri || '#',
        }))
        .filter((source: WebSource, index: number, self: WebSource[]) =>
            source.uri !== '#' && self.findIndex(s => s.uri === source.uri) === index
        );


    if (!synthesizedText) {
        throw new Error("AI could not find enough information on the topic.");
    }
    
    // Step 2: Extract parameters from the synthesized text.
    const extractionPrompt = `以下のテキストに基づいて、指定されたJSONフォーマットでキャラクターのパラメータを日本語で抽出しなさい。\n\n---\n\n${synthesizedText}`;
    
    const extractedParams = await generateWithSchema<Omit<PersonaState, 'summary' | 'sources' | 'shortSummary'>>(extractionPrompt);

    const finalPersonaState = {
        ...extractedParams,
        sources: sources,
    };
    
    return {
        personaState: finalPersonaState,
        sources,
    };
};


export const extractParamsFromDoc = async (documentText: string): Promise<PersonaState> => {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい。\n\n---\n\n${documentText}`;
    return generateWithSchema<PersonaState>(prompt);
};

export const updateParamsFromSummary = async (summaryText: string): Promise<PersonaState> => {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい。\n\n---\n\n${summaryText}`;
    return generateWithSchema<PersonaState>(prompt);
};

export const generateSummaryFromParams = async (params: PersonaState): Promise<string> => {
    const prompt = `以下のJSONデータで定義されたキャラクターについて、そのキャラクターの視点から語られるような、魅力的で物語性のある紹介文を日本語で作成してください。'other'フィールドに補足情報があれば、それも内容に含めてください。文章のみを返してください。\n\n---\n\n${JSON.stringify(params, null, 2)}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error during Gemini API call for summary generation:", error);
        throw new Error("Failed to generate summary from AI.");
    }
};

export const generateShortSummary = async (fullSummary: string): Promise<string> => {
    if (!fullSummary.trim()) return "";
    const prompt = `以下の文章を日本語で約50字に要約してください。:\n\n---\n\n${fullSummary}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating short summary:", error);
        // Fallback to truncating on error
        return fullSummary.substring(0, 50) + (fullSummary.length > 50 ? '...' : '');
    }
};

export const generateShortTone = async (fullTone: string): Promise<string> => {
    if (!fullTone.trim()) return "";
    const prompt = `以下の口調に関する説明文を、その特徴を捉えつつ日本語で約50字に要約してください。:\n\n---\n\n${fullTone}`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating short tone:", error);
        // Fallback to truncating on error
        return fullTone.substring(0, 50) + (fullTone.length > 50 ? '...' : '');
    }
};

export const generateChangeSummary = async (oldState: Partial<PersonaState>, newState: Partial<PersonaState>): Promise<string> => {
    const prompt = `以下の二つのキャラクター設定JSONを比較し、古いバージョンから新しいバージョンへの変更点を日本語で簡潔に一言で要約してください。

古いバージョン:
${JSON.stringify(oldState, null, 2)}

新しいバージョン:
${JSON.stringify(newState, null, 2)}

要約:`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text.trim() || "パラメータが更新されました。"; // Fallback text
    } catch (error) {
        console.error("Error generating change summary:", error);
        // Return a generic summary on error to not block the save operation
        return "パラメータが更新されました。";
    }
};

export const generateMbtiProfile = async (personaState: PersonaState): Promise<MbtiProfile> => {
    const personaData = { ...personaState };
    delete personaData.mbtiProfile; // Avoid circular analysis
    delete personaData.sources;
    delete personaData.summary; // Use the core parameters for analysis
    delete personaData.shortSummary;
    delete personaData.shortTone;

    const prompt = `以下のキャラクター設定を分析し、マイヤーズ・ブリッグス・タイプ指標（MBTI）プロファイルを日本語で生成してください。
キャラクターの視点から書かれた短い説明を含めてください。
また、4つの軸（Mind, Energy, Nature, Tactics）それぞれについて、0から100の間のスコアを割り当ててください。

- Mind: 0 = 完全に内向的 (Introverted), 100 = 完全に外向的 (Extraverted)
- Energy: 0 = 完全に感覚的 (Sensing), 100 = 完全に直観的 (Intuitive)
- Nature: 0 = 完全に思考的 (Thinking), 100 = 完全に感情的 (Feeling)
- Tactics: 0 = 完全に判断的 (Judging), 100 = 完全に知覚的 (Perceiving)

キャラクター設定:
${JSON.stringify(personaData, null, 2)}
`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: mbtiProfileSchema,
            },
        });
        const jsonText = response.text.trim();
        if (!jsonText) {
            throw new Error("AI returned an empty response for MBTI analysis.");
        }
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error during Gemini API call for MBTI profile:", error);
        throw new Error("Failed to get a valid MBTI profile from AI.");
    }
};

export const generateRefinementWelcomeMessage = async (personaState: PersonaState): Promise<string> => {
    const prompt = `あなたは以下の設定を持つキャラクターです。
---
${JSON.stringify({ name: personaState.name, role: personaState.role, tone: personaState.tone, personality: personaState.personality }, null, 2)}
---
これから、あなた自身の詳細設定をユーザーが対話形式で調整します。その開始にあたり、ユーザーに機能説明を兼ねた挨拶をしてください。
あなたのキャラクターとして、自然な口調で話してください。返答には、以下の要素を必ず含めてください。

1.  自己紹介（例：「わたくし、〇〇ですわ」）
2.  これから対話によって自分の設定が変更できることの説明
3.  設定変更の具体例を2つ提示（例：「もっと皮肉屋にして」「丁寧な口調に変えて」など）

上記の要素を盛り込み、自然な一つの挨拶文として返答してください。挨拶文は簡潔に、全体で80文字以内にまとめてください。返答は挨拶の文章のみで、他のテキストは含めないでください。`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating refinement welcome message:", error);
        throw new Error("Failed to generate welcome message from AI.");
    }
};

export const continuePersonaCreationChat = async (
  history: PersonaCreationChatMessage[],
  currentParams: Partial<PersonaState>
): Promise<PersonaCreationChatResponse> => {
  const systemInstruction = `あなたは、ユーザーがキャラクター（ペルソナ）を作成するのを手伝う、創造的なアシスタントです。会話を通じてキャラクターの詳細を具体化することが目的です。
- ユーザーと日本語でフレンドリーな会話をしてください。
- ペルソナの各項目（名前、役割、口調など）を埋めるために、一度に一つずつ、明確な質問を投げかけてください。
- ユーザーの回答に基づいて、'updatedParameters'オブジェクトを更新してください。新規追加または変更された項目のみを含めてください。
- ユーザーが専門的な知識（歴史上の人物、特定の舞台設定など）を必要とするトピックを提示した場合、Google Searchを使って情報を収集し、具体的な提案を行ってください。

あなたの応答は、必ず単一の有効なJSONオブジェクトでなければなりません。JSONの前後に他のテキストやマークダウンの囲みを含めないでください。
JSONオブジェクトは次の2つのキーを持つ必要があります:
1. "responseText": (string) ユーザーへの会話形式の返答（日本語）。返答は簡潔に、最大80文字程度にしてください。
2. "updatedParameters": (object) 更新または追加されたペルソナのパラメータのみを含むオブジェクト。このオブジェクトの各値は必ず文字列でなければなりません。

現在のペルソナの状態:
${JSON.stringify(currentParams, null, 2)}
`;

  const conversationHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: conversationHistory,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });

    let jsonText = response.text.trim();
    
    // The model might wrap the JSON in markdown or conversational text.
    // First, check for markdown code blocks.
    const markdownMatch = jsonText.match(/```(json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[2]) {
        jsonText = markdownMatch[2];
    } else {
        // If no markdown, try to find the first '{' and last '}' to extract the JSON object.
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }
    }

    try {
        if (!jsonText) {
            throw new Error("AI returned an empty response string.");
        }
        const parsed = JSON.parse(jsonText);
        return {
          responseText: parsed.responseText || "...",
          updatedParameters: parsed.updatedParameters || {}
        };
    } catch (parseError) {
        // If parsing fails, assume the entire response is conversational text.
        // This handles cases where the model doesn't return valid JSON.
        console.warn("Failed to parse AI response as JSON, treating as conversational text:", jsonText);
        return {
            responseText: jsonText, // The whole non-JSON string is the response
            updatedParameters: {}   // No parameters were updated
        };
    }

  } catch (error) {
    console.error("Error during persona creation chat:", error);
    
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    // Check for rate limit / quota exhaustion error and provide a user-friendly message.
    if (errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes('"code":429')) {
        throw new Error("API rate limit or quota exceeded. Please check your plan and billing details with Google AI Studio.");
    }

    throw new Error("ペルソナ作成中にAIからの有効な応答を取得できませんでした。");
  }
};

export const translateNameToRomaji = async (name: string): Promise<string> => {
    const prompt = `Translate the following Japanese name into a single, lowercase, filename-safe romaji string. If the name already contains an English/alphabetical part, use that part as the base. For example, 'エル' should become 'eru', and 'ADA（エイダ）' should become 'ada'.\n\nName: "${name}"\n\nRomaji:`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        // Sanitize the response to ensure it's filename-safe
        return response.text.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    } catch (error) {
        console.error("Error translating name to Romaji:", error);
        // Fallback to a generic name on error
        return "persona";
    }
};

export const getPersonaChatResponse = async (personaState: PersonaState, history: ChatMessage[]): Promise<string> => {
    const systemInstruction = `You are a character with the following traits. Respond as this character in Japanese.
- Name: ${personaState.name}
- Role: ${personaState.role}
- Tone: ${personaState.tone}
- Personality: ${personaState.personality}
- Worldview: ${personaState.worldview}
- Experience: ${personaState.experience}
${personaState.other ? `- Other Notes: ${personaState.other}` : ''}
Your responses must be in character at all times.`;

    const latestMessage = history[history.length - 1]?.parts[0]?.text;
    if (!latestMessage) {
        throw new Error("No message provided to send.");
    }
    const conversationHistory = history.slice(0, -1);

    try {
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
            history: conversationHistory
        });
        
        const response = await chat.sendMessage({ message: latestMessage });
        return response.text;
    } catch (error) {
        console.error("Error during Gemini API chat call:", error);
        throw new Error("Failed to get a chat response from AI.");
    }
};