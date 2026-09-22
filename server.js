const path = require("path");
const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware & payload limits (large base64 documents) ----
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---- Gemini setup ----
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Model priority list — fall back down the list on 503 (overloaded) or 404 (not found)
const MODELS = ["gemini-3.5-flash"]

// ---- Smart Assessment: suggest a question count from word count ----
function suggestQuestionCount(wordCount, hasFile) {
  if (hasFile || wordCount >= 800) return 10;
  if (wordCount >= 300) return 8;
  if (wordCount >= 100) return 5;
  return 3;
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Strip accidental ```json ... ``` fences just in case the model ignores instructions
function cleanJsonText(raw) {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return t.trim();
}

function buildPrompt({ topic, numQuestions }) {
  return `Bạn là một hệ thống tạo đề thi trắc nghiệm tiếng Anh chuyên nghiệp.

Nhiệm vụ: Dựa trên nội dung/chủ đề được cung cấp (văn bản và/hoặc tài liệu đính kèm), hãy tạo ra chính xác ${numQuestions} câu hỏi trắc nghiệm tiếng Anh (multiple choice), mỗi câu có 4 lựa chọn.

Chủ đề / văn bản do người dùng cung cấp:
"""
${topic || "(Không có văn bản, sử dụng nội dung tài liệu đính kèm nếu có)"}
"""

YÊU CẦU BẮT BUỘC VỀ ĐỊNH DẠNG:
- Chỉ trả về DUY NHẤT một mảng JSON thuần (clean JSON array), không kèm bất kỳ văn bản giải thích, tiêu đề, hay markdown code block nào (không dùng \`\`\`json).
- Cấu trúc chính xác từng phần tử:
[
  {
    "question": "Nội dung câu hỏi tiếng Anh",
    "options": ["Lựa chọn A", "Lựa chọn B", "Lựa chọn C", "Lựa chọn D"],
    "answer": 0,
    "explanation": "Giải thích đáp án bằng tiếng Việt"
  }
]
- "answer" là chỉ số số nguyên từ 0 đến 3 (0: A, 1: B, 2: C, 3: D), tương ứng với vị trí đáp án đúng trong mảng "options".
- "explanation" luôn viết bằng tiếng Việt, giải thích ngắn gọn vì sao đáp án đó đúng.
- Câu hỏi phải bằng tiếng Anh, đa dạng (ngữ pháp, từ vựng, đọc hiểu tùy nội dung), độ khó phù hợp với nội dung được cung cấp.
- Tạo đúng ${numQuestions} câu hỏi, không hơn không kém.`;
}

async function callGeminiWithFallback({ promptText, filePart }) {
  let lastError = null;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const parts = [{ text: promptText }];
      if (filePart) {
        parts.push({
          inlineData: {
            data: filePart.data,
            mimeType: filePart.mimeType,
          },
        });
      }

      const result = await model.generateContent(parts);
      const text = result.response.text();
      return { text, modelUsed: modelName };
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.response?.status;
      const message = String(err?.message || "");
      const isOverloaded = status === 503 || /503|overloaded|unavailable/i.test(message);
      const isNotFound = status === 404 || /404|not found/i.test(message);

      if (isOverloaded || isNotFound) {
        // Try the next model in the list
        continue;
      }
      // Non-recoverable error (bad key, bad request, etc.) — stop trying
      throw err;
    }
  }

  throw lastError || new Error("Tất cả các model đều không khả dụng.");
}

app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { topic = "", numQuestions, file } = req.body || {};

    if (!topic.trim() && !file) {
      return res.status(400).json({ error: "Vui lòng nhập chủ đề hoặc tải lên tài liệu." });
    }

    const wordCount = countWords(topic);
    const finalNumQuestions =
      numQuestions && Number.isInteger(Number(numQuestions)) && Number(numQuestions) > 0
        ? Number(numQuestions)
        : suggestQuestionCount(wordCount, Boolean(file));

    const promptText = buildPrompt({ topic, numQuestions: finalNumQuestions });

    const filePart = file && file.data && file.mimeType
      ? { data: file.data, mimeType: file.mimeType }
      : null;

    const { text, modelUsed } = await callGeminiWithFallback({ promptText, filePart });

    let questions;
    try {
      questions = JSON.parse(cleanJsonText(text));
    } catch (parseErr) {
      return res.status(502).json({
        error: "AI trả về dữ liệu không đúng định dạng JSON. Vui lòng thử lại.",
      });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(502).json({ error: "AI không tạo được câu hỏi nào. Vui lòng thử lại." });
    }

    res.json({
      questions,
      numQuestions: finalNumQuestions,
      wordCount,
      modelUsed,
    });
  } catch (err) {
    console.error("Lỗi tạo đề thi:", err);
    res.status(500).json({
      error: "Đã xảy ra lỗi khi tạo đề thi. Vui lòng thử lại sau.",
      detail: err?.message,
    });
  }
});

// Utility endpoint the frontend can call to preview the suggested question count
app.post("/api/suggest-count", (req, res) => {
  const { topic = "", hasFile = false } = req.body || {};
  const wordCount = countWords(topic);
  res.json({ wordCount, suggested: suggestQuestionCount(wordCount, hasFile) });
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
