'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import dynamic from 'next/dynamic';
import { loader } from '@monaco-editor/react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import { logger } from '@/lib/utils/logger';
import { getSqlCompletions, type SqlAutocompleteMetadata } from './sql-autocomplete';
import { registerMonacoThemes, useMonacoTheme } from '@/lib/hooks/use-monaco-theme';

loader.config({
  paths: {
    vs: '/monaco/vs',
  },
});

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => ({ default: mod.Editor })),
  { ssr: false }
);

export interface SQLEditorHandle {
  getSelectedText: () => string | null;
}

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  clusterId?: string;
  clusterName?: string;
  onExecute?: () => void;
  onFormat?: () => void;
  ref?: Ref<SQLEditorHandle>;
}

interface CompletionModel {
  getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
    startColumn: number;
    endColumn: number;
  };
  getLineContent: (lineNumber: number) => string;
}

export function SQLEditor({
  value,
  onChange,
  height = '280px',
  clusterId,
  clusterName,
  onExecute,
  onFormat,
  ref,
}: SQLEditorProps) {
  const monacoTheme = useMonacoTheme();
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [autocompleteMetadata, setAutocompleteMetadata] = useState<SqlAutocompleteMetadata>({
    databases: [],
    tablesByDatabase: {},
  });
  const providerRef = useRef<{ dispose: () => void } | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorInstanceRef = useRef<Parameters<OnMount>[0] | null>(null);
  const onExecuteRef = useRef(onExecute);
  const onFormatRef = useRef(onFormat);

  useImperativeHandle(ref, () => ({
    getSelectedText: () => {
      const editor = editorInstanceRef.current;
      if (!editor) return null;
      const selection = editor.getSelection();
      if (!selection) return null;
      const text = editor.getModel()?.getValueInRange(selection) ?? '';
      return text || null;
    },
  }));

  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onFormatRef.current = onFormat;
  }, [onFormat]);

  useEffect(() => {
    if (!clusterId) {
      setAutocompleteMetadata({ databases: [], tablesByDatabase: {} });
      return;
    }

    const controller = new AbortController();

    async function loadAutocompleteMetadata() {
      try {
        const clusterQuery = clusterName ? `?cluster=${encodeURIComponent(clusterName)}` : '';
        const databaseResponse = await fetch(`/api/clusters/${clusterId}/databases${clusterQuery}`, {
          signal: controller.signal,
        });

        if (!databaseResponse.ok) {
          throw new Error('Failed to fetch databases for autocomplete');
        }

        const databaseData = (await databaseResponse.json()) as {
          databases?: Array<{ name?: string }>;
        };

        const databases = (databaseData.databases || [])
          .map((database) => String(database.name || '').trim())
          .filter(Boolean);

        const tableEntries = await Promise.allSettled(
          databases.map(async (database) => {
            const params = new URLSearchParams();
            params.set('mode', 'names');
            if (clusterName) {
              params.set('cluster', clusterName);
            }

            const tableResponse = await fetch(
              `/api/clusters/${clusterId}/databases/${encodeURIComponent(database)}/tables?${params.toString()}`,
              { signal: controller.signal },
            );

            if (!tableResponse.ok) {
              throw new Error(`Failed to fetch tables for ${database}`);
            }

            const tableData = (await tableResponse.json()) as {
              tables?: Array<{ name?: string }>;
            };

            return [
              database.toLowerCase(),
              (tableData.tables || [])
                .map((table) => String(table.name || '').trim())
                .filter(Boolean),
            ] as const;
          }),
        );

        if (controller.signal.aborted) {
          return;
        }

        const tablesByDatabase = tableEntries.reduce<Record<string, string[]>>((acc, result) => {
          if (result.status === 'fulfilled') {
            const [database, tables] = result.value;
            acc[database] = tables;
          }
          return acc;
        }, {});

        setAutocompleteMetadata({
          databases,
          tablesByDatabase,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }

        logger.error('Failed to load SQL autocomplete metadata:', error);
        setAutocompleteMetadata({ databases: [], tablesByDatabase: {} });
      }
    }

    void loadAutocompleteMetadata();

    return () => controller.abort();
  }, [clusterId, clusterName]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) {
      return;
    }

    providerRef.current?.dispose();
    providerRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' '],
      provideCompletionItems(
        model: CompletionModel,
        position: { lineNumber: number; column: number },
      ) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const suggestions = getSqlCompletions(linePrefix, autocompleteMetadata).map((entry) => ({
          label: entry.label,
          kind:
            entry.kind === 'keyword'
              ? monaco.languages.CompletionItemKind.Keyword
              : entry.kind === 'database'
                ? monaco.languages.CompletionItemKind.Module
                : monaco.languages.CompletionItemKind.Field,
          insertText: entry.insertText ?? entry.label,
          detail: entry.detail,
          sortText: entry.sortText,
          range,
        }));

        return { suggestions };
      },
    });

    return () => {
      providerRef.current?.dispose();
      providerRef.current = null;
    };
  }, [autocompleteMetadata, isEditorReady]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorInstanceRef.current = editor;
    registerMonacoThemes(monaco);
    monacoRef.current = monaco;
    setIsEditorReady(true);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecuteRef.current?.();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      onFormatRef.current?.();
    });
  };

  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
      <MonacoEditor
        height={height}
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v || '')}
        onMount={handleEditorMount}
        loading={
          <div className="flex items-center justify-center bg-gray-50" style={{ height }}>
            <span className="text-sm text-gray-500">Loading editor…</span>
          </div>
        }
        theme={monacoTheme}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          roundedSelection: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          readOnly: false,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          padding: { top: 12, bottom: 12 },
          lineHeight: 22,
          fontFamily: "'JetBrains Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
        }}
      />
    </div>
  );
}
