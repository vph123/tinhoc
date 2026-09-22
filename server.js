require('dotenv').config();

const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Nâng giới hạn kích thước nhận dữ liệu Base64 từ Front-end
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn('⚠️  Chưa thiết lập biến môi trường GEMINI_API_KEY. API sẽ báo lỗi cho tới khi được cấu hình.');
}
const ai = new GoogleGenAI({ apiKey });

// LƯU Ý MODEL:
// - Gói "@google/generative-ai" cũ đã bị Google khai tử (EOL 8/2025) và gọi vào
//   endpoint API cũ, nên MỌI model (kể cả các bản 2.x/3.x còn tồn tại) đều trả 404
//   khi gọi qua gói đó — không phải do tên model.
// - Toàn bộ Gemini 1.0/1.5 đã ngừng hoạt động vĩnh viễn ở phía Google (luôn 404).
// - Đã chuyển sang SDK mới "@google/genai" (SDK chính thức, được khuyến nghị).
// - "gemini-2.5-flash" là bản ổn định (stable), rẻ, nhanh, hỗ trợ đa phương tiện
//   (ảnh, PDF, audio, video) — phù hợp nhất cho việc tạo câu hỏi trắc nghiệm.
//   Có thể đổi qua biến môi trường GEMINI_MODEL nếu muốn dùng bản khác
//   (ví dụ "gemini-3-flash-preview" nếu muốn bản mới hơn, mạnh hơn).
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.post('/api/generate-quiz', async (req, res) => {
    try {
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: "Server chưa được cấu hình GEMINI_API_KEY. Vui lòng thiết lập biến môi trường này."
            });
        }

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
            const wordCount = textToAnalyze.trim().split(/\s+/).filter(Boolean).length;
            if (wordCount < 200) finalNumQuestions = 3;
            else if (wordCount < 500) finalNumQuestions = 4;
            else if (wordCount < 1000) finalNumQuestions = 5;
            else finalNumQuestions = 6;
        } else {
            if (finalNumQuestions < 3) finalNumQuestions = 3;
            if (finalNumQuestions > 6) finalNumQuestions = 6;
        }

        let promptText = `Bạn là một chuyên gia soạn đề thi. Hãy phân tích tài liệu/chủ đề được cung cấp và tạo chính xác ${finalNumQuestions} câu hỏi trắc nghiệm tiếng Anh.`;

        if (topic) promptText += `\nChủ đề: "${topic}"`;
        if (content) promptText += `\nNội dung: "${content}"`;

        promptText += `\n\nYêu cầu BẮT BUỘC:
1. Tạo đúng ${finalNumQuestions} câu hỏi trắc nghiệm (mỗi câu 4 lựa chọn A, B, C, D).
2. Đáp án đúng ("answer") trả về chỉ số kiểu số từ 0 đến 3 (0: A, 1: B, 2: C, 3: D).
3. "explanation" giải thích chi tiết bằng tiếng Việt.`;

        const parts = [];

        // Nếu có file upload (PDF, DOCX, Ảnh, TXT,...)
        if (fileData && fileData.inlineData && fileData.inlineData.data) {
            parts.push({
                inlineData: {
                    data: fileData.inlineData.data,
                    mimeType: fileData.inlineData.mimeType || 'application/octet-stream'
                }
            });
        }

        parts.push({ text: promptText });

        // Ép AI trả về đúng cấu trúc JSON mong muốn (đáng tin cậy hơn việc
        // yêu cầu bằng lời rồi tự cắt chuỗi ```json).
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: 'user', parts }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string' },
                            options: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            answer: { type: 'integer' },
                            explanation: { type: 'string' }
                        },
                        required: ['question', 'options', 'answer', 'explanation']
                    }
                }
            }
        });

        const responseText = (response.text || '').trim();
        if (!responseText) {
            throw new Error('AI không trả về nội dung. Vui lòng thử lại.');
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
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
