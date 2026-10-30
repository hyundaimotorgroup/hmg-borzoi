'use client';

import { useTheme } from 'next-themes';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

const tomorrowTheme: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { background: 'FFFFFF', token: '' },
    { foreground: '8e908c', token: 'comment' },
    { foreground: '666969', token: 'keyword.operator.class' },
    { foreground: '666969', token: 'constant.other' },
    { foreground: 'c82829', token: 'variable' },
    { foreground: 'c82829', token: 'string.regexp' },
    { foreground: 'c82829', token: 'entity.name.tag' },
    { foreground: 'f5871f', token: 'constant.numeric' },
    { foreground: 'f5871f', token: 'constant.language' },
    { foreground: 'f5871f', token: 'support.constant' },
    { foreground: 'f5871f', token: 'variable.parameter' },
    { foreground: 'f5871f', token: 'keyword.other.unit' },
    { foreground: 'c99e00', token: 'entity.name.class' },
    { foreground: 'c99e00', token: 'support.type' },
    { foreground: 'c99e00', token: 'support.class' },
    { foreground: '718c00', token: 'string' },
    { foreground: '718c00', token: 'entity.other.inherited-class' },
    { foreground: '718c00', token: 'markup.heading' },
    { foreground: '3e999f', token: 'keyword.operator' },
    { foreground: '4271ae', token: 'entity.name.function' },
    { foreground: '4271ae', token: 'support.function' },
    { foreground: '8959a8', token: 'keyword' },
    { foreground: '8959a8', token: 'storage' },
    { foreground: '8959a8', token: 'storage.type' },
  ],
  colors: {
    'editor.foreground': '#4D4D4C',
    'editor.background': '#FFFFFF',
    'editor.selectionBackground': '#D6D6D6',
    'editor.lineHighlightBackground': '#EFEFEF',
    'editorCursor.foreground': '#AEAFAD',
    'editorWhitespace.foreground': '#D1D1D1',
  },
};

const tomorrowNightTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { background: '1D1F21', token: '' },
    { foreground: '969896', token: 'comment' },
    { foreground: 'ced1cf', token: 'keyword.operator.class' },
    { foreground: 'ced1cf', token: 'constant.other' },
    { foreground: 'cc6666', token: 'variable' },
    { foreground: 'cc6666', token: 'string.regexp' },
    { foreground: 'cc6666', token: 'entity.name.tag' },
    { foreground: 'de935f', token: 'constant.numeric' },
    { foreground: 'de935f', token: 'constant.language' },
    { foreground: 'de935f', token: 'support.constant' },
    { foreground: 'de935f', token: 'variable.parameter' },
    { foreground: 'de935f', token: 'keyword.other.unit' },
    { foreground: 'f0c674', token: 'entity.name.class' },
    { foreground: 'f0c674', token: 'support.type' },
    { foreground: 'f0c674', token: 'support.class' },
    { foreground: 'b5bd68', token: 'string' },
    { foreground: 'b5bd68', token: 'entity.other.inherited-class' },
    { foreground: 'b5bd68', token: 'markup.heading' },
    { foreground: '8abeb7', token: 'keyword.operator' },
    { foreground: '81a2be', token: 'entity.name.function' },
    { foreground: '81a2be', token: 'support.function' },
    { foreground: 'b294bb', token: 'keyword' },
    { foreground: 'b294bb', token: 'storage' },
    { foreground: 'b294bb', token: 'storage.type' },
  ],
  colors: {
    'editor.foreground': '#C5C8C6',
    'editor.background': '#1D1F21',
    'editor.selectionBackground': '#373B41',
    'editor.lineHighlightBackground': '#282A2E',
    'editorCursor.foreground': '#AEAFAD',
    'editorWhitespace.foreground': '#4B4E55',
  },
};

let registered = false;

export function registerMonacoThemes(monaco: Monaco) {
  if (registered) return;
  registered = true;
  monaco.editor.defineTheme('Tomorrow', tomorrowTheme);
  monaco.editor.defineTheme('Tomorrow-Night', tomorrowNightTheme);
}

export function useMonacoTheme() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? 'Tomorrow-Night' : 'Tomorrow';
}
