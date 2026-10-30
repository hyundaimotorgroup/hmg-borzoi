"use client";

import React from "react";

type TokenType = "comment" | "string" | "system" | "keyword" | "function" | "number" | "plain";

const TOKEN_RE = new RegExp(
  [
    String.raw`(--[^\n]*)`,
    String.raw`('(?:[^'\\]|\\.)*')`,
    String.raw`(system\.\w+)`,
    String.raw`\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|AS|BY|LIMIT|WITH|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|DISTINCT|CASE|WHEN|THEN|ELSE|END|IS|LIKE|ILIKE|INTERVAL|UNION|ALL|EXISTS|BETWEEN|NULL|GROUP|ORDER|USING|SET|INTO|VALUES)\b`,
    String.raw`\b(countIf|avgIf|sumIf|maxIf|minIf|count|avg|sum|max|min|round|ifNull|coalesce|COALESCE|clusterAllReplicas|toDate|toStartOfInterval|toStartOfMinute|toStartOfHour|toStartOfDay|now|formatReadableSize|formatReadableTimeDelta|dateDiff|multiIf|uniq|uniqExact|any|anyLast|quantile|toDateTime|toString|toFloat64|toUInt64|toInt64|arrayJoin|groupArray|greatest|least|IF|ROUND|substring|abs|log|floor|ceil|length|trim|lower|upper|nullIf|trimLeft|trimRight|concat|argMaxIf|minIf|hostName|hostname|toUInt64|COALESCE)\b`,
    String.raw`\b(\d+(?:\.\d+)?)\b`,
  ].join("|"),
  "gi"
);

const TOKEN_STYLES: Record<TokenType, React.CSSProperties> = {
  comment: { color: "var(--sql-comment)", fontStyle: "italic" },
  string: { color: "var(--sql-string)" },
  system: { color: "var(--sql-system)" },
  keyword: { color: "var(--sql-keyword)" },
  function: { color: "var(--sql-function)" },
  number: { color: "var(--sql-number)" },
  plain: { color: "var(--sql-plain)" },
};

function tokenizeSQL(sql: string): Array<{ type: TokenType; value: string }> {
  const result: Array<{ type: TokenType; value: string }> = [];
  let lastIndex = 0;
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "plain", value: sql.slice(lastIndex, match.index) });
    }

    const [full, comment, stringValue, system, keyword, func, num] = match;
    if (comment) result.push({ type: "comment", value: comment });
    else if (stringValue) result.push({ type: "string", value: stringValue });
    else if (system) result.push({ type: "system", value: system });
    else if (keyword) result.push({ type: "keyword", value: keyword });
    else if (func) result.push({ type: "function", value: func });
    else if (num) result.push({ type: "number", value: num });

    lastIndex = match.index + full.length;
  }

  if (lastIndex < sql.length) {
    result.push({ type: "plain", value: sql.slice(lastIndex) });
  }

  return result;
}

export function SQLHighlight({ code }: { code: string }) {
  return (
    <>
      {tokenizeSQL(code).map((token, index) => (
        <span key={index} style={TOKEN_STYLES[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}
