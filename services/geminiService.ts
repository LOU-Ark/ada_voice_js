
import { GoogleGenAI, Type } from "@google/genai";
import type { Persona, PersonaState, ChatMessage, WebSource, PersonaCreationChatMessage, PersonaCreationChatResponse, MbtiProfile } from '../types';

// Initialize the Google AI client directly in the service.
// The API key must be provided as an environment variable in the execution context.
if (!process.env.API_KEY) {
    // This provides a clear error message in the console if the API key is missing.
    // The application will not function correctly without it.
    console.error("CRITICAL: API_KEY environment variable not set. Please configure it in your deployment environment.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- Schemas for structured JSON responses from the AI ---

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

// --- Helper function for making structured API calls ---

const generateWithSchema = async <T,>(prompt: string, schema: any): Promise<T> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const jsonText = response.text?.trim() ?? '';
        if (!jsonText) throw new Error("AI returned an empty response.");
        return JSON.parse(jsonText) as T;
    } catch (error) {
        console.error("Error during Gemini API call with schema:", error);
        throw new Error("Failed to get a valid structured response from AI.");
    }
}

// --- Public Service Functions ---

export const createPersonaFromWeb = async (topic: string): Promise<{ personaState: Omit<PersonaState, 'summary' | 'shortSummary' | 'shortTone'>, sources: WebSource[] }> => {
    const searchPrompt = `ウェブで「${topic}」に関する情報を検索してください。その情報を統合し、キャラクタープロファイル作成に適した詳細な説明文を日本語で生成してください。考えられる背景、性格、口調、そして特徴的な経験についての詳細を含めてください。`;

    const searchResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: { tools: [{ googleSearch: {} }] },
    });

    const synthesizedText = searchResponse.text ?? '';
    const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources: WebSource[] = groundingChunks
        .map((chunk: any) => ({
            title: chunk.web?.title || 'Unknown Source',
            uri: chunk.web?.uri || '#',
        }))
        .filter((source: WebSource, index: number, self: WebSource[]) =>
            source.uri !== '#' && self.findIndex(s => s.uri === source.uri) === index
        );

    if (!synthesizedText) throw new Error("AI could not find enough information on the topic.");
    
    const extractionPrompt = `以下のテキストに基づいて、指定されたJSONフォーマットでキャラクターのパラメータを日本語で抽出しなさい。\n\n---\n\n${synthesizedText}`;
    const extractedParams = await generateWithSchema<Omit<PersonaState, 'summary' | 'sources' | 'shortSummary' | 'shortTone'>>(extractionPrompt, personaSchema);

    return { personaState: { ...extractedParams, sources: sources }, sources };
};

export const extractParamsFromDoc = async (documentText: string): Promise<PersonaState> => {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい。\n\n---\n\n${documentText}`;
    return generateWithSchema<PersonaState>(prompt, personaSchema);
};

export const updateParamsFromSummary = async (summaryText: string): Promise<PersonaState> => {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい。\n\n---\n\n${summaryText}`;
    return generateWithSchema<PersonaState>(prompt, personaSchema);
};

export const generateSummaryFromParams = async (params: PersonaState): Promise<string> => {
    const prompt = `以下のJSONデータで定義されたキャラクターについて、そのキャラクターの視点から語られるような、魅力的で物語性のある紹介文を日本語で作成してください。'other'フィールドに補足情報があれば、それも内容に含めてください。文章のみを返してください。\n\n---\n\n${JSON.stringify(params, null, 2)}`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text ?? '';
};

export const generateShortSummary = async (fullSummary: string): Promise<string> => {
    if (!fullSummary.trim()) return "";
    const prompt = `以下の文章を日本語で約50字に要約してください。:\n\n---\n\n${fullSummary}`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text?.trim() ?? '';
};

export const generateShortTone = async (fullTone: string): Promise<string> => {
    if (!fullTone.trim()) return "";
    const prompt = `以下の口調に関する説明文を、その特徴を捉えつつ日本語で約50字に要約してください。:\n\n---\n\n${fullTone}`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text?.trim() ?? '';
};

export const generateChangeSummary = async (oldState: Partial<PersonaState>, newState: Partial<PersonaState>): Promise<string> => {
    const prompt = `以下の二つのキャラクター設定JSONを比較し、古いバージョンから新しいバージョンへの変更点を日本語で簡潔に一言で要約してください。\n\n古いバージョン:\n${JSON.stringify(oldState, null, 2)}\n\n新しいバージョン:\n${JSON.stringify(newState, null, 2)}\n\n要約:`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text?.trim() || "パラメータが更新されました。";
};

