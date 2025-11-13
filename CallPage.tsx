
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import type { LiveSession } from '@google/genai';
import { CallStatus, TranscriptMessage } from '../types';
import { decode, decodeAudioData, createPcmBlob } from '../utils/audio';

// Constants for audio processing
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

const CallStatusIndicator: React.FC<{ status: CallStatus }> = ({ status }) => {
  const statusConfig = {
    [CallStatus.IDLE]: { text: 'Ready to start', color: 'bg-gray-500' },
    [CallStatus.CONNECTING]: { text: 'Connecting...', color: 'bg-yellow-500' },
    [CallStatus.ACTIVE]: { text: 'Live Conversation', color: 'bg-green-500' },
    [CallStatus.ERROR]: { text: 'Connection Error', color: 'bg-red-500' },
    [CallStatus.ENDED]: { text: 'Call Ended', color: 'bg-gray-500' },
  };
  const config = statusConfig[status];

  return (
    <div className="flex items-center space-x-2">
      <span className={`w-3 h-3 rounded-full ${config.color} animate-pulse`}></span>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{config.text}</span>
    </div>
  );
};

const TranscriptView: React.FC<{ transcript: TranscriptMessage[] }> = ({ transcript }) => {
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    return (
        <div className="flex-1 w-full p-4 sm:p-6 space-y-4 overflow-y-auto bg-white dark:bg-gray-800 rounded-t-lg">
            {transcript.map((msg, index) => (
                <div key={index} className={`flex items-end gap-3 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.speaker === 'ai' && (
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold flex-shrink-0">AI</div>
                    )}
                    <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl shadow ${msg.speaker === 'user' ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                     {msg.speaker === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold flex-shrink-0">You</div>
                    )}
                </div>
            ))}
            <div ref={endOfMessagesRef} />
        </div>
    );
};


const CallPage: React.FC = () => {
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.IDLE);
    const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const inputTranscriptionRef = useRef('');
    const outputTranscriptionRef = useRef('');
    const nextStartTimeRef = useRef(0);
    const audioSources = useRef(new Set<AudioBufferSourceNode>());

    const cleanup = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        mediaStreamSourceRef.current?.disconnect();
        audioContextRef.current?.close();
        outputAudioContextRef.current?.close();

        streamRef.current = null;
        scriptProcessorRef.current = null;
        mediaStreamSourceRef.current = null;
        audioContextRef.current = null;
        outputAudioContextRef.current = null;
        sessionPromiseRef.current = null;
    }, []);

    const endCall = useCallback(async () => {
        setCallStatus(CallStatus.ENDED);
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error("Error closing session:", e);
            }
        }
        cleanup();
    }, [cleanup]);

    const startCall = useCallback(async () => {
        setCallStatus(CallStatus.CONNECTING);
        setTranscript([{ speaker: 'system', text: 'Starting your Korean lesson... Please allow microphone access.' }]);
        setErrorMessage(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // @ts-ignore
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
            outputAudioContextRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                    systemInstruction: 'You are a friendly and patient Korean language tutor named "Sena". Speak slowly and clearly in Korean, and provide helpful English translations when needed. Keep your responses concise and encourage the user to speak. Start the conversation by saying "안녕하세요! 저는 세나예요. 한국어 연습 시작할까요?".',
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setCallStatus(CallStatus.ACTIVE);
                        setTranscript(prev => [...prev, { speaker: 'system', text: 'Connection successful! You can start speaking now.' }]);

                        const source = audioContextRef.current!.createMediaStreamSource(stream);
                        mediaStreamSourceRef.current = source;
                        
                        const scriptProcessor = audioContextRef.current!.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;
                        
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createPcmBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.outputTranscription) {
                            outputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                        }
                        if (message.serverContent?.inputTranscription) {
                            inputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        }

                        if (message.serverContent?.turnComplete) {
                            const userText = inputTranscriptionRef.current.trim();
                            const aiText = outputTranscriptionRef.current.trim();
                            
                            setTranscript(prev => {
                                let newTranscript = [...prev];
                                if (userText) newTranscript.push({ speaker: 'user', text: userText });
                                if (aiText) newTranscript.push({ speaker: 'ai', text: aiText });
                                return newTranscript;
                            });

                            inputTranscriptionRef.current = '';
                            outputTranscriptionRef.current = '';
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, OUTPUT_SAMPLE_RATE, 1);
                            
                            const currentTime = outputAudioContextRef.current.currentTime;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentTime);

                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            
                            source.addEventListener('ended', () => {
                                audioSources.current.delete(source);
                            });

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSources.current.add(source);
                        }

                        if(message.serverContent?.interrupted){
                             for (const source of audioSources.current.values()) {
                                source.stop();
                                audioSources.current.delete(source);
                            }
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('API Error:', e);
                        setErrorMessage(`An error occurred: ${e.message}. Please try again.`);
                        setCallStatus(CallStatus.ERROR);
                        cleanup();
                    },
                    onclose: () => {
                        setCallStatus(CallStatus.ENDED);
                        cleanup();
                    },
                },
            });

        } catch (error) {
            console.error('Failed to start call:', error);
            setErrorMessage('Could not access microphone. Please check your browser permissions.');
            setCallStatus(CallStatus.ERROR);
            cleanup();
        }
    }, [cleanup]);

    useEffect(() => {
        return () => {
            endCall();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
            <header className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center space-x-3">
                     <svg className="w-8 h-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path><path d="M12 11.5c.827 0 1.5-.673 1.5-1.5V6c0-.827-.673-1.5-1.5-1.5S10.5 5.173 10.5 6v4c0 .827.673 1.5 1.5 1.5z"></path><path d="M13 14h-2v-2h2v2zm-2 2h2v2h-2v-2zm4-4h2v2h-2v-2z"></path>
                    </svg>
                    <h1 className="text-xl font-bold text-gray-800 dark:text-white">Korean AI Tutor</h1>
                </div>
                <CallStatusIndicator status={callStatus} />
            </header>
            <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
                <div className="w-full max-w-4xl h-full flex flex-col bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700">
                    <TranscriptView transcript={transcript} />
                    {errorMessage && <div className="p-4 text-center text-red-500 bg-red-100 dark:bg-red-900/50">{errorMessage}</div>}
                    <div className="flex items-center justify-center p-4 border-t border-gray-200 dark:border-gray-700">
                         {callStatus === CallStatus.IDLE || callStatus === CallStatus.ENDED || callStatus === CallStatus.ERROR ? (
                            <button onClick={startCall} className="flex items-center justify-center w-20 h-20 bg-green-500 text-white rounded-full shadow-lg hover:bg-green-600 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z"/>
                                    <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3z"/>
                                </svg>
                            </button>
                         ) : (
                            <button onClick={endCall} className="flex items-center justify-center w-20 h-20 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M4 1c2.21 0 4 1.755 4 3.92C8 7.392 6.218 9.5 4 9.5S0 7.392 0 5.92C0 3.755 1.79 1 4 1zm-.5 6.512c1.664-1.711 2.214-3.1 2.214-4.512A2.5 2.5 0 0 0 3.5 1.5v.003l-.01.001C1.2 2.7 1.006 4.237 2.256 6.131l1.242.88z"/>
                                    <path d="M16 3.5a1.5 1.5 0 0 1-1.5 1.5h-3.5a1.5 1.5 0 0 1 0-3h3.5A1.5 1.5 0 0 1 16 3.5zM11.5 6.5a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 1 1 0-3h1a1.5 1.5 0 0 1 1.5 1.5zM8.01 11.838c-.495.143-.99.28-1.51.386a11.3 11.3 0 0 0-4.486 1.487 7.3 7.3 0 0 0-1.895 1.638c-.413.413-.413 1.082 0 1.495.413.413 1.082.413 1.495 0 .5-.5.992-1.003 1.46-1.505.743-.743 1.64-1.46 2.65-2.071.393-.232.86-.44 1.353-.608a1.5 1.5 0 0 1 1.142.02c.002.001.003.002.005.003l.001.001c.11.05.22.103.328.16a2.5 2.5 0 0 0 1.252.375c.484 0 .934-.127 1.313-.355a1.5 1.5 0 0 1 1.133.03.5.5 0 0 0 .042.025l.002.001.002.001a1.5 1.5 0 0 1 .923.444c.413.413.413 1.082 0 1.495-.413.413-1.082.413-1.495 0a.5.5 0 0 0-.05-.045s-.001 0-.001-.001a.5.5 0 0 0-.04-.035c-.4-.325-.86-.53-1.35-.53-.29 0-.568.07-.81.196a1.5 1.5 0 0 1-1.12.025.5.5 0 0 0-.044.025l-.001.001-.001.001a1.5 1.5 0 0 1-1.02 1.33 11.3 11.3 0 0 0 5.518 1.47c.622 0 1.22-.053 1.79-.158.413-.075.825-.15 1.228-.228.413-.08.413-1.082 0-1.162-.403-.078-.815-.153-1.228-.228a12.3 12.3 0 0 0-1.79-.158c-1.83-.146-3.633-.48-5.352-.986a.5.5 0 0 0-.16-.035l-.002-.001-.002-.001a.5.5 0 0 0-.17-.03c-.47-.09-.92-.2-1.34-.33a.5.5 0 0 0-.05.025s0 0-.001.001a.5.5 0 0 0-.04.035c-.32.4-.53.86-.53 1.35 0 .29.07.568.196.81.08.15.16.302.24.453a.5.5 0 0 0 .085.118l.001.001.001.001.001.001a.5.5 0 0 0 .118.085c.15.08.302.16.453.24.242.126.52.196.81.196.49 0 .95-.21 1.35-.53.016-.01.03-.02.044-.035a.5.5 0 0 0 .042-.045c.413-.413 1.082-.413 1.495 0 .413.413.413 1.082 0 1.495-.413.413-.413.413-1.495-1.495a.5.5 0 0 0-.085-.118l-.001-.001a2.5 2.5 0 0 0-.453-.24c-.242-.126-.52-.196-.81-.196-.49 0-.95.21-1.35.53a.5.5 0 0 0-.044.035l-.001.001-.001.001a.5.5 0 0 0-.042.045c-.413.413-1.082.413-1.495 0-.413-.413-.413-1.082 0-1.495.32-.32.72-.547 1.17-.678.02-.005.038-.01.057-.015a.5.5 0 0 0 .05-.022l.002-.001.002-.001a.5.5 0 0 0 .044-.035c.15-.08.3-.16.45-.24.24-.126.52-.196.81-.196s.57.07.81.196c.15.08.3.16.45.24a.5.5 0 0 0 .044.035l.002.001.002.001a.5.5 0 0 0 .05.022c.02.005.036.01.057.015.45.13.85.358 1.17.678.413.413 1.082.413 1.495 0 .413-.413.413-1.082 0-1.495-.413-.413-1.082-.413-1.495 0-.016.01-.03.02-.044.035a.5.5 0 0 0-.042.045c-.4.32-.86.53-1.35.53-.29 0-.568-.07-.81-.196a1.5 1.5 0 0 1-1.12-.025.5.5 0 0 0-.044.025l-.001.001a1.5 1.5 0 0 1-1.02-1.33c-.02-.455-.02-1.08 0-1.536a1.5 1.5 0 0 1 1.02-1.33l.001-.001.001-.001a.5.5 0 0 0 .044.025 1.5 1.5 0 0 1 1.12-.025c.242-.126.52-.196.81-.196.49 0 .95.21 1.35.53.016.01.03.02.044.035a.5.5 0 0 0 .042.045c.413.413 1.082.413 1.495 0 .413-.413.413-1.082 0-1.495-.413-.413-1.082-.413-1.495 0-.15.122-.29.255-.42.395-.02.02-.04.04-.06.06a.5.5 0 0 0-.06.08c-.02.02-.04.04-.06.06-.13.14-.26.27-.39.42-.41.41-.83.74-1.26.98-.43.24-.87.39-1.32.45-.62.08-1.25.08-1.88 0-.45-.06-.89-.21-1.32-.45-.43-.24-.85-.57-1.26-.98-.13-.15-.26-.28-.39-.42-.02-.02-.04-.04-.06-.06a.5.5 0 0 0-.06-.08c-.02-.02-.04-.04-.06-.06-.13-.14-.27-.27-.42-.39-.41-.41-.83-.74-1.26-.98-.43-.24-.87-.39-1.32-.45-.62-.08-1.25-.08-1.88 0z"/>
                                </svg>
                            </button>
                         )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CallPage;
