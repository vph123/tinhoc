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

        // Cấu hình model gemini-3.6-flash
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

        const prompt = `Tạo ${numQuestions || 5} câu hỏi trắc nghiệm tiếng Anh về chủ đề: "${topic || 'General English'}".
Khung trả về BẮT BUỘC là dạng mảng JSON thuần túy (không chứa markdown \`\`\`json):
[
  {
    "question": "Nội dung câu hỏi",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "answer": 0,
    "explanation": "Giải thích chi tiết"
  }
]`;

        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();

        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const quizData = JSON.parse(responseText);
        return res.json({ success: true, data: quizData });

    } catch (error) {
        console.error("Lỗi server:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Lỗi khi gọi Gemini API" 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
