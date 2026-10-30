// LogCluster — same structure as AuditCluster
export interface LogCluster {
  id: string;
  name: string;
  status?: string;
  environment?: string;
}

// system.errors table
export interface ExecutionError {
  name: string;
  code: number;
  value: number;        // cumulative count
  lastErrorTime: string;
  lastErrorMessage: string;
  remote: boolean;      // whether the error occurred on a remote shard
}

// system.text_log table
export type TextLogLevel = 'Fatal' | 'Critical' | 'Error' | 'Warning' | 'Information' | 'Debug' | 'Trace';

export interface TextLog {
  eventTime: string;
  level: TextLogLevel | string;
  loggerName: string;
  message: string;
  threadName: string;
  queryId: string;
  sourceFile: string;
  sourceLine: number;
  node: string;
}

export interface TextLogPage {
  items: TextLog[];
  total: number;
  page: number;
  pageSize: number;
}

// system.session_log table
export type SessionLogType = 'LoginSuccess' | 'LoginFailure' | 'Logout';

export interface SessionLog {
  eventTime: string;
  type: SessionLogType | string;
  user: string;
  clientAddress: string;
  clientName: string;
  node: string;
  interface: string;      // HTTP | TCP | MySQL
  authType: string;
  failureReason: string;
  sessionId: string;
}

export interface SessionLogPage {
  items: SessionLog[];
  total: number;
  page: number;
  pageSize: number;
}

// system.crash_log table
export interface CrashLog {
  eventTime: string;
  signal: number;
  threadId: number;
  queryId: string;
  traceFull: string;
  version: string;
  revision: number;
  buildId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapExecutionError(e: any): ExecutionError {
  return {
    name: e.name,
    code: Number(e.code) || 0,
    value: Number(e.value) || 0,
    lastErrorTime: e.last_error_time || '',
    lastErrorMessage: e.last_error_message || '',
    remote: e.remote === 1 || e.remote === true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapTextLog(e: any): TextLog {
  return {
    eventTime: e.event_time || '',
    level: e.level || '',
    loggerName: e.logger_name || '',
    message: e.message || '',
    threadName: e.thread_name || '',
    queryId: e.query_id || '',
    sourceFile: e.source_file || '',
    sourceLine: Number(e.source_line) || 0,
    node: e.node || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSessionLog(e: any): SessionLog {
  return {
    eventTime: e.event_time || '',
    type: e.type || '',
    user: e.user || '',
    clientAddress: e.client_address || '',
    clientName: e.client_name || '',
    node: e.node || '',
    interface: e.interface || '',
    authType: e.auth_type || '',
    failureReason: e.failure_reason || '',
    sessionId: e.session_id || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCrashLog(e: any): CrashLog {
  return {
    eventTime: e.event_time || '',
    signal: Number(e.signal) || 0,
    threadId: Number(e.thread_id) || 0,
    queryId: e.query_id || '',
    traceFull: e.trace_full || '',
    version: e.version || '',
    revision: Number(e.revision) || 0,
    buildId: e.build_id || '',
  };
}
