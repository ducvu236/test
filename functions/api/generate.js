const SYSTEM_PROMPT = `Bạn là công cụ chuyển mô tả quy trình thành sơ đồ. Chỉ trả về JSON thuần, không có markdown code fence, không có chữ nào khác ngoài JSON. Schema:
{"nodes":[{"id":"string ngắn duy nhất","label":"string ngắn gọn tiếng Việt","type":"start|end|process|decision|io"}],"edges":[{"source":"id nguồn","target":"id đích","label":"nhãn ngắn, có thể để trống, ví dụ Có/Không cho decision"}]}
Luôn có đúng 1 node type start và thường có ít nhất 1 node type end. Node decision phải có 2 nhánh edge đi ra (ví dụ Có/Không). Giữ label ngắn dưới 6 từ.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return json({ error: "Server chưa cấu hình GEMINI_API_KEY" }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const description = String(body.description || "").slice(0, 4000).trim();
    if (!description) {
      return json({ error: "Thiếu mô tả quy trình" }, 400);
    }

    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiResp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nMô tả quy trình:\n" + description }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    });

    if (!geminiResp.ok) {
      const errText = await geminiResp.text().catch(() => "");
      return json({ error: "Gemini API lỗi: " + geminiResp.status + " " + errText.slice(0, 200) }, 502);
    }

    const data = await geminiResp.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("") : "";

    return json({ text });
  } catch (e) {
    return json({ error: "Lỗi xử lý yêu cầu phía server" }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Chỉ hỗ trợ phương thức POST" }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