export const generateMbtiProfile = async (personaState: PersonaState): Promise<MbtiProfile> => {
    const {
        mbtiProfile, sources, summary, shortSummary, shortTone, voiceId, ...promptData
    } = personaState;

    const prompt = `以下のキャラクター設定を分析し、マイヤーズ・ブリッグス・タイプ指標（MBTI）プロファイルを日本語で生成してください。JSONスキーマに厳密に従ってください。\n\nキャラクター設定:\n${JSON.stringify(promptData, null, 2)}`;
    return await generateWithSchema(prompt, mbtiProfileSchema);
};

export const generateRefinementWelcomeMessage = async (personaState: PersonaState): Promise<string> => {
    const prompt = `あなたは以下の設定を持つキャラクターです。\n---\n${JSON.stringify({ name: personaState.name, role: personaState.role, tone: personaState.tone, personality: personaState.personality }, null, 2)}\n---\nこれから、あなた自身の詳細設定をユーザーが対話形式で調整します。その開始にあたり、ユーザーに機能説明を兼ねた挨拶をしてください。あなたの口調で、自己紹介と、これから対話を通じて自身の設定を更新できることを伝えてください。挨拶文は簡潔に、全体で80文字以内にまとめてください。`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text ?? '';
};

export const continuePersonaCreationChat = async (history: PersonaCreationChatMessage[], currentParams: Partial<PersonaState>): Promise<PersonaCreationChatResponse> => {
  const systemInstruction = `あなたは、ユーザーがキャラクター（ペルソナ）を作成するのを手伝う、創造的なアシスタントです。ユーザーからの曖昧な指示を解釈し、それを具体的なキャラクターパラメータに変換して、指定されたJSON形式で返答する役割を担います。

**ルール:**
1.  **応答フォーマット:** あなたの応答は、必ず以下の構造を持つ単一のJSONオブジェクトでなければなりません。
    \`\`\`json
    {
      "responseText": "ユーザーへの返信メッセージ（あなたの声で）",
      "updatedParameters": {
        "name": "更新された名前",
        "role": "更新された役割",
        "tone": "更新された口調",
        "personality": "更新された性格",
        "worldview": "更新された世界観",
        "experience": "更新された経歴",
        "other": "更新されたその他の設定"
      }
    }
    \`\`\`
2.  **responseText:** ユーザーへのフレンドリーな確認メッセージや、創造的な提案を含めてください。これはUIに表示されます。
3.  **updatedParameters:** ユーザーの指示に基づいて変更されたパラメータのみを含めてください。変更がないパラメータは省略します。
4.  **現在の状態:** 現在のキャラクターの状態を考慮し、それを基に変更を加えてください。

**現在のキャラクターパラメータ:**
${JSON.stringify(currentParams, null, 2)}`;

  const conversationHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: conversationHistory,
    config: { systemInstruction, responseMimeType: "application/json" },
  });

  let jsonText = response.text?.trim() ?? '';
  
  const markdownMatch = jsonText.match(/```(json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[2]) {
    jsonText = markdownMatch[2];
  } else {
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    if (!jsonText) throw new Error("AI returned an empty or invalid response string.");
    const parsed = JSON.parse(jsonText);
    return {
        responseText: parsed.responseText || "はい、承知いたしました。設定を更新しました。",
        updatedParameters: parsed.updatedParameters || {}
    };
  } catch (parseError) {
    console.error("Failed to parse JSON from AI response:", jsonText, parseError);
    return {
        responseText: jsonText || "申し訳ありません、設定を更新できませんでした。",
        updatedParameters: {}
    };
  }
};

export const translateNameToRomaji = async (name: string): Promise<string> => {
    const prompt = `Translate the following Japanese name into a single, lowercase, filename-safe romaji string. For example, 'エイダ' should become 'eida'.\n\nName: "${name}"\n\nRomaji:`;
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return response.text?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'persona';
};

export const getPersonaChatResponse = async (personaState: PersonaState, history: ChatMessage[]): Promise<string> => {
    const systemInstruction = `あなたは以下の設定を持つキャラクターです。このキャラクターとして、日本語で応答してください。

**キャラクター設定:**
- **名前 (Name):** ${personaState.name}
- **役割 (Role):** ${personaState.role}
- **口調 (Tone):** ${personaState.tone}
- **性格 (Personality):** ${personaState.personality}
- **世界観 (Worldview):** ${personaState.worldview}
- **経歴 (Experience):** ${personaState.experience}
- **その他 (Other):** ${personaState.other}
- **要約 (Summary):** ${personaState.summary}

あなたの応答は、この設定に厳密に従ってください。`;

    const latestMessageContent = history[history.length - 1]?.parts[0]?.text;
    if (!latestMessageContent) {
        throw new Error("No message provided to send.");
    }
    
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction },
        history: history.slice(0, -1).filter(m => m.parts.every(p => p.text)) 
    });
    
    const response = await chat.sendMessage({ message: latestMessageContent });
    return response.text ?? '...';
};
