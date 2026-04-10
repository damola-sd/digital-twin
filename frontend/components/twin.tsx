'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Send, Bot, User } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function Twin() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const [hasAvatar, setHasAvatar] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    useEffect(() => {
        fetch('/avatar.png', { method: 'HEAD' })
            .then(res => setHasAvatar(res.ok))
            .catch(() => setHasAvatar(false));
    }, []);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage.content,
                    session_id: sessionId || undefined,
                }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();

            if (!sessionId) {
                setSessionId(data.session_id);
            }

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const assistantAvatar = (
        <div className="flex-shrink-0 pt-0.5">
            {hasAvatar ? (
                <Image
                    src="/avatar.png"
                    alt=""
                    width={36}
                    height={36}
                    role="presentation"
                    className="h-9 w-9 rounded-full object-cover shadow-md ring-2 ring-white"
                />
            ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 shadow-md ring-2 ring-white">
                    <Bot className="h-4 w-4 text-white" aria-hidden />
                </div>
            )}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5">
            {/* Header — layered gradient + soft glow (CSS only) */}
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 px-5 py-5 text-white">
                <div
                    className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl"
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl"
                    aria-hidden
                />
                <div className="relative flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 shadow-inner ring-1 ring-white/20 backdrop-blur-sm">
                        <Bot className="h-6 w-6 text-cyan-200" aria-hidden />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">AI Digital Twin</h2>
                        <p className="mt-0.5 max-w-sm text-sm leading-relaxed text-slate-300">
                            Your course companion for cloud, Lambda, and shipping real apps.
                        </p>
                    </div>
                </div>
            </header>

            {/* Thread — calm surface, readable line length */}
            <div
                className="min-h-0 flex-1 overflow-y-auto scroll-smooth bg-gradient-to-b from-slate-100/95 to-slate-50 px-4 py-5 sm:px-6"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.12) 1px, transparent 0)`,
                    backgroundSize: '24px 24px',
                }}
            >
                {messages.length === 0 && (
                    <div className="mx-auto mt-6 max-w-md">
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-sm ring-1 ring-slate-900/[0.04] backdrop-blur-sm">
                            <div className="mx-auto mb-4 flex justify-center">
                                {hasAvatar ? (
                                    <Image
                                        src="/avatar.png"
                                        alt="Digital Twin Avatar"
                                        width={88}
                                        height={88}
                                        className="h-[5.5rem] w-[5.5rem] rounded-2xl object-cover shadow-lg ring-4 ring-indigo-50"
                                    />
                                ) : (
                                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg ring-4 ring-indigo-50">
                                        <Bot className="h-10 w-10 text-white" aria-hidden />
                                    </div>
                                )}
                            </div>
                            <p className="text-lg font-medium text-slate-800">{"Hello! I'm your Digital Twin."}</p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                Ask about AWS, Terraform, Bedrock, or anything from the course—we&apos;ll figure it out
                                together.
                            </p>
                        </div>
                    </div>
                )}

                <div className="mx-auto max-w-3xl space-y-5">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && assistantAvatar}

                            <div
                                className={`max-w-[min(100%,28rem)] ${
                                    message.role === 'user'
                                        ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-700 px-4 py-3 text-white shadow-md'
                                        : 'rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-4 py-3 text-slate-800 shadow-sm ring-1 ring-slate-900/[0.03]'
                                }`}
                            >
                                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
                                <p
                                    className={`mt-2 text-xs tabular-nums ${
                                        message.role === 'user' ? 'text-indigo-100/90' : 'text-slate-400'
                                    }`}
                                >
                                    {message.timestamp.toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </p>
                            </div>

                            {message.role === 'user' && (
                                <div className="flex-shrink-0 pt-0.5">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 shadow-md ring-2 ring-white">
                                        <User className="h-4 w-4 text-white" aria-hidden />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start gap-3">
                            {assistantAvatar}
                            <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-slate-200/90 bg-white px-5 py-4 shadow-sm ring-1 ring-slate-900/[0.03]">
                                <span className="sr-only">Assistant is typing</span>
                                <span className="flex gap-1.5" aria-hidden>
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-duration:0.6s]" />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0.12s] [animation-duration:0.6s]" />
                                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.24s] [animation-duration:0.6s]" />
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div ref={messagesEndRef} className="h-px shrink-0" />
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-slate-200/90 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-5">
                <div className="mx-auto flex max-w-3xl gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Message your twin…"
                        className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-5 py-3 text-[15px] text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/25 disabled:opacity-60"
                        disabled={isLoading}
                        autoFocus
                        aria-label="Message input"
                    />
                    <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!input.trim() || isLoading}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-md transition hover:from-indigo-500 hover:to-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                        aria-label="Send message"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
