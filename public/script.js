async function generateQuiz() {
    const topic = document.getElementById('topic').value.trim();
    const numQuestions = document.getElementById('numQuestions').value;
    const btn = document.getElementById('btnGenerate');
    const loading = document.getElementById('loading');
    const container = document.getElementById('quizContainer');

    if (!topic) {
        alert("Vui lòng nhập chủ đề!");
        return;
    }

    btn.disabled = true;
    loading.style.display = 'block';
    container.innerHTML = '';

    try {
        const response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ topic, numQuestions: parseInt(numQuestions) })
        });

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            displayQuiz(result.data);
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

function displayQuiz(questions) {
    const container = document.getElementById('quizContainer');
    let html = '<h3>Bài Thi Của Bạn:</h3>';

    questions.forEach((q, index) => {
        html += `
            <div class="question-card">
                <p><strong>Câu ${index + 1}: ${q.question}</strong></p>
                ${q.options.map((opt, i) => `
                    <div class="option">
                        <label>
                            <input type="radio" name="q${index}" value="${i}">
                            ${opt}
                        </label>
                    </div>
                `).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}
