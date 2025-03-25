import React, { useState, useRef } from 'react';
import { Mic, Speaker, Square } from 'lucide-react';

const API_KEY = 'YOUR_API_KEY_HERE';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const convertSpeechToText = async (audioBlob: Blob): Promise<string> => {
    // Convert audio to base64
    const buffer = await audioBlob.arrayBuffer();
    const base64Audio = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const requestBody = {
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        audioChannelCount: 1,
        languageCode: 'en-US',
        model: 'default',
      },
      audio: {
        content: base64Audio,
      },
    };

    try {
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Speech API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      if (!data.results || data.results.length === 0) {
        throw new Error('No transcription results received');
      }
      return data.results[0].alternatives[0].transcript || '';
    } catch (error) {
      console.error('Speech-to-Text Error:', error);
      throw new Error('Failed to convert speech to text');
    }
  };

  const getGeminiResponse = async (text: string): Promise<string> => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Respond to this in a natural, spoken manner. Minimize use of numbering, unless absolutely needed. ${text}`
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error('Failed to get AI response');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
        }
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      audioChunksRef.current = [];
      setError(null);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        try {
          setIsProcessing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          const text = await convertSpeechToText(audioBlob);
          console.log('Transcribed text:', text);
          
          if (!text) {
            throw new Error('No text was transcribed from the audio');
          }
          
          const aiResponse = await getGeminiResponse(text);
          console.log('AI Response:', aiResponse);
          
          setIsPlaying(true);
          speak(aiResponse);
        } catch (error) {
          console.error('Processing Error:', error);
          setError('Sorry, there was an error processing your request. Please try again.');
          setIsPlaying(false);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError('Unable to access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      setError('Error playing audio response');
    };
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsPlaying(false);
  };

  const handleButtonClick = () => {
    if (isPlaying) {
      stopSpeaking();
    } else if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const buttonColor = isRecording ? 'bg-red-500' : isPlaying ? 'bg-green-500' : 'bg-blue-500';
  const buttonAnimation = isProcessing ? 'animate-pulse' : '';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        <h1 className="text-4xl font-bold text-gray-800 text-center">Voice Assistant</h1>
        <button
          onClick={handleButtonClick}
          className={`${buttonColor} ${buttonAnimation} hover:opacity-90 transition-all duration-200 w-32 h-32 rounded-full flex items-center justify-center shadow-lg`}
          aria-label={isPlaying ? 'Stop Response' : isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isPlaying ? (
            <Square className="w-16 h-16 text-white" />
          ) : isRecording ? (
            <Mic className="w-16 h-16 text-white" />
          ) : (
            <Speaker className="w-16 h-16 text-white" />
          )}
        </button>
        <p className="text-xl text-gray-600 text-center">
          {isProcessing ? 'Processing...' : isRecording ? 'Listening...' : isPlaying ? 'Speaking... (click to stop)' : 'Press to speak'}
        </p>
        {error && (
          <p className="text-red-500 text-center bg-red-100 p-4 rounded-lg">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
