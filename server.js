const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Nâng giới hạn kích thước nhận dữ liệu Base64 từ Front-end
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { topic, content, fileData, numQuestions } = req.body;

        if (!topic && !content && !fileData) {
            return res.status(400).json({ 
                success: false, 
                error: "Vui lòng cung cấp chủ đề, nội dung hoặc file tài liệu." 
            });
        }

        // Logic tính toán số lượng câu hỏi nằm trong khoảng 3 đến 6 câu
        let finalNumQuestions = parseInt(numQuestions);
        if (!finalNumQuestions || isNaN(finalNumQuestions)) {
            const textToAnalyze = content || topic || '';
            const wordCount = textToAnalyze.trim().split(/\s+/).length;
            if (wordCount < 200) finalNumQuestions = 3;
            else if (wordCount < 500) finalNumQuestions = 4;
            else if (wordCount < 1000) finalNumQuestions = 5;
            else finalNumQuestions = 6;
        } else {
            if (finalNumQuestions < 3) finalNumQuestions = 3;
            if (finalNumQuestions > 6) finalNumQuestions = 6;
        }

        // ĐÃ CẬP NHẬT: Dùng tên model chuẩn "gemini-1.5-flash-latest" hoặc "gemini-2.5-flash" để không bị lỗi 404
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        let promptText = `Bạn là một chuyên gia soạn đề thi. Hãy phân tích tài liệu/chủ đề được cung cấp và tạo chính xác ${finalNumQuestions} câu hỏi trắc nghiệm tiếng Anh.`;

        if (topic) promptText += `\nChủ đề: "${topic}"`;
        if (content) promptText += `\nNội dung: "${content}"`;

        promptText += `\n\nYêu cầu BẮT BUỘC:
1. Tạo đúng ${finalNumQuestions} câu hỏi trắc nghiệm (mỗi câu 4 lựa chọn A, B, C, D).
2. Đáp án đúng ("answer") trả về chỉ số kiểu số từ 0 đến 3 (0: A, 1: B, 2: C, 3: D).
3. "explanation" giải thích chi tiết bằng tiếng Việt.

Khung trả về BẮT BUỘC dạng mảng JSON thuần (không chứa markdown \`\`\`json):
[
  {
    "question": "Nội dung câu hỏi",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "answer": 0,
    "explanation": "Giải thích chi tiết"
  }
]`;

        let contents = [];

        // Nếu có file upload (PDF, DOCX, Ảnh, TXT,...)
        if (fileData && fileData.inlineData) {
            contents.push({
                inlineData: {
                    data: fileData.inlineData.data,
                    mimeType: fileData.inlineData.mimeType
                }
            });
        }

        contents.push(promptText);

        const result = await model.generateContent(contents);
        let responseText = result.response.text().trim();

        // Làm sạch định dạng JSON
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
        console.error("Lỗi Server:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Lỗi khi xử lý tạo đề thi bằng AI." 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
