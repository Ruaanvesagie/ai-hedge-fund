import { useEffect, useState } from 'react';
import {
  API_KEY_STORAGE_KEY,
  clearStoredApiKey,
  getStoredApiKey,
  setStoredApiKey,
} from '@/services/http-client';

export function ApiKeyGate() {
  const [apiKey, setApiKey] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    setShowPrompt(!stored);
  }, []);

  const handleSave = () => {
    if (!inputValue.trim()) {
      setError('API key is required');
      return;
    }
    const value = inputValue.trim();
    setStoredApiKey(value);
    setApiKey(value);
    setInputValue('');
    setShowPrompt(false);
    setError('');
  };

  const handleReset = () => {
    clearStoredApiKey();
    setApiKey('');
    setInputValue('');
    setShowPrompt(true);
  };

  return (
    <>
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Enter API Access Key</h2>
            <p className="mt-2 text-sm text-gray-300">
              Paste the signed key provided for smartkonnect.co.uk. It will be stored locally in your browser.
            </p>
            <input
              className="mt-4 w-full rounded border border-gray-700 bg-gray-800 p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              type="password"
              autoFocus
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                setError('');
              }}
              placeholder="sk_live_..."
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              {apiKey && (
                <button
                  className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:border-gray-400"
                  onClick={() => {
                    setShowPrompt(false);
                    setInputValue('');
                    setError('');
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                onClick={handleSave}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {apiKey && !showPrompt && (
        <button
          className="fixed bottom-4 right-4 z-40 rounded-full border border-indigo-400/50 bg-gray-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-200 shadow-lg backdrop-blur hover:border-indigo-200"
          onClick={() => {
            setShowPrompt(true);
            setInputValue('');
            setError('');
          }}
          title={`Update API key (stored in localStorage as ${API_KEY_STORAGE_KEY})`}
        >
          Update API Key
        </button>
      )}

      {apiKey && showPrompt && (
        <button
          className="fixed bottom-4 left-4 z-40 rounded border border-red-400/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-red-200 hover:border-red-200"
          onClick={handleReset}
        >
          Clear Stored Key
        </button>
      )}
    </>
  );
}
