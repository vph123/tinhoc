(function () {
  const form = document.getElementById("quiz-form");
  const topicEl = document.getElementById("topic");
  const fileInput = document.getElementById("file-input");
  const uploadZone = document.getElementById("upload-zone");
  const fileInfo = document.getElementById("file-info");
  const fileNameEl = document.getElementById("file-name");
  const fileMetaEl = document.getElementById("file-meta");
  const fileRemove = document.getElementById("file-remove");
  const numQuestionsEl = document.getElementById("num-questions");
  const suggestedBadge = document.getElementById("suggested-badge");
  const generateBtn = document.getElementById("generate-btn");
  const statusText = document.getElementById("status-text");

  let selectedFile = null; // { name, size, mimeType, base64 }

  // ---- Suggested question count (mirrors backend Smart Assessment rules) ----
  function suggestCount(wordCount, hasFile) {
    if (hasFile || wordCount >= 800) return 10;
    if (wordCount >= 300) return 8;
    if (wordCount >= 100) return 5;
    return 3;
  }

  function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateSuggestedBadge() {
    const wordCount = countWords(topicEl.value);
    const suggested = suggestCount(wordCount, Boolean(selectedFile));
    if (numQuestionsEl.value) {
      suggestedBadge.textContent = `AI đề xuất: ${suggested} câu (dựa trên nội dung)`;
    } else {
      suggestedBadge.textContent = `Sẽ tự động tạo ${suggested} câu hỏi nếu bạn để trống`;
    }
  }

  topicEl.addEventListener("input", updateSuggestedBadge);
  numQuestionsEl.addEventListener("input", updateSuggestedBadge);
  updateSuggestedBadge();

  // ---- File handling ----
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result; // data:mime;base64,XXXX
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Không thể đọc tệp."));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      selectedFile = {
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        base64,
      };
      fileNameEl.textContent = file.name;
      fileMetaEl.textContent = `${formatSize(file.size)} · AI đề xuất 10 câu hỏi cho tài liệu đính kèm`;
      fileInfo.classList.add("visible");
      updateSuggestedBadge();
    } catch (err) {
      statusText.textContent = "Lỗi khi đọc tệp. Vui lòng thử lại.";
      statusText.classList.add("error");
    }
  }

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "#b8901f";
  });
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.style.borderColor = "";
  });
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "";
    const file = e.dataTransfer.files[0];
    if (file) {
      fileInput.files = e.dataTransfer.files;
      handleFile(file);
    }
  });

  fileInput.addEventListener("change", (e) => {
    handleFile(e.target.files[0]);
  });

  fileRemove.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = "";
    fileInfo.classList.remove("visible");
    updateSuggestedBadge();
  });

  // ---- Submit: generate quiz, hand off to quiz.html via localStorage ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusText.classList.remove("error");

    const topic = topicEl.value.trim();
    if (!topic && !selectedFile) {
      statusText.textContent = "Vui lòng nhập chủ đề hoặc tải lên tài liệu.";
      statusText.classList.add("error");
      return;
    }

    generateBtn.disabled = true;
    statusText.textContent = "Đang tạo đề thi, vui lòng đợi...";

    try {
      const payload = {
        topic,
        numQuestions: numQuestionsEl.value ? Number(numQuestionsEl.value) : null,
      };
      if (selectedFile) {
        payload.file = {
          name: selectedFile.name,
          mimeType: selectedFile.mimeType,
          data: selectedFile.base64,
        };
      }

      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Đã xảy ra lỗi khi tạo đề thi.");
      }

      localStorage.setItem(
        "currentQuizData",
        JSON.stringify({
          questions: data.questions,
          generatedAt: new Date().toISOString(),
          topic: topic || selectedFile?.name || "",
        })
      );

      statusText.classList.remove("error");
      statusText.textContent = `Đã tạo ${data.questions.length} câu hỏi. Đang mở đề thi...`;
      window.open("/quiz.html", "_blank");
    } catch (err) {
      statusText.textContent = err.message || "Đã xảy ra lỗi. Vui lòng thử lại.";
      statusText.classList.add("error");
    } finally {
      generateBtn.disabled = false;
    }
  });
})();
