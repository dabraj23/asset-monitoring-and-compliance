import React, { useState, useEffect } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIComplianceTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  complianceTask: string | null;
}

export function AIComplianceTaskModal({ isOpen, onClose, complianceTask }: AIComplianceTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (isOpen && complianceTask) {
      generateTasks(complianceTask);
    } else {
      setContent('');
    }
  }, [isOpen, complianceTask]);

  const generateTasks = async (task: string) => {
    setLoading(true);
    setContent('');
    try {
      const response = await fetch('/api/compliance-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate compliance tasks');
      }

      const data = await response.json();
      setContent(data.text || 'No response generated.');
    } catch (error: any) {
      console.error('AI Error:', error);
      setContent(`Error: ${error.message || 'Failed to generate compliance tasks. Please try again later.'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-[#1e3a8a] text-white rounded-t-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <h3 className="font-bold">AI Compliance Action Plan</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-blue-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
              <p className="text-gray-500 font-medium">Generating action plan...</p>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:text-[#1e3a8a] prose-a:text-blue-600">
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
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
