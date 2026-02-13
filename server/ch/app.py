import os
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = Flask(__name__)

client = genai.Client(api_key=os.getenv("AI_API_KEY"))


def ask_ai(msg):
    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=msg
        )
        return response.text
    except Exception as e:
        return f"Error: {e}"


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    user_msg = request.json["message"]
    reply = ask_ai(user_msg)
    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(debug=True)
