const { onRequest } = require("firebase-functions/v2/https");
const { EdgeTTS } = require("edge-tts-universal");

exports.tts = onRequest({ cors: true, timeoutSeconds: 60, memory: "256MiB" }, async (req, res) => {
  try {
    const text = req.query.text;
    const voice = req.query.voice || "zh-TW-YunJheNeural";
    const rate = req.query.rate || "+20%";

    if (!text) {
      res.status(400).send("Missing text parameter");
      return;
    }

    console.log(`[Cloud Functions] Generating TTS for text: "${text}", voice: ${voice}, rate: ${rate}`);

    const tts = new EdgeTTS(text, voice, { rate: rate });

    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(audioBuffer);

  } catch (error) {
    console.error("[Cloud Functions] TTS generation error:", error);
    res.status(500).send("TTS generation failed: " + error.message);
  }
});
