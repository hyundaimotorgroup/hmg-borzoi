{{/*
Expand the name of the chart.
*/}}
{{- define "hmg-borzoi.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name (truncated to 63 chars for DNS naming rules).
*/}}
{{- define "hmg-borzoi.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version for the chart label.
*/}}
{{- define "hmg-borzoi.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "hmg-borzoi.labels" -}}
helm.sh/chart: {{ include "hmg-borzoi.chart" . }}
{{ include "hmg-borzoi.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "hmg-borzoi.selectorLabels" -}}
{{- if .Values.selectorLabels }}
{{- toYaml .Values.selectorLabels }}
{{- else }}
app.kubernetes.io/name: {{ include "hmg-borzoi.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "hmg-borzoi.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "hmg-borzoi.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret that holds database-url / encryption-key / oidc-client-secret.
*/}}
{{- define "hmg-borzoi.secretName" -}}
{{- default (include "hmg-borzoi.fullname" .) .Values.secret.existingSecret }}
{{- end }}

{{/*
Name of the ConfigMap that holds non-sensitive environment variables.
*/}}
{{- define "hmg-borzoi.configMapName" -}}
{{- printf "%s-config" (include "hmg-borzoi.fullname" .) }}
{{- end }}

{{/*
In-cluster PostgreSQL resource name (also used as the headless Service host).
*/}}
{{- define "hmg-borzoi.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "hmg-borzoi.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
In-cluster PostgreSQL selector labels.
*/}}
{{- define "hmg-borzoi.postgresql.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hmg-borzoi.name" . }}-postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the Secret that holds postgres-user / postgres-password.
*/}}
{{- define "hmg-borzoi.postgresql.secretName" -}}
{{- default (include "hmg-borzoi.postgresql.fullname" .) .Values.postgresql.auth.existingSecret }}
{{- end }}

{{/*
Application image reference.
*/}}
{{- define "hmg-borzoi.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}

{{/*
Migration image reference.
*/}}
{{- define "hmg-borzoi.migrationImage" -}}
{{- printf "%s:%s" .Values.migration.image.repository (default .Chart.AppVersion .Values.migration.image.tag) }}
{{- end }}

{{/*
DATABASE_URL written to the chart-managed Secret. An explicit secret.databaseUrl
wins; otherwise it is derived from the in-cluster PostgreSQL settings.
*/}}
{{- define "hmg-borzoi.databaseUrl" -}}
{{- if .Values.secret.databaseUrl }}
{{- .Values.secret.databaseUrl }}
{{- else if .Values.postgresql.enabled }}
{{- $pw := required "postgresql.auth.password is required when postgresql.enabled=true (or set secret.databaseUrl / secret.existingSecret)" .Values.postgresql.auth.password }}
{{- printf "postgresql://%s:%s@%s:5432/%s" (.Values.postgresql.auth.username | urlquery) ($pw | urlquery) (include "hmg-borzoi.postgresql.fullname" .) .Values.postgresql.auth.database }}
{{- else }}
{{- required "secret.databaseUrl is required when postgresql.enabled=false (or set secret.existingSecret)" .Values.secret.databaseUrl }}
{{- end }}
{{- end }}
