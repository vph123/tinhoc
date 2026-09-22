const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Nâng giới hạn payload lên 50mb để xử lý các file dung lượng lớn (PDF, Ảnh, Audio,...)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/generate-quiz', async (req, res) => {
    try {
        const { topic, content, fileData, numQuestions } = req.body;

        // Kiểm tra xem người dùng có gửi thông tin nào hợp lệ không
        if (!topic && !content && !fileData) {
            return res.status(400).json({ 
                success: false, 
                error: "Không tìm thấy nội dung, chủ đề hoặc file tài liệu để tạo câu hỏi." 
            });
        }

        // Tự động tính số lượng câu hỏi nếu người dùng không nhập
        let finalNumQuestions = parseInt(numQuestions);
        if (!finalNumQuestions || isNaN(finalNumQuestions)) {
            if (fileData) {
                // File đính kèm thường chứa nhiều nội dung -> Mặc định 10 câu
                finalNumQuestions = 10;
            } else {
                const textToAnalyze = content || topic || '';
                const wordCount = textToAnalyze.trim().split(/\s+/).length;
                if (wordCount < 100) finalNumQuestions = 3;
                else if (wordCount < 300) finalNumQuestions = 5;
                else if (wordCount < 800) finalNumQuestions = 8;
                else finalNumQuestions = 10;
            }
        }

        // Sử dụng mô hình gemini-1.5-flash hỗ trợ Multimodal (xử lý file Base64 + Text tốt nhất)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Chuẩn bị Prompt
        let promptText = `Bạn là một chuyên gia soạn đề thi tiếng Anh. Hãy phân tích kỹ dữ liệu tài liệu/chủ đề được cung cấp và tạo ra chính xác ${finalNumQuestions} câu hỏi trắc nghiệm tiếng Anh phù hợp nhất với trình độ và kiến thức có trong bài.`;

        if (topic) promptText += `\nChủ đề: "${topic}"`;
        if (content) promptText += `\nNội dung bổ sung: "${content}"`;

        promptText += `\n\nYêu cầu BẮT BUỘC:
1. Tạo đúng ${finalNumQuestions} câu hỏi trắc nghiệm (mỗi câu 4 lựa chọn A, B, C, D).
2. Câu hỏi phải bao phủ các điểm trọng tâm của nội dung/tài liệu cung cấp.
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

        // Chuẩn bị dữ liệu gửi tới Gemini (chứa cả File và Prompt)
        let contents = [];

        // Nếu có gửi kèm File dạng Base64
        if (fileData && fileData.inlineData) {
            contents.push({
                inlineData: {
                    data: fileData.inlineData.data,
                    mimeType: fileData.inlineData.mimeType
                }
            });
        }

        // Thêm câu lệnh Prompt vào mảng contents
        contents.push(promptText);

        // Gọi Gemini API
        const result = await model.generateContent(contents);
        let responseText = result.response.text().trim();

        // Xử lý làm sạch chuỗi JSON nếu Gemini vô tình bọc trong markdown ```
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
