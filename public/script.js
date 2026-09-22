let uploadedContent = "";

async function handleFileSelect() {
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const numQuestionsInput = document.getElementById('numQuestions');

    if (fileInput.files.length === 0) {
        uploadedContent = "";
        fileInfo.style.display = 'none';
        return;
    }

    const file = fileInput.files[0];
    try {
        uploadedContent = await file.text();
        const wordCount = uploadedContent.trim().split(/\s+/).length;
        
        let suggestedCount = 3;
        if (wordCount >= 800) suggestedCount = 10;
        else if (wordCount >= 300) suggestedCount = 8;
        else if (wordCount >= 100) suggestedCount = 5;

        numQuestionsInput.value = suggestedCount;
        fileInfo.style.display = 'block';
        fileInfo.innerHTML = `📄 <strong>Đã nhận diện:</strong> ${file.name} (${wordCount} từ).<br>💡 <strong>Đề xuất:</strong> Tạo <strong>${suggestedCount} câu hỏi</strong> phù hợp với bài.`;
    } catch (e) {
        alert("Lỗi khi đọc file. Vui lòng chọn file văn bản (.txt) hợp lệ.");
    }
}

async function generateQuiz() {
    const topic = document.getElementById('topic').value.trim();
    const numQuestions = document.getElementById('numQuestions').value;
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loading');

    if (!topic && !uploadedContent) {
        alert("Vui lòng nhập chủ đề hoặc tải file tài liệu lên!");
        return;
    }

    btn.disabled = true;
    loading.style.display = 'block';

    try {
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                topic: topic,
                content: uploadedContent,
                numQuestions: numQuestions ? parseInt(numQuestions) : null
            })
        });

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            // Lưu dữ liệu bài thi vào localStorage và mở tab mới
            localStorage.setItem('currentQuizData', JSON.stringify(result.data));
            window.open('/quiz.html', '_blank');
        } else {
            alert("Lỗi từ AI/Server: " + (result.error || "Không thể tạo bài thi"));
        }
    } catch (error) {
        console.error("Lỗi:", error);
        alert("Lỗi kết nối tới server: " + error.message);
    } finally {
        btn.disabled = false;
        loading.style.display = 'none';
    }
}
