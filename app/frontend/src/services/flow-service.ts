import { Flow } from '@/types/flow';
import { API_BASE_URL, authorizedFetch } from '@/services/http-client';

export interface CreateFlowRequest {
  name: string;
  description?: string;
  nodes: any;
  edges: any;
  viewport?: any;
  data?: any;
  is_template?: boolean;
  tags?: string[];
}

export interface UpdateFlowRequest {
  name?: string;
  description?: string;
  nodes?: any;
  edges?: any;
  viewport?: any;
  data?: any;
  is_template?: boolean;
  tags?: string[];
}

const jsonHeaders = () => new Headers({ 'Content-Type': 'application/json' });

export const flowService = {
  async getFlows(): Promise<Flow[]> {
    const response = await authorizedFetch(`${API_BASE_URL}/flows/`);
    if (!response.ok) {
      throw new Error('Failed to fetch flows');
    }
    return response.json();
  },

  async getFlow(id: number): Promise<Flow> {
    const response = await authorizedFetch(`${API_BASE_URL}/flows/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch flow');
    }
    return response.json();
  },

  async createFlow(data: CreateFlowRequest): Promise<Flow> {
    const response = await authorizedFetch(`${API_BASE_URL}/flows/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create flow');
    }
    return response.json();
  },

  async updateFlow(id: number, data: UpdateFlowRequest): Promise<Flow> {
    const response = await authorizedFetch(`${API_BASE_URL}/flows/${id}`, {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update flow');
    }
    return response.json();
  },

  async deleteFlow(id: number): Promise<void> {
    const response = await authorizedFetch(`${API_BASE_URL}/flows/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete flow');
    }
  },

  async duplicateFlow(id: number, newName?: string): Promise<Flow> {
    const url = `${API_BASE_URL}/flows/${id}/duplicate${
      newName ? `?new_name=${encodeURIComponent(newName)}` : ''
    }`;
    const response = await authorizedFetch(url, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to duplicate flow');
    }
    return response.json();
  },

  async createDefaultFlow(nodes: any, edges: any, viewport?: any): Promise<Flow> {
    return this.createFlow({
      name: 'My First Flow',
      description: 'Welcome to AI Hedge Fund! Start building your flow here.',
      nodes,
      edges,
      viewport,
    });
  },
};
