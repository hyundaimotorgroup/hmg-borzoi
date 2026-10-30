export type ChannelType = 'slack' | 'email' | 'webhook' | 'teams';
export type TemplateType = 'basic' | 'compact' | 'verbose' | 'custom';

export interface Template {
  name: string;
  description: string;
  template: string | Record<string, unknown>;
}

export interface AvailableVariable {
  name: string;
  description: string;
  example: string;
  channels?: ChannelType[];
}

export const NOTIFICATION_TEMPLATES: Record<ChannelType, Record<TemplateType, Template>> = {
  slack: {
    basic: {
      name: 'Default',
      description: 'Standard format (with table)',
      template: {
        text: '🚨 {{ruleName}}',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '{{ruleName}}'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '{{description}}'
            }
          },
          {
            type: 'divider'
          },
          '{{allRowsSlackBlocks}}',
          {
            type: 'divider'
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Cluster*\n{{clusterName}}' },
              { type: 'mrkdwn', text: '*Severity*\n{{severity}}' },
              { type: 'mrkdwn', text: '*Threshold*\n{{threshold}}' },
              { type: 'mrkdwn', text: '*Timestamp*\n{{timestamp}}' }
            ]
          }
        ]
      }
    },
    compact: {
      name: 'Minimal',
      description: 'Summary only (no table)',
      template: {
        text: '🚨 {{ruleName}} - {{threshold}}',
        blocks: [
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Cluster*\n{{clusterName}}' },
              { type: 'mrkdwn', text: '*Severity*\n{{severity}}' },
              { type: 'mrkdwn', text: '*Threshold*\n{{threshold}}' },
              { type: 'mrkdwn', text: '*Result value*\n{{resultValue}}' },
              { type: 'mrkdwn', text: '*Timestamp*\n{{timestamp}}' }
            ]
          }
        ]
      }
    },
    verbose: {
      name: 'Verbose',
      description: 'All query results included',
      template: {
        text: '🚨 {{ruleName}}',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '{{ruleName}}'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '{{description}}'
            }
          },
          {
            type: 'divider'
          },
          '{{allRowsSlackBlocks}}',
          {
            type: 'divider'
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Cluster*\n{{clusterName}}' },
              { type: 'mrkdwn', text: '*Severity*\n{{severity}}' },
              { type: 'mrkdwn', text: '*Threshold*\n{{threshold}}' },
              { type: 'mrkdwn', text: '*Execution time*\n{{executionTime}}ms' },
              { type: 'mrkdwn', text: '*Timestamp*\n{{timestamp}}' }
            ]
          }
        ]
      }
    },
    custom: {
      name: 'Custom',
      description: 'Custom template',
      template: {
        text: '{{ruleName}}',
        blocks: []
      }
    }
  },

  teams: {
    basic: {
      name: 'Default',
      description: 'Standard format (with table)',
      template: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            bleed: true,
            spacing: 'none',
            items: [
              {
                type: 'ColumnSet',
                columns: [
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      { type: 'TextBlock', text: '🚨 {{ruleName}}', weight: 'bolder', size: 'extraLarge', color: 'attention', wrap: true },
                      { type: 'TextBlock', text: '{{clusterName}}', wrap: true, isSubtle: true, size: 'small', spacing: 'none' },
                    ],
                  },
                  {
                    type: 'Column',
                    width: 'auto',
                    items: [
                      { type: 'TextBlock', text: '{{severity}}', weight: 'bolder', color: 'attention', horizontalAlignment: 'right', wrap: true },
                      { type: 'TextBlock', text: '{{timestamp}}', wrap: true, isSubtle: true, size: 'small', spacing: 'small', horizontalAlignment: 'right' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'Container',
            spacing: 'medium',
            items: [
              { type: 'TextBlock', text: 'Description: {{description}}', wrap: true, isSubtle: true },
              {
                type: 'FactSet',
                spacing: 'medium',
                facts: [
                  { title: 'Severity', value: '{{severity}}' },
                  { title: 'Result value', value: '{{resultValue}}' },
                  { title: 'Condition', value: '{{threshold}}' },
                  { title: 'Execution time', value: '{{executionTimeText}}' },
                ],
              },
            ],
          },
          '{{allRowsTeamsContent}}',
          {
            type: 'Container',
            separator: true,
            spacing: 'medium',
            style: 'emphasis',
            items: [
              {
                type: 'FactSet',
                facts: [
                  { title: 'Cluster', value: '{{clusterName}}' },
                  { title: 'Timestamp', value: '{{timestamp}}' },
                ],
              },
            ],
          }
        ]
      }
    },
    compact: {
      name: 'Minimal',
      description: 'Summary only (no table)',
      template: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            bleed: true,
            spacing: 'none',
            items: [
              { type: 'TextBlock', text: '🚨 {{ruleName}}', weight: 'bolder', size: 'large', color: 'attention', wrap: true },
              { type: 'TextBlock', text: '{{clusterName}}', wrap: true, isSubtle: true, size: 'small', spacing: 'none' },
              { type: 'TextBlock', text: '{{timestamp}}', wrap: true, isSubtle: true, size: 'small', spacing: 'small' },
            ],
          },
          {
            type: 'Container',
            spacing: 'medium',
            items: [
              { type: 'TextBlock', text: 'Description: {{description}}', wrap: true, isSubtle: true },
              {
                type: 'FactSet',
                spacing: 'medium',
                facts: [
                  { title: 'Severity', value: '{{severity}}' },
                  { title: 'Result value', value: '{{resultValue}}' },
                  { title: 'Condition', value: '{{threshold}}' },
                  { title: 'Execution time', value: '{{executionTimeText}}' },
                ],
              },
            ],
          },
        ]
      }
    },
    verbose: {
      name: 'Verbose',
      description: 'All query results included',
      template: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        msteams: { width: 'Full' },
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            bleed: true,
            spacing: 'none',
            items: [
              {
                type: 'ColumnSet',
                columns: [
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      { type: 'TextBlock', text: '🚨 {{ruleName}}', weight: 'bolder', size: 'extraLarge', color: 'attention', wrap: true },
                      { type: 'TextBlock', text: '{{clusterName}}', wrap: true, isSubtle: true, size: 'small', spacing: 'none' },
                    ],
                  },
                  {
                    type: 'Column',
                    width: 'auto',
                    items: [
                      { type: 'TextBlock', text: '{{severity}}', weight: 'bolder', color: 'attention', horizontalAlignment: 'right', wrap: true },
                      { type: 'TextBlock', text: '{{timestamp}}', wrap: true, isSubtle: true, size: 'small', spacing: 'small', horizontalAlignment: 'right' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'Container',
            spacing: 'medium',
            items: [
              { type: 'TextBlock', text: 'Description: {{description}}', wrap: true, isSubtle: true },
              {
                type: 'ColumnSet',
                spacing: 'medium',
                columns: [
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      { type: 'TextBlock', text: 'Severity', weight: 'bolder', size: 'small', isSubtle: true },
                      { type: 'TextBlock', text: '{{severity}}', wrap: true, spacing: 'none', color: 'attention', weight: 'bolder', size: 'default' },
                    ],
                  },
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      { type: 'TextBlock', text: 'Result value', weight: 'bolder', size: 'small', isSubtle: true },
                      { type: 'TextBlock', text: '{{resultValue}}', wrap: true, spacing: 'none', weight: 'bolder', size: 'default' },
                    ],
                  },
                  {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                      { type: 'TextBlock', text: 'Execution time', weight: 'bolder', size: 'small', isSubtle: true },
                      { type: 'TextBlock', text: '{{executionTimeText}}', wrap: true, spacing: 'none', weight: 'bolder', size: 'default' },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'Container',
            separator: true,
            spacing: 'medium',
            items: [
              { type: 'TextBlock', text: 'Matched Results', weight: 'bolder', size: 'medium', color: 'accent', wrap: true },
              { type: 'TextBlock', text: '{{queryResult}}', wrap: true, spacing: 'small', size: 'small', isSubtle: true },
            ],
          },
          {
            type: 'Container',
            separator: true,
            spacing: 'medium',
            items: [
              { type: 'TextBlock', text: 'All Results', weight: 'bolder', size: 'medium', color: 'accent', wrap: true },
              { type: 'TextBlock', text: 'Results that met the threshold are displayed in detail below.', wrap: true, isSubtle: true, size: 'small', spacing: 'none' },
            ],
          },
          '{{allRowsTeamsContent}}',
          {
            type: 'Container',
            separator: true,
            spacing: 'medium',
            style: 'emphasis',
            items: [
              {
                type: 'FactSet',
                facts: [
                  { title: 'Cluster', value: '{{clusterName}}' },
                  { title: 'Severity', value: '{{severity}}' },
                  { title: 'Execution time', value: '{{executionTimeText}}' },
                ],
              },
            ],
          },
        ]
      }
    },
    custom: {
      name: 'Custom',
      description: 'Custom template',
      template: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        msteams: { width: 'Full' },
        body: []
      }
    }
  },

  email: {
    basic: {
      name: 'Default',
      description: 'JSON format (with table)',
      template: {
        subject: '🚨 Alert: {{ruleName}}',
        body: {
          title: '{{ruleName}}',
          description: '{{description}}',
          table: '{{allRowsHtmlTable}}',
          threshold: '{{threshold}}',
          timestamp: '{{timestamp}}'
        }
      }
    },
    compact: {
      name: 'Minimal',
      description: 'Summary only',
      template: {
        subject: '🚨 {{ruleName}}',
        body: {
          title: '{{ruleName}}',
          description: '{{description}}',
          threshold: '{{threshold}}',
          timestamp: '{{timestamp}}'
        }
      }
    },
    verbose: {
      name: 'Verbose',
      description: 'All query results included',
      template: {
        subject: '🚨 Alert: {{ruleName}}',
        body: {
          title: '{{ruleName}}',
          description: '{{description}}',
          table: '{{allRowsHtmlTable}}',
          threshold: '{{threshold}}',
          executionTime: '{{executionTime}}ms',
          timestamp: '{{timestamp}}'
        }
      }
    },
    custom: {
      name: 'Custom',
      description: 'Custom template',
      template: {
        subject: '{{ruleName}}',
        body: {}
      }
    }
  },

  webhook: {
    basic: {
      name: 'Default',
      description: 'JSON format (all rows)',
      template: {
        alert: '{{ruleName}}',
        description: '{{description}}',
        threshold: '{{threshold}}',
        results: '{{allRowsJson}}',
        timestamp: '{{timestamp}}'
      }
    },
    compact: {
      name: 'Minimal',
      description: 'Summary only',
      template: {
        alert: '{{ruleName}}',
        threshold: '{{threshold}}',
        result: '{{queryResult}}',
        timestamp: '{{timestamp}}'
      }
    },
    verbose: {
      name: 'Verbose',
      description: 'All query results included',
      template: {
        alert: '{{ruleName}}',
        description: '{{description}}',
        threshold: '{{threshold}}',
        queryResult: '{{queryResult}}',
        allRows: '{{allRowsJson}}',
        executionTimeMs: '{{executionTime}}',
        timestamp: '{{timestamp}}'
      }
    },
    custom: {
      name: 'Custom',
      description: 'Custom template',
      template: {
        alert: '{{ruleName}}'
      }
    }
  }
};

