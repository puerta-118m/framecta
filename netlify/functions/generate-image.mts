import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { prompt: string; apiKey: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, apiKey } = body;
  if (!prompt || !apiKey) {
    return new Response(JSON.stringify({ error: "Missing prompt or apiKey" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Try Gemini 2.0 Flash (experimental image generation) ──
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Create a storyboard illustration frame. ${prompt}. Widescreen 16:9 cinematic format, high quality, detailed.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: any) =>
        p.inlineData?.mimeType?.startsWith("image/")
      );
      if (imgPart) {
        return new Response(
          JSON.stringify({
            model: "gemini-2.0-flash",
            mimeType: imgPart.inlineData.mimeType,
            data: imgPart.inlineData.data,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      const errBody = await res.json().catch(() => ({}));
      console.warn("Gemini 2.0 Flash failed:", res.status, errBody?.error?.message);
    }
  } catch (e: any) {
    console.warn("Gemini 2.0 Flash exception:", e.message);
  }

  // ── Fallback: Imagen 3 ──
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt: `Storyboard frame: ${prompt}. Cinematic widescreen 16:9 composition.`,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          safetySetting: "block_only_high",
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const pred = data?.predictions?.[0];
      if (pred?.bytesBase64Encoded) {
        return new Response(
          JSON.stringify({
            model: "imagen-3",
            mimeType: "image/png",
            data: pred.bytesBase64Encoded,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      const errBody = await res.json().catch(() => ({}));
      console.warn("Imagen 3 failed:", res.status, errBody?.error?.message);
      return new Response(
        JSON.stringify({ error: errBody?.error?.message ?? `Imagen 3 HTTP ${res.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (e: any) {
    console.warn("Imagen 3 exception:", e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: "Both models failed to return an image" }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
};

export const config: Config = {
  path: "/api/generate-image",
};

