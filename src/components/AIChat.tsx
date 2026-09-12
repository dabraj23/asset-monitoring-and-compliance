import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { useAssets } from '../context/AssetContext';
import { useVendors } from '../context/VendorContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'model';
  content: string;
}

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'Hello! I am your Asset and Vendor Risk Assistant. How can I help you review fleet, compliance, maintenance, or vendor onboarding risks today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { assets } = useAssets();
  const { vendors } = useVendors();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const context = `
        You are an AI assistant for an Asset and Vendor Compliance system, helping the Chief Risk Officer.
        Here is the current fleet data:
        Assets: ${JSON.stringify(assets)}
        Here is a privacy-limited vendor compliance summary (full identity numbers, hashes and stored files are intentionally excluded):
        Vendors: ${JSON.stringify(vendors.map(vendor => ({
          legalName: vendor.legalName, registrationNumber: vendor.registrationNumber, category: vendor.categoryName,
          status: vendor.onboardingStatus, recommendation: vendor.recommendation, activities: vendor.activityTags,
          requirements: vendor.requirementResults.map(result => ({ name: result.ruleName, scope: result.scope, status: result.status, blocking: result.blocking, expiresAt: result.expiresAt })),
          openFollowUps: vendor.followUps.filter(item => item.status !== 'COMPLETED').length,
        })))}
        
        Answer the user's question concisely and accurately based on this data. Highlight risks, overdue maintenance, vendor follow-ups, or compliance issues. Format your response in Markdown.
      `;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userMessage,
          context: context,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'model', content: data.text || 'Sorry, I could not generate a response.' }]);
    } catch (error: any) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'model', content: `Error: ${error.message || 'Sorry, there was an error communicating with the AI.'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-[#1e3a8a] text-white rounded-full shadow-lg hover:bg-blue-800 transition-all z-50 flex items-center justify-center ${isOpen ? 'scale-0' : 'scale-100'}`}
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat Window */}
      <div 
        className={`fixed bottom-4 right-4 w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all origin-bottom-right z-50 sm:bottom-6 sm:right-6 sm:w-[400px] ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
        style={{ height: '600px', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#1e3a8a] text-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h3 className="font-bold">Risk Assistant</h3>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-blue-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-[#1e3a8a] text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'}`}>
                {msg.role === 'model' ? (
                  <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-100 prose-pre:text-gray-800">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({node, ...props}) => (
                          <div className="overflow-x-auto w-full my-4">
                            <table className="min-w-full" {...props} />
                          </div>
                        )
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#1e3a8a]" />
                <span className="text-xs text-gray-500 font-medium">Analyzing asset and vendor data...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-gray-100 bg-white rounded-b-2xl">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about asset or vendor risks..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 bg-[#1e3a8a] text-white rounded-full hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