export const AVAILABLE_VARIABLES: AvailableVariable[] = [
  {
    name: 'ruleName',
    description: 'Alert rule name',
    example: 'CPU usage monitoring'
  },
  {
    name: 'clusterName',
    description: 'Name of the Cluster where the alert occurred',
    example: 'ckc01'
  },
  {
    name: 'severity',
    description: 'Highest matched Severity',
    example: 'warning'
  },
  {
    name: 'description',
    description: 'Rule description',
    example: 'Server CPU usage threshold'
  },
  {
    name: 'queryResult',
    description: 'All columns of the first matching row (object)',
    example: '{hostname: "web-01", cpu: 85}'
  },
  {
    name: 'queryResult.columnName',
    description: 'Specific column value (e.g. {{queryResult.hostname}})',
    example: 'web-01'
  },
  {
    name: 'resultValue',
    description: 'Numeric value from query result (used for threshold comparison)',
    example: '199'
  },
  {
    name: 'threshold',
    description: 'Threshold expression',
    example: '> 80'
  },
  {
    name: 'timestamp',
    description: 'ISO format timestamp',
    example: '2026-03-03T11:15:30.000Z'
  },
  {
    name: 'executionTime',
    description: 'Query execution time (ms)',
    example: '245'
  },
  {
    name: 'executionTimeText',
    description: 'Query execution time display string',
    example: '245ms'
  },
  {
    name: 'allRowsMarkdownTable',
    description: 'All rows as markdown table (all channels)',
    example: '| hostname | cpu |\n|---|---|\n| web-01 | 85 |'
  },
  {
    name: 'allRowsSlackBlocks',
    description: 'Slack Block Kit block array (Slack only)',
    example: '[{type: "section", fields: [...]}]',
    channels: ['slack']
  },
  {
    name: 'allRowsTeamsContent',
    description: 'Content array for Teams inserted into Adaptive Card body',
    example: '[{type: "FactSet", facts: [...]}]',
    channels: ['teams']
  },
  {
    name: 'allRowsHtmlTable',
    description: 'HTML table format (for email)',
    example: '<table><tr><th>hostname</th><th>cpu</th></tr><tr><td>web-01</td><td>85</td></tr></table>',
    channels: ['email']
  },
  {
    name: 'allRowsJson',
    description: 'JSON array format (Webhook)',
    example: '[{hostname: "web-01", cpu: 85}, ...]',
    channels: ['webhook']
  }
];
