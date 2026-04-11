const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { prompt, response_json_schema } = await req.json();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL");

  if (!apiKey || !model) {
    return Response.json(
      { error: "Missing GEMINI_API_KEY or GEMINI_MODEL Supabase function secret." },
      { status: 500, headers: corsHeaders },
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: response_json_schema
          ? { responseMimeType: "application/json", responseSchema: response_json_schema }
          : undefined,
      }),
    },
  );

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (response_json_schema) {
    try {
      return Response.json({ response: JSON.parse(text) }, { headers: corsHeaders });
    } catch {
      return Response.json({ response: text }, { headers: corsHeaders });
    }
  }

  return Response.json({ response: text }, { headers: corsHeaders });
});
