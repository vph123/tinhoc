const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { topic, numQuestions } = req.body;

        // Cấu hình model chuẩn
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Tạo ${numQuestions || 5} câu hỏi trắc nghiệm tiếng Anh về chủ đề: "${topic || 'General English'}".
Trả về dạng JSON array như sau:
[
  {
    "question": "Nội dung câu hỏi",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "answer": 0,
    "explanation": "Giải thích chi tiết"
  }
]`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const quizData = JSON.parse(responseText);

        return res.json({ success: true, data: quizData });

    } catch (error) {
        console.error("Lỗi server:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Lỗi không xác định từ Gemini AI" 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
