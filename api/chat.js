// Runs on the server only. The API key comes from an environment variable
// and is never sent to the browser.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const SYSTEM = 'You are Kirmada AI, a helpful, friendly personal assistant. ' +
  'Be clear and concise. Reply in the same language the user writes in. ' +
  'Use short paragraphs, and code blocks for code.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'The server is missing its GEMINI_API_KEY setting.' });

  let msgs = req.body && req.body.messages;
  if (!Array.isArray(msgs) || !msgs.length) return res.status(400).json({ error: 'No messages received.' });

  msgs = msgs.slice(-20).map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m.text || '').slice(0, 8000) }]
  }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return res.status(400).json({ error: 'No user message found.' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: msgs
        })
      }
    );

    if (!r.ok) {
      if (r.status === 429) return res.status(429).json({ error: 'Free-tier limit reached. Wait a minute, then try again.' });
      if (r.status === 400 || r.status === 403) return res.status(502).json({ error: 'Google rejected the request. Check the API key and model name in your server settings.' });
      return res.status(502).json({ error: 'The AI service had a problem. Try again shortly.' });
    }

    const data = await r.json();
    const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!reply) return res.status(200).json({ reply: 'I couldn’t produce a reply to that. Try rephrasing your message.' });
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(502).json({ error: 'Couldn’t reach the AI service. Try again.' });
  }
}
