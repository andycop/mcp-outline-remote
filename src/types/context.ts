import { OutlineApiClient } from '../utils/outline-client.js';

export interface UserContext {
  userId: string;
  outlineClient: OutlineApiClient;
}