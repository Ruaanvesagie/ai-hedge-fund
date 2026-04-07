import { NodeStatus, OutputNodeData, useNodeContext } from '@/contexts/node-context';
import { Agent } from '@/data/agents';
import { LanguageModel } from '@/data/models';
import { extractBaseAgentKey } from '@/data/node-mappings';
import { flowConnectionManager } from '@/hooks/use-flow-connection';
import { HedgeFundRequest } from '@/services/types';
import { API_BASE_URL, authorizedFetch } from '@/services/http-client';

const jsonHeaders = () => new Headers({ 'Content-Type': 'application/json' });

export const api = {
  getAgents: async (): Promise<Agent[]> => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/hedge-fund/agents`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.agents;
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      throw error;
    }
  },

  getLanguageModels: async (): Promise<LanguageModel[]> => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/language-models/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models;
    } catch (error) {
      console.error('Failed to fetch models:', error);
      throw error;
    }
  },

  saveJsonFile: async (filename: string, data: any): Promise<void> => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/storage/save-json`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ filename, data }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to save JSON file:', error);
      throw error;
    }
  },

  runHedgeFund: (
    params: HedgeFundRequest,
    nodeContext: ReturnType<typeof useNodeContext>,
    flowId: string | null = null,
  ): (() => void) => {
    if (typeof params.tickers === 'string') {
      params.tickers = (params.tickers as unknown as string)
        .split(',')
        .map((t) => t.trim());
    }

    const getAgentIds = () => params.graph_nodes.map((node) => node.id);
    const backendParams = params;

    const controller = new AbortController();
    const { signal } = controller;

    authorizedFetch(`${API_BASE_URL}/hedge-fund/run`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(backendParams),
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

        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

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
                        break;
                      case 'progress':
                        if (eventData.agent) {
                          let nodeStatus: NodeStatus = 'IN_PROGRESS';
                          if (eventData.status === 'Done') {
                            nodeStatus = 'COMPLETE';
                          }
                          const baseAgentKey = eventData.agent.replace('_agent', '');
                          const uniqueNodeId =
                            getAgentIds().find((id) => extractBaseAgentKey(id) === baseAgentKey) ||
                            baseAgentKey;

                          nodeContext.updateAgentNode(flowId, uniqueNodeId, {
                            status: nodeStatus,
                            ticker: eventData.ticker,
                            message: eventData.status,
                            analysis: eventData.analysis,
                            timestamp: eventData.timestamp,
                          });
                        }
                        break;
                      case 'complete':
                        if (eventData.data) {
                          nodeContext.setOutputNodeData(flowId, eventData.data as OutputNodeData);
                        }
                        nodeContext.updateAgentNodes(flowId, getAgentIds(), 'COMPLETE');
                        nodeContext.updateAgentNode(flowId, 'output', {
                          status: 'COMPLETE',
                          message: 'Analysis complete',
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
                        nodeContext.updateAgentNodes(flowId, getAgentIds(), 'ERROR');
                        if (flowId) {
                          flowConnectionManager.setConnection(flowId, {
                            state: 'error',
                            error: eventData.message || 'Unknown error occurred',
                            abortController: null,
                          });
                        }
                        break;
                      default:
                        console.warn('Unknown event type:', eventType);
                    }
                  }
                } catch (err) {
                  console.error('Error parsing SSE event:', err, 'Raw event:', eventText);
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
              console.error('Error reading SSE stream:', error);
              nodeContext.updateAgentNodes(flowId, getAgentIds(), 'ERROR');

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
        if (error.name !== 'AbortError') {
          console.error('SSE connection error:', error);
          nodeContext.updateAgentNodes(flowId, getAgentIds(), 'ERROR');

          if (flowId) {
            flowConnectionManager.setConnection(flowId, {
              state: 'error',
              error: error.message || 'Connection failed',
              abortController: null,
            });
          }
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
