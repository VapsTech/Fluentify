import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
import os
from dotenv import load_dotenv
import whisper
from werkzeug.utils import secure_filename
from pydub import AudioSegment

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
# Initialize the Flask app
app = Flask(__name__)

# Set your OpenAI API key

# Load the Whisper model once when the server starts
model = whisper.load_model("base")

@app.route('/process_audio', methods=['POST'])
def process_audio():
    # Check if an audio file is present in the request
    if 'audio_data' not in request.files:
        return jsonify({'error': 'No audio file provided.'}), 400

    audio_file = request.files['audio_data']
    filename = secure_filename(audio_file.filename)
    upload_folder = 'uploads'
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)
    audio_path = os.path.join(upload_folder, filename)
    audio_file.save(audio_path)

    try:
        # Convert WebM to WAV using pydub
        audio_segment = AudioSegment.from_file(audio_path, format="webm")
        wav_filename = f"{os.path.splitext(filename)[0]}.wav"
        wav_path = os.path.join(upload_folder, wav_filename)
        audio_segment.export(wav_path, format="wav")

        # Get the selected language from the form data
        selected_language = request.form.get('language', 'auto')

        # If the selected language is 'auto', set language to None for auto-detection
        if selected_language == 'auto':
            language = None
        else:
            language = selected_language

        # Transcribe the audio using Whisper with the selected language
        result = model.transcribe(wav_path, language=language)
        transcribed_text = result['text']
        detected_language = result['language']  # Language code, e.g., 'en', 'es'

        # Get the corrected text
        corrected_text = correct_text(transcribed_text)

        # Get the explanation
        explanation = get_explanation(transcribed_text, corrected_text)

    except Exception as e:
        print(f"An error occurred during processing: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up the uploaded files
        if os.path.exists(audio_path):
            os.remove(audio_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)

    return jsonify({
        'transcribed_text': transcribed_text,
        'corrected_text': corrected_text,
        'explanation': explanation,
        'language_code': detected_language
    })

def correct_text(text):
    prompt = f"""Please correct the grammar and punctuation of the following text. Provide only the corrected text and nothing else.
    Remember to NEVER change the original language given in the transcription. For example if the transcription is in Portuguese, the corrected text should also be in Portuguese.

    Text:

    {text}
    """

    response = client.chat.completions.create(model="chatgpt-4o-latest",
    messages=[
        {
            "role": "system",
            "content": "You are an English language tutor who specializes in correcting grammar and pronunciation."
        },
        {"role": "user", "content": prompt}
    ],
    max_tokens=1000,
    temperature=0.7)

    corrected_text = response.choices[0].message.content.strip()
    return corrected_text

def get_explanation(original_text, corrected_text):
    prompt = f"""The following is the original text:

Original Text:
{original_text}

And here is the corrected version:

Corrected Text:
{corrected_text}

Please provide a detailed explanation of the structural errors (excluding punctuations) in the original text and how they were corrected. Explain why the corrections were necessary.

Provide only the explanation and nothing else. Remember to not include punctuation errors because you are criticizing speech and not text, do not even mention punctuation.
In case the transcription is already correct, please mention that the text is already correct.
"""
    response = client.chat.completions.create(model="chatgpt-4o-latest",
                                              messages=[
                                                  {"role": "user", "content": prompt}
                                              ],
                                              max_tokens=1000,
                                              temperature=0.7)

    explanation = response.choices[0].message.content.strip()
    return explanation

# Additional routes and app setup
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
