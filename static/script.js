// static/script.js

let mediaRecorder;
let audioChunks = [];

const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const playButton = document.getElementById('playButton');
const statusText = document.getElementById('status');
const transcribedTextElement = document.getElementById('transcribedText');
const correctedTextElement = document.getElementById('correctedText');
const explanationText = document.getElementById('explanationText');
const voiceSelect = document.getElementById('voiceSelect');
const languageSelect = document.getElementById('languageSelect');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorAlert = document.getElementById('errorAlert');
const speechRate = document.getElementById('speechRate');
const speechRateValue = document.getElementById('speechRateValue');

let voices = [];
let detectedLanguageCode = 'en'; // Default to English

const languageOptions = [
    { code: 'auto', name: 'Auto Detect' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese'},
    { code: 'zh', name: 'Chinese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ru', name: 'Russian' },
    // Add more languages as needed
];

// Populate language selection dropdown
function populateLanguageList() {
    languageOptions.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        languageSelect.appendChild(option);
    });
}

// Call the function to populate the language list
populateLanguageList();

// Initialize Bootstrap tooltips
const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
});

// Populate the voice list
function populateVoiceList() {
    voices = speechSynthesis.getVoices();

    if (voices.length === 0) {
        setTimeout(populateVoiceList, 100);
        return;
    }

    voiceSelect.innerHTML = '';
    voices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    // Select the voice that matches the detected or selected language
    selectVoiceForLanguage(detectedLanguageCode);
}

// Function to select voice based on language code
function selectVoiceForLanguage(languageCode) {
    // Match the full language code or just the primary language
    let selectedVoice = voices.find(voice => voice.lang.startsWith(languageCode));
    if (selectedVoice) {
        const selectedIndex = voices.indexOf(selectedVoice);
        voiceSelect.selectedIndex = selectedIndex;
    } else {
        // If no voice matches, default to the first voice
        voiceSelect.selectedIndex = 0;
    }
}

// Initial population of voice list
populateVoiceList();

if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Update displayed speech rate when slider is moved
speechRate.addEventListener('input', () => {
    speechRateValue.innerText = speechRate.value;
});

// Function to update status text and color
function updateStatus(message, type) {
    statusText.innerText = message;
    if (type === 'success') {
        statusText.style.color = '#28a745'; // Success green
    } else if (type === 'error') {
        statusText.style.color = '#dc3545'; // Error red
    } else {
        statusText.style.color = '#4a6cf7'; // Primary color
    }
}

// Event listener for Start Recording button
recordButton.addEventListener('click', async () => {
    errorAlert.style.display = 'none';
    audioChunks = [];
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        updateStatus('Microphone access denied.', 'error');
        return;
    }
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.start();
    updateStatus('Recording...', 'default');

    mediaRecorder.addEventListener("dataavailable", event => {
        audioChunks.push(event.data);
    });

    recordButton.disabled = true;
    stopButton.disabled = false;
});

// Event listener for Stop Recording button
stopButton.addEventListener('click', () => {
    mediaRecorder.stop();
    updateStatus('Processing...', 'default');
    loadingSpinner.style.display = 'block'; // Show spinner

    recordButton.disabled = false;
    stopButton.disabled = true;

    mediaRecorder.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        let formData = new FormData();
        formData.append('audio_data', audioBlob, 'recording.webm');

        // Get the selected language
        const selectedLanguage = languageSelect.value;

        // Append the selected language to the form data
        formData.append('language', selectedLanguage);

        fetch('/process_audio', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loadingSpinner.style.display = 'none'; // Hide spinner
            if (data.error) {
                updateStatus('An error occurred.', 'error');
                errorAlert.style.display = 'block';
                console.error('Error:', data.error);
                return;
            }
            updateStatus('Done', 'success');

            transcribedTextElement.innerText = data.transcribed_text;

            // Render the corrected text with Markdown support
            const correctedMarkdown = data.corrected_text;
            const correctedRawHTML = marked.parse(correctedMarkdown);
            const correctedSanitizedHTML = DOMPurify.sanitize(correctedRawHTML);
            correctedTextElement.innerHTML = correctedSanitizedHTML;

            // Render the explanation text with Markdown support
            const explanationMarkdown = data.explanation;
            const explanationRawHTML = marked.parse(explanationMarkdown);
            const explanationSanitizedHTML = DOMPurify.sanitize(explanationRawHTML);
            explanationText.innerHTML = explanationSanitizedHTML;

            // Get the detected language code
            detectedLanguageCode = data.language_code || 'en';

            // Update the voice selection based on the detected or selected language
            selectVoiceForLanguage(detectedLanguageCode);

            playButton.disabled = false; // Enable Play Button
        })
        .catch(error => {
            loadingSpinner.style.display = 'none'; // Hide spinner
            updateStatus('An error occurred.', 'error');
            errorAlert.style.display = 'block';
            console.error('Error:', error);
        });
    });
});

// Event listener for Play Corrected Text button
playButton.addEventListener('click', () => {
    playCorrectedText();
});

// Function to play the corrected text
function playCorrectedText() {
    const correctedText = correctedTextElement.innerText || correctedTextElement.textContent;
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(correctedText);

        const selectedVoiceIndex = voiceSelect.selectedIndex;
        if (voices.length > 0 && selectedVoiceIndex >= 0) {
            utterance.voice = voices[selectedVoiceIndex];
        }

        const rate = parseFloat(speechRate.value);
        utterance.rate = rate;

        utterance.pitch = 1;

        utterance.onerror = function(event) {
            console.error('SpeechSynthesisUtterance.onerror', event);
        };

        speechSynthesis.speak(utterance);
    } else {
        alert('Sorry, your browser does not support text to speech!');
    }
}
