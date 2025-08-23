
import { GoogleGenAI, Type } from "@google/genai";
import { Persona, PersonaState, ChatMessage } from '../types';

// =================================================================================
// IMPORTANT SECURITY NOTICE
// =================================================================================
// The API key is hardcoded here for demonstration purposes in this specific
// sandboxed environment ONLY.
//
// In a real-world application, you MUST NEVER expose your API key on the
// client-side. Instead, you should:
// 1. Use environment variables (e.g., process.env.API_KEY).
// 2. Access the API key from a secure backend or serverless function.
//
// Storing keys in client-side code can lead to unauthorized use and compromise
// your account security.
// =================================================================================
const API_KEY = "YOUR_API_KEY_HERE"; // <-- PASTE YOUR GOOGLE GEMINI API KEY HERE

if (API_KEY === "YOUR_API_KEY_HERE") {
  console.warn("Gemini API key is not set. Please replace 'YOUR_API_KEY_HERE' in services/geminiService.ts with your actual API key.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

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

export const extractParamsFromDoc = async (documentText: string): Promise<PersonaState> => {
    const prompt = `以下のテキストから、指定されたJSONフォーマットに従ってキャラクター情報を日本語で抽出しなさい。\n\n---\n\n${documentText}`;
    return generateWithSchema<PersonaState>(prompt);
};

export const updateParamsFromSummary = async (summaryText: string): Promise<PersonaState> => {
    const prompt = `以下のサマリーテキストに基づいて、指定されたJSONフォーマットの各項目を日本語で更新しなさい。\n\n---\n\n${summaryText}`;
    return generateWithSchema<PersonaState>(prompt);
};

export const generateSummaryFromParams = async (params: PersonaState): Promise<string> => {
    const prompt = `以下のJSONデータで定義されたキャラクターについて、魅力的で自然な紹介文を日本語で作成してください。'other'フィールドに補足情報があれば、それも内容に含めてください。文章のみを返してください。\n\n---\n\n${JSON.stringify(params, null, 2)}`;
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

export const generateChangeSummary = async (oldState: PersonaState, newState: PersonaState): Promise<string> => {
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