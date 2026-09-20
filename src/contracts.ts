import { ensure, keys, record } from './errors.js';
export interface PlanInput { briefing: string; contextId?: string }
export interface ChatInput { messages: { role: 'user' | 'assistant'; content: string }[]; contextId?: string }
function context(value: unknown): { contextId?: string } {
  if (value === undefined) return {};
  ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value), 'contextId inválido');
  return { contextId: value };
}
export function planInput(value: unknown): PlanInput {
  record(value); keys(value, ['briefing', 'contextId']);
  ensure(typeof value.briefing === 'string' && value.briefing.trim().length > 0 && value.briefing.length <= 16000, 'Briefing inválido');
  return { briefing: value.briefing, ...context(value.contextId) };
}
export function chatInput(value: unknown): ChatInput {
  record(value); keys(value, ['messages', 'contextId']);
  ensure(Array.isArray(value.messages) && value.messages.length >= 1 && value.messages.length <= 50, 'Lista de mensagens inválida');
  const messages = value.messages.map((message: unknown): ChatInput['messages'][number] => {
    record(message); keys(message, ['role', 'content']);
    ensure(message.role === 'user' || message.role === 'assistant', 'Papel de mensagem não permitido');
    ensure(typeof message.content === 'string' && message.content.length > 0 && message.content.length <= 16000, 'Conteúdo inválido');
    return { role: message.role, content: message.content };
  });
  ensure(messages.at(-1)?.role === 'user', 'A última mensagem deve ser do usuário');
  return { messages, ...context(value.contextId) };
}
