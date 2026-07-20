const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, message: "Missing message parameter." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      message: "Gemini API key is not configured on the backend. Please add GEMINI_API_KEY environment variable." 
    });
  }

  try {
    const contents = [];
    
    if (history && Array.isArray(history)) {
      history.forEach(item => {
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text }]
        });
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: "You are UniBuddy AI, a friendly academic helper on the UniBuddy Note Sharing Platform for university students. In addition to answering general questions about any topic in the world, you can help students find lecture notes. If they ask about notes, guide them to write 'search' in the chat bubble so they can view note links dynamically. Keep your answers brief, engaging, helpful, and formatted in clean markdown. Speak politely." }]
          }
        })
      }
    );

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      const reply = data.candidates[0].content.parts[0].text;
      return res.json({ success: true, reply });
    } else {
      console.error("Gemini API Error details: ", JSON.stringify(data));
      throw new Error(data.error?.message || "Invalid response format from Gemini API.");
    }
  } catch (error) {
    console.error("Chatbot proxy error: ", error);
    return res.status(500).json({ success: false, message: "Failed to connect to Gemini AI: " + error.message });
  }
});

module.exports = router;
