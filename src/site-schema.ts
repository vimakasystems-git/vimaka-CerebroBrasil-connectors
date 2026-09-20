import { ensure, keys, record } from './errors.js';
export interface Section {
  id: string; type: 'hero' | 'text' | 'cta'; title: string; body?: string;
  link?: { label: string; href: string };
}
export interface SiteSchema {
  version: '1.0'; title: string; locale: 'pt-BR' | 'en-US';
  theme: 'light' | 'dark'; sections: Section[];
}
function text(value: unknown, max: number): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), 'Texto inválido: HTML não é permitido');
}
export function siteSchema(input: unknown): SiteSchema {
  record(input); keys(input, ['version', 'title', 'locale', 'theme', 'sections']);
  ensure(input.version === '1.0', 'Versão de SiteSchema não suportada');
  text(input.title, 200);
  ensure(input.locale === 'pt-BR' || input.locale === 'en-US', 'Locale inválido');
  ensure(input.theme === 'light' || input.theme === 'dark', 'Tema inválido');
  ensure(Array.isArray(input.sections) && input.sections.length > 0 && input.sections.length <= 50, 'Site deve ter 1–50 seções');
  const ids = new Set<string>();
  const sections = input.sections.map((section: unknown): Section => {
    record(section); keys(section, ['id', 'type', 'title', 'body', 'link']);
    ensure(typeof section.id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(section.id) && !ids.has(section.id), 'ID inválido ou duplicado');
    ids.add(section.id);
    ensure(section.type === 'hero' || section.type === 'text' || section.type === 'cta', 'Componente não aprovado');
    text(section.title, 200);
    const result: Section = { id: section.id, type: section.type, title: section.title };
    if (section.body !== undefined) { text(section.body, 5000); result.body = section.body; }
    if (section.link !== undefined) {
      record(section.link); keys(section.link, ['label', 'href']); text(section.link.label, 100);
      ensure(typeof section.link.href === 'string' && section.link.href.length <= 2048 && !/[\s<>\\]/.test(section.link.href), 'Link inválido');
      let url: URL;
      try { url = new URL(section.link.href); } catch { throw new Error('Link absoluto HTTPS obrigatório'); }
      ensure(url.protocol === 'https:' && !url.username && !url.password, 'Link deve usar HTTPS sem credenciais');
      result.link = { label: section.link.label, href: url.href };
    }
    ensure(section.type !== 'cta' || result.link, 'CTA exige link');
    return result;
  });
  return { version: '1.0', title: input.title, locale: input.locale, theme: input.theme, sections };
}
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
/** Pure renderer: approved elements only, no generated code or runtime credentials. */
export function renderSite(value: unknown): string {
  const site = siteSchema(value);
  return `<!doctype html><html lang="${site.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(site.title)}</title></head><body data-theme="${site.theme}"><main>${site.sections.map(section => `<section id="${section.id}" data-component="${section.type}"><h2>${escape(section.title)}</h2>${section.body ? `<p>${escape(section.body)}</p>` : ''}${section.link ? `<a href="${escape(section.link.href)}" rel="noopener noreferrer">${escape(section.link.label)}</a>` : ''}</section>`).join('')}</main></body></html>`;
}
