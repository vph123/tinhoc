require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not set in environment variables!");
}
const ai = new GoogleGenAI({ apiKey: apiKey || 'DUMMY_KEY' });

// 1. API: Generate Quiz from uploaded PDF/TXT
app.post('/api/generate-quiz', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Vui lòng tải lên file PDF hoặc TXT!' });
        }

        let extractedText = '';
        const mimeType = req.file.mimetype;
        const filename = req.file.originalname.toLowerCase();

        if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
            const pdfData = await pdfParse(req.file.buffer);
            extractedText = pdfData.text;
        } else {
            extractedText = req.file.buffer.toString('utf-8');
        }

        if (!extractedText.trim()) {
            return res.status(400).json({ error: 'Không thể đọc được nội dung văn bản từ file.' });
        }

        const prompt = `Bạn là một chuyên gia biên soạn đề thi tiếng Anh. Hãy trích xuất hoặc tạo danh sách các câu hỏi trắc nghiệm tiếng Anh từ đoạn văn bản dưới đây.

Yêu cầu định dạng đầu ra:
Trả về BẮT BUỘC dưới dạng một mảng JSON (JSON array) chính xác không chứa mã markdown bọc ngoài hay văn bản thừa nào khác. Mỗi phần tử là 1 đối tượng JSON chứa các trường:
- "id": số thứ tự (bắt đầu từ 1)
- "question": nội dung câu hỏi tiếng Anh
- "options": đối tượng gồm 3 phương án {"A": "...", "B": "...", "C": "..."}
- "answer": đáp án đúng ("A", "B", hoặc "C")
- "explanation": giải thích chi tiết đáp án đúng bằng tiếng Việt ngắn gọn, dễ hiểu

Nội dung tài liệu:
${extractedText.substring(0, 10000)}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const quizData = JSON.parse(response.text);
        res.json({ success: true, quiz: quizData });

    } catch (error) {
        console.error('Lỗi khi tạo bài thi:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi trong quá trình xử lý AI: ' + error.message });
    }
});

// 2. API: Export Vocabulary to Word (.docx)
app.post('/api/export-vocab', async (req, res) => {
    try {
        const { words } = req.body; // Array of strings (words)
        if (!words || !Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ error: 'Danh sách từ vựng không hợp lệ!' });
        }

        const prompt = `Phân tích chi tiết các từ vựng tiếng Anh sau đây: ${words.join(', ')}.

Với mỗi từ, hãy cung cấp thông tin theo cấu trúc JSON array gồm các đối tượng có trường:
- "word": từ tiếng Anh
- "type": loại từ (danh từ, động từ, tính từ, trạng từ, v.v.)
- "ipa": phiên âm IPA
- "meaning": nghĩa tiếng Việt phù hợp nhất
- "usage": cách dùng / ví dụ câu tiếng Anh ngắn gọn kèm dịch nghĩa tiếng Việt.

Yêu cầu trả về BẮT BUỘC định dạng JSON array hợp lệ.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const vocabList = JSON.parse(response.text);

        // Build Word document using docx library
        const docRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Từ vựng", bold: true, color: "FFFFFF" })] })], shading: { fill: "1D4ED8" } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Loại từ", bold: true, color: "FFFFFF" })] })], shading: { fill: "1D4ED8" } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Phiên âm IPA", bold: true, color: "FFFFFF" })] })], shading: { fill: "1D4ED8" } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nghĩa tiếng Việt", bold: true, color: "FFFFFF" })] })], shading: { fill: "1D4ED8" } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Cách dùng & Ví dụ", bold: true, color: "FFFFFF" })] })], shading: { fill: "1D4ED8" } })
                ]
            })
        ];

        vocabList.forEach(item => {
            docRows.push(
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.word || '', bold: true })] })] }),
                        new TableCell({ children: [new Paragraph(item.type || '')] }),
                        new TableCell({ children: [new Paragraph(item.ipa || '')] }),
                        new TableCell({ children: [new Paragraph(item.meaning || '')] }),
                        new TableCell({ children: [new Paragraph(item.usage || '')] })
                    ]
                })
            );
        });

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: "DANH SÁCH TỪ VỰNG TIẾNG ANH BÀI THI",
                        heading: HeadingLevel.HEADING_1,
                        spacing: { after: 300 }
                    }),
                    new Table({
                        rows: docRows,
                        width: { size: 100, type: WidthType.PERCENTAGE }
                    })
                ]
            }]
        });

        const buffer = await Packer.toBuffer(doc);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename=Danh_Sach_Tu_Vung.docx');
        res.send(buffer);

    } catch (error) {
        console.error('Lỗi khi xuất file từ vựng:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi khi tạo file Word: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server đang chạy tại http://0.0.0.0:${PORT}`);
});
