const fileInput = document.querySelector(".file-input");
const dropArea = document.getElementById("drop-area");
const pdfIframe = document.getElementById("pdf-iframe");
const questionInput = document.getElementById("question-input");
const answerBox = document.getElementById("answer-box");
const tags = document.querySelectorAll(".tag");
const loader = document.getElementById("loader"); // Loader element
const micBtn = document.getElementById("mic-btn");
const searchBtn = document.getElementById("search-btn");

let chatHistory = [];
let pdfDoc = null; // PDF document object
let pdfText = ""; // Store the extracted text of the uploaded PDF
const pdfViewer = document.getElementById("pdf-viewer");

// Initialize PDF.js
const pdfjsLib = window["pdfjs-dist/build/pdf"];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

const clearPdfBtn = document.getElementById("clear-pdf-btn");

clearPdfBtn.addEventListener("click", () => {
  pdfViewer.innerHTML = ""; // Clear PDF viewer content
  pdfIframe.src = ""; // Clear iframe source
  pdfText = ""; // Clear extracted PDF text
  pdfDoc = null; // Clear loaded PDF document
});

const downloadBtn = document.getElementById("download-btn");

downloadBtn.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Set title
  doc.setFontSize(16);
  doc.text("Research Paper Q&A", 10, 10);

  // Add chat history to the PDF
  let yOffset = 20; // Y-axis offset for text placement
  const lineHeight = 10; // Adjust line spacing

  chatHistory.forEach((chat, index) => {
    const question = `Q${index + 1}: ${chat.question}`;
    const answer = `A${index + 1}: ${chat.answer}`;
    const pageInfo =
      chat.pageNumbers && chat.pageNumbers.length
        ? ` (Page(s): ${chat.pageNumbers.join(", ")})`
        : "";

    // Split long text into multiple lines
    const splitQuestion = doc.splitTextToSize(question, 180);
    const splitAnswer = doc.splitTextToSize(answer + pageInfo, 180);

    doc.setFontSize(12);
    splitQuestion.forEach((line) => {
      doc.text(line, 10, yOffset);
      yOffset += lineHeight;
    });

    splitAnswer.forEach((line) => {
      doc.text(line, 10, yOffset);
      yOffset += lineHeight;
    });

    // Create a new page if text exceeds the page height
    if (yOffset > 270) {
      doc.addPage();
      yOffset = 10;
    }
  });


  // Save the PDF
  doc.save("Research_QA.pdf");
});

// Drag-and-Drop Handlers
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  console.log(file); // Check the file object in the console
  if (file && file.type === "application/pdf") {
    await handleFileUpload(file);
  } else {
    alert("Please upload a valid PDF file!");
  }
});

// File Browse Handler
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (file) {
    await handleFileUpload(file);
  }
});

// Handle File Upload
async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Failed to upload PDF!");

    const data = await response.json();
    pdfText = data.pdf_text;
    chatHistory = []; // Clear chat history on new upload
    renderChatHistory(); // Clear UI history
    loadPdf(data.pdf_url);
  } catch (error) {
    alert(error.message);
    console.error(error);
  }
}


// Load and Render PDF
async function loadPdf(pdfUrl) {
  const loadingTask = pdfjsLib.getDocument(pdfUrl);
  pdfDoc = await loadingTask.promise;
  renderAllPages();
}

// Render All Pages
function renderAllPages() {
  pdfViewer.innerHTML = ""; // Clear previous content
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    renderPage(pageNum);
  }
}

function renderPage(pageNum) {
  pdfDoc.getPage(pageNum).then((page) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Calculate the viewport with a scale of 1.5 and set max width for responsiveness
    const scale = 0.8;
    const viewport = page.getViewport({ scale });

    // Set the canvas height and width to the viewport size
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Constrain the canvas to the container's width and adjust the height accordingly
    const pdfViewerWidth = pdfViewer.clientWidth;
    if (canvas.width > pdfViewerWidth) {
      const scalingFactor = pdfViewerWidth / canvas.width;
      canvas.width = pdfViewerWidth;
      canvas.height *= scalingFactor; // Adjust height according to width change
    }

    pdfViewer.appendChild(canvas);

    page.render({ canvasContext: ctx, viewport });
  });
}

// Navigate to a Specific Page
function scrollToPage(pageNum) {
  const canvasList = pdfViewer.getElementsByTagName("canvas");
  if (pageNum > 0 && pageNum <= canvasList.length) {
    const targetCanvas = canvasList[pageNum - 1];
    pdfViewer.scrollTo({
      top: targetCanvas.offsetTop,
      behavior: "smooth",
    });
  } else {
    alert("Page number out of range!");
  }
}

// Modify submitQuestion function
// Submit Question and Fetch Answer
function submitQuestion(question) {
  if (!question) {
    alert("Please enter a question!");
    return;
  }

  toggleLoading(true);

  fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, pdf_text: pdfText }),
  })
    .then((response) => response.json())
    .then((data) => {
      toggleLoading(false);

      const pageNumbers = data.page_numbers || [];
      chatHistory.push({
        question,
        answer: data.answer,
        pageNumbers,
      });

      renderChatHistory();

      if (pageNumbers.length > 0) {
        scrollToPage(pageNumbers[0]); // Scroll to the first page
      }
    })
    .catch((error) => {
      toggleLoading(false);
      alert("Failed to get answer!");
      console.error("Error:", error);
    });
}

// Update Chat History
function renderChatHistory() {
  answerBox.innerHTML = chatHistory
    .map((chat) => {
      const pageInfo =
        chat.pageNumbers && chat.pageNumbers.length
          ? ` (Page ${chat.pageNumbers.join(", ")})`
          : "";
      return `
        <div class="chat-message">
          <p><b>Q:</b> ${chat.question}</p>
          <p><b>A:</b> ${chat.answer}${pageInfo}</p>
        </div>
      `;
    })
    .join("");

  answerBox.scrollTop = answerBox.scrollHeight;
}


// Search button click handler
searchBtn.addEventListener("click", () => {
  const question = questionInput.value.trim();
  submitQuestion(question);
});

// Handle Enter Key Press for Question Submission
questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const question = questionInput.value.trim();
    submitQuestion(question);
  }
});

// Voice-to-Text (Microphone) Feature
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;

  micBtn.addEventListener("click", () => {
    recognition.start();
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    questionInput.value = transcript;
  };

  recognition.onerror = (event) => {
    console.error("Error with speech recognition: ", event.error);
  };
}

// Quick Insights Click Handler
tags.forEach((tag) =>
  tag.addEventListener("click", async (e) => {
    const insightType = e.target.dataset.insight;

    toggleLoading(true); // Show loading animation and disable input

    try {
      const response = await fetch("/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight_type: insightType, pdf_text: pdfText }),
      });

      if (!response.ok) throw new Error("Failed to fetch insight!");

      const data = await response.json();
      chatHistory.push({
        question: `Insight: ${insightType}`,
        answer: data.answer,
        pageNumbers: data.page_numbers || [],
      });
      renderChatHistory();
    } catch (error) {
      alert(error.message);
      console.error(error);
    } finally {
      toggleLoading(false); // Hide loading animation
    }
  })
);


// Show or Hide Loading Animation
function toggleLoading(isLoading) {
  loader.style.display = isLoading ? "block" : "none";
  questionInput.disabled = isLoading; // Disable/Enable input
}
