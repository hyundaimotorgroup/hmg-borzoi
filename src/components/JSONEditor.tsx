"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { loader } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import { registerMonacoThemes, useMonacoTheme } from '@/lib/hooks/use-monaco-theme';

loader.config({
  paths: {
    vs: '/monaco/vs',
  },
});

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface JSONEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

export function JSONEditor({ value, onChange, height = "400px" }: JSONEditorProps) {
  const monacoTheme = useMonacoTheme();
  const [error, setError] = useState<string | null>(null);

  const handleEditorChange = (newValue: string | undefined) => {
    const val = newValue || '';
    onChange(val);
    
    if (val.trim()) {
      try {
        JSON.parse(val);
        setError(null);
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } else {
      setError(null);
    }
  };

  const handleEditorWillMount = (monaco: Monaco) => {
    registerMonacoThemes(monaco);
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
      enableSchemaRequest: false
    });
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-2">
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border border-gray-200">
        <MonacoEditor
          height={height}
          language="json"
          theme={monacoTheme}
          value={value}
          onChange={handleEditorChange}
          beforeMount={handleEditorWillMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            wrappingIndent: 'indent',
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: true,
            formatOnType: true,
            suggest: {
              showWords: false,
            },
            quickSuggestions: {
              strings: true
            }
          }}
        />
      </div>
      
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
          <span className="">Invalid JSON:</span> {error}
        </div>
      )}
      
      {!error && value.trim() && (
        <div className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded border border-green-200">
          ✓ Valid JSON
        </div>
      )}
    </div>
  );
}
