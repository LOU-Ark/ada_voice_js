
// This serverless function provides public configuration variables
// from server-side environment variables to the client-side application.
// This avoids the need for a build step to inject env vars into the client bundle.

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Vercel exposes environment variables prefixed with VITE_ to serverless functions.
    const config = {
      defaultVoiceId: process.env.VITE_FISH_AUDIO_DEFAULT_VOICE_ID,
      defaultVoiceName: process.env.VITE_FISH_AUDIO_DEFAULT_NAME,
    };
    res.status(200).json(config);
  } catch (error) {
    console.error("Error in /api/config:", error);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to load configuration." });
  }
}
