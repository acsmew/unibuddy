const express = require("express");
const router = express.Router();
const https = require("https");

router.get("/models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not set" });
  
  try {
    const apiRequest = () => {
      return new Promise((resolve, reject) => {
        https.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, (resApi) => {
          let data = "";
          resApi.on("data", (chunk) => data += chunk);
          resApi.on("end", () => resolve({ statusCode: resApi.statusCode, body: data }));
        }).on("error", reject);
      });
    };
    const { statusCode, body } = await apiRequest();
    res.status(statusCode).send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    
    // Inject system instructions as pre-defined chat priming to ensure 100% API compatibility across all versions
    contents.push({
      role: "user",
      parts: [{ text: "System Instructions: You are UniBuddy AI, a friendly academic helper on the UniBuddy Note Sharing Platform for university students. In addition to answering general questions about any topic in the world, you can help students find lecture notes. If they ask about notes, guide them to write 'search' in the chat bubble so they can view note links dynamically. Keep your answers brief, engaging, helpful, and formatted in clean markdown. Speak politely." }]
    });
    
    contents.push({
      role: "model",
      parts: [{ text: "Understood. I am UniBuddy AI. I will assist students with general questions, note searching guidelines, and platform features in a polite, helpful manner." }]
    });
    
    // Append message history memory
    if (history && Array.isArray(history)) {
      history.forEach(item => {
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text }]
        });
      });
    }

    // Append the active user query
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const postData = JSON.stringify({ contents });

    const apiRequest = (options, payload) => {
      return new Promise((resolve, reject) => {
        const reqApi = https.request(options, (resApi) => {
          let data = "";
          resApi.on("data", (chunk) => {
            data += chunk;
          });
          resApi.on("end", () => {
            resolve({ statusCode: resApi.statusCode, body: data });
          });
        });

        reqApi.on("error", (e) => {
          reject(e);
        });

        reqApi.write(payload);
        reqApi.end();
      });
    };

    // List of models to try sequentially in case of quota limits
    const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-3.5-flash"];
    let lastError = "";

    for (const model of models) {
      try {
        const options = {
          hostname: "generativelanguage.googleapis.com",
          path: `/v1/models/${model}:generateContent?key=${apiKey}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          }
        };

        const { statusCode, body } = await apiRequest(options, postData);
        const data = JSON.parse(body);

        if (statusCode === 200 && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          const reply = data.candidates[0].content.parts[0].text;
          return res.json({ success: true, reply });
        } else {
          lastError = data.error?.message || "HTTP status " + statusCode;
          console.warn(`Model ${model} failed with: ${lastError}`);
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`Model ${model} request threw: ${lastError}`);
      }
    }

    return res.status(500).json({ 
      success: false, 
      message: "All Gemini models returned rate limits or errors. Last error: " + lastError 
    });
  } catch (error) {
    console.error("Chatbot proxy error: ", error);
    return res.status(500).json({ success: false, message: "Failed to connect to Gemini AI: " + error.message });
  }
});

module.exports = router;
