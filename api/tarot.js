// api/tarot.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Lấy API Key từ "Két sắt" của Vercel
  const apiKey = process.env.GEMINI_API_KEY;
  const { prompt } = req.body;

  try {
    const googleRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    
    const data = await googleRes.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi kết nối vũ trụ' });
  }
}