import { OutlineApiClient } from '../utils/outline-client.js';

export interface UserContext {
  userId: string;
  email?: string;
  name?: string;
  outlineClient: OutlineApiClient;
}