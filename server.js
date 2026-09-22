const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { topic, content, numQuestions } = req.body;
        const textToAnalyze = content || topic || '';

        if (!textToAnalyze.trim()) {
            return res.status(400).json({ success: false, error: "Không tìm thấy nội dung hoặc chủ đề để tạo câu hỏi." });
        }

        // Tự động tính số lượng câu hỏi dựa trên dung lượng văn bản nếu người dùng để trống
        let finalNumQuestions = parseInt(numQuestions);
        if (!finalNumQuestions || isNaN(finalNumQuestions)) {
            const wordCount = textToAnalyze.trim().split(/\s+/).length;
            if (wordCount < 100) finalNumQuestions = 3;
            else if (wordCount < 300) finalNumQuestions = 5;
            else if (wordCount < 800) finalNumQuestions = 8;
            else finalNumQuestions = 10;
        }

        // Giữ nguyên phiên bản model gemini-3.6-flash
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

        const prompt = `Bạn là một chuyên gia soạn đề thi tiếng Anh. Hãy phân tích kỹ nội dung/chủ đề dưới đây và tạo ra chính xác ${finalNumQuestions} câu hỏi trắc nghiệm tiếng Anh phù hợp nhất với trình độ và kiến thức có trong bài.

Nội dung/Chủ đề phân tích:
"""
${textToAnalyze}
"""

Yêu cầu BẮT BUỘC:
1. Tạo đúng ${finalNumQuestions} câu hỏi trắc nghiệm (mỗi câu 4 lựa chọn A, B, C, D).
2. Câu hỏi phải bao phủ các điểm trọng tâm của nội dung cung cấp.
3. Đáp án đúng ("answer") chỉ trả về chỉ số kiểu số từ 0 đến 3 (0 tương ứng A, 1: B, 2: C, 3: D).
4. Phần "explanation" phải giải thích chi tiết bằng tiếng Việt lý do chọn đáp án đó.

Khung trả về BẮT BUỘC là mảng JSON thuần túy (không chứa markdown \`\`\`json):
[
  {
    "question": "Nội dung câu hỏi tiếng Anh",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "answer": 0,
    "explanation": "Giải thích chi tiết bằng tiếng Việt"
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
        return res.json({ 
            success: true, 
            data: quizData
        });

    } catch (error) {
        console.error("Lỗi server:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Lỗi khi kết nối tới Gemini AI" 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
