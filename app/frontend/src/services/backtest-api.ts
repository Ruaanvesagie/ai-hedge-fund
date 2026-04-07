import { NodeStatus, useNodeContext } from '@/contexts/node-context';
import { extractBaseAgentKey } from '@/data/node-mappings';
import { flowConnectionManager } from '@/hooks/use-flow-connection';
import { BacktestDayResult, BacktestPerformanceMetrics, BacktestRequest } from '@/services/types';
import { API_BASE_URL, authorizedFetch } from '@/services/http-client';

const jsonHeaders = () => new Headers({ 'Content-Type': 'application/json' });

export const backtestApi = {
  runBacktest: (
    params: BacktestRequest,
    nodeContext: ReturnType<typeof useNodeContext>,
    flowId: string | null = null,
  ): (() => void) => {
    const controller = new AbortController();
    const { signal } = controller;

    authorizedFetch(`${API_BASE_URL}/hedge-fund/backtest`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(params),
      signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let backtestResults: any[] = [];

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';

              for (const eventText of events) {
                if (!eventText.trim()) continue;

                try {
                  const eventTypeMatch = eventText.match(/^event: (.+)$/m);
                  const dataMatch = eventText.match(/^data: (.+)$/m);

                  if (eventTypeMatch && dataMatch) {
                    const eventType = eventTypeMatch[1];
                    const eventData = JSON.parse(dataMatch[1]);

                    switch (eventType) {
                      case 'start':
                        nodeContext.resetAllNodes(flowId);
                        backtestResults = [];
                        nodeContext.updateAgentNode(flowId, 'backtest', {
                          status: 'IN_PROGRESS',
                          message: 'Starting backtest...',
                          backtestResults: [],
                        });
                        break;
                      case 'progress':
                        if (eventData.agent && eventData.agent !== 'backtest') {
                          let nodeStatus: NodeStatus = 'IN_PROGRESS';
                          if (eventData.status === 'Done') {
                            nodeStatus = 'COMPLETE';
                          }
                          const agentIds = params.graph_nodes.map((node) => node.id);
                          const baseAgentKey = eventData.agent.replace('_agent', '');
                          const uniqueNodeId =
                            agentIds.find((id) => extractBaseAgentKey(id) === baseAgentKey) ||
                            baseAgentKey;

                          nodeContext.updateAgentNode(flowId, uniqueNodeId, {
                            status: nodeStatus,
                            ticker: eventData.ticker,
                            message: eventData.status,
                            analysis: eventData.analysis,
                            timestamp: eventData.timestamp,
                          });
                        } else if (eventData.agent === 'backtest') {
                          if (eventData.analysis) {
                            try {
                              const resultData = JSON.parse(eventData.analysis);
                              backtestResults = [...backtestResults, resultData].slice(-50);
                            } catch (error) {
                              console.error('Error parsing backtest result data:', error);
                            }
                          }
                          nodeContext.updateAgentNode(flowId, 'backtest', {
                            status: 'IN_PROGRESS',
                            message: eventData.status,
                            backtestResults,
                          });
                        }
                        break;
                      case 'complete':
                        if (eventData.data) {
                          const results = {
                            decisions: { backtest: { type: 'backtest_complete' } },
                            analyst_signals: {},
                            performance_metrics: eventData.data.performance_metrics,
                            final_portfolio: eventData.data.final_portfolio,
                            total_days: eventData.data.total_days,
                          };
                          nodeContext.setOutputNodeData(flowId, results);
                        }
                        nodeContext.updateAgentNode(flowId, 'backtest', {
                          status: 'COMPLETE',
                          message: 'Backtest completed successfully',
                        });
                        nodeContext.updateAgentNode(flowId, 'output', {
                          status: 'COMPLETE',
                          message: 'Backtest analysis complete',
                        });

                        if (flowId) {
                          flowConnectionManager.setConnection(flowId, {
                            state: 'completed',
                            abortController: null,
                          });
                          setTimeout(() => {
                            const currentConnection = flowConnectionManager.getConnection(flowId);
                            if (currentConnection.state === 'completed') {
                              flowConnectionManager.setConnection(flowId, { state: 'idle' });
                            }
                          }, 30000);
                        }
                        break;
                      case 'error':
                        nodeContext.updateAgentNode(flowId, 'portfolio-start', {
                          status: 'ERROR',
                          message: eventData.message || 'Backtest failed',
                        });
                        if (flowId) {
                          flowConnectionManager.setConnection(flowId, {
                            state: 'error',
                            error: eventData.message || 'Unknown error occurred',
                            abortController: null,
                          });
                        }
                        break;
                      default:
                        console.warn('Unknown backtest event type:', eventType);
                    }
                  }
                } catch (err) {
                  console.error('Error parsing backtest SSE event:', err, 'Raw event:', eventText);
                }
              }
            }

            if (flowId) {
              const currentConnection = flowConnectionManager.getConnection(flowId);
              if (currentConnection.state === 'connected') {
                flowConnectionManager.setConnection(flowId, {
                  state: 'completed',
                  abortController: null,
                });
              }
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              console.error('Error reading backtest SSE stream:', error);
              nodeContext.updateAgentNode(flowId, 'portfolio-start', {
                status: 'ERROR',
                message: 'Connection error during backtest',
              });
              if (flowId) {
                flowConnectionManager.setConnection(flowId, {
                  state: 'error',
                  error: error.message || 'Connection error',
                  abortController: null,
                });
              }
            }
          }
        };

        processStream();
      })
      .catch((error: any) => {
        console.error('Backtest SSE connection error:', error);
        nodeContext.updateAgentNode(flowId, 'portfolio-start', {
          status: 'ERROR',
          message: 'Failed to connect to backtest service',
        });
        if (flowId) {
          flowConnectionManager.setConnection(flowId, {
            state: 'error',
            error: error.message || 'Connection failed',
            abortController: null,
          });
        }
      });

    return () => {
      controller.abort();
      if (flowId) {
        flowConnectionManager.setConnection(flowId, {
          state: 'idle',
          abortController: null,
        });
      }
    };
  },
};

export type { BacktestDayResult, BacktestPerformanceMetrics, BacktestRequest };
