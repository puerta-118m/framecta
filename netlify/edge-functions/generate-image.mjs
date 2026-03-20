export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const { prompt, apiKey } = body;
  if (!prompt || !apiKey) {
    return new Response(JSON.stringify({ error: "Missing prompt or apiKey" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Intento 1: Gemini 2.0 Flash
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Create a storyboard illustration frame. ${prompt}. Widescreen 16:9 cinematic format, high quality.` }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));
      if (imgPart) {
        return new Response(JSON.stringify({ model: "gemini-2.0-flash", mimeType: imgPart.inlineData.mimeType, data: imgPart.inlineData.data }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
    }
  } catch (e) { console.warn("Gemini 2.0 Flash falló:", e.message); }

  // Intento 2: Imagen 3
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: `Storyboard frame: ${prompt}. Cinematic widescreen 16:9.` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9", safetySetting: "block_only_high" },
      }),
    });
    const data = await res.json();
    if (res.ok && data?.predictions?.[0]?.bytesBase64Encoded) {
      return new Response(JSON.stringify({ model: "imagen-3", mimeType: "image/png", data: data.predictions[0].bytesBase64Encoded }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: data?.error?.message ?? `HTTP ${res.status}` }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
};

export const config = {
  path: "/api/generate-image",
};
