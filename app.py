import os
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import fitz  # PyMuPDF for PDF text extraction
import openai
import re  # Ensure this is imported at the top

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Set OpenAI API Key
openai.api_key = ""

# Store chat history
chat_history = []

# Route: Homepage
@app.route("/")
def home():
    return render_template("index.html")

# Route: Upload PDF
@app.route("/upload", methods=["POST"])
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "File must be a PDF"}), 400

    # Save and process PDF
    filename = secure_filename(file.filename)
    filepath = os.path.join("uploads", filename)
    os.makedirs("uploads", exist_ok=True)
    file.save(filepath)

    # Extract text from PDF
    pdf_text = extract_text_from_pdf(filepath)

    return jsonify({"pdf_url": f"/uploads/{filename}", "pdf_text": pdf_text})

# Update the /ask route to include page numbers
@app.route("/ask", methods=["POST"])
def ask_question():
    data = request.json
    question = data.get("question")
    pdf_text = data.get("pdf_text")

    if not question or not pdf_text:
        return jsonify({"error": "Invalid input"}), 400

    # Query OpenAI and extract answer with page numbers
    response = query_openai(question, pdf_text)

    return jsonify({
        "answer": response["answer"],
        "page_numbers": response["page_numbers"]
    })

@app.route("/insight", methods=["POST"])
def quick_insight():
    data = request.json
    insight_type = data.get("insight_type")
    pdf_text = data.get("pdf_text")

    predefined_prompts = {
        "key_findings": "What are the key findings of this research? Please include page numbers.",
        "methodology": "Explain the methodology used in this research. Specify the page numbers.",
        "conclusions": "What are the conclusions drawn from this study? Include the page numbers."
    }

    if insight_type not in predefined_prompts:
        return jsonify({"error": "Invalid insight type"}), 400

    prompt = predefined_prompts[insight_type]
    response = query_openai(prompt, pdf_text)

    return jsonify({
        "answer": response["answer"],
        "page_numbers": response["page_numbers"]
    })

# Helper: Extract text from PDF
def extract_text_from_pdf(filepath):
    text = ""
    with fitz.open(filepath) as pdf:
        for page in pdf:
            text += page.get_text()
    return text

def query_openai(question, context):
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an assistant helping with questions about research papers. "
                    "Always include the page number(s) where the answer can be found, "
                    "and start your answer with the first relevant page number in this format: "
                    "(Page X), where X is the first page number."
                ),
            },
            {
                "role": "user",
                "content": f"Context: {context}\nQuestion: {question}\n\nPlease provide the answer in the requested format.",
            },
        ],
    )
    answer = response.choices[0].message["content"]
    page_match = re.search(r"\(Page (\d+)\)", answer)
    page_number = int(page_match.group(1)) if page_match else None

    return {
        "answer": answer.strip(),
        "page_numbers": [page_number] if page_number else []
    }


# Static file serving for PDF
@app.route("/uploads/<filename>")
def serve_pdf(filename):
    return send_from_directory("uploads", filename)

# Run app
if __name__ == "__main__":
    app.run(debug=True)