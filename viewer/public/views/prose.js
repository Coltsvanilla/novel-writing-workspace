import { html } from '../lib/html.js';
import { markdown } from '../lib/markdown.js';

export const prose = {
  render: ({ file }) => html`<article class="prose">${markdown(file.text, { dropTitle: true })}</article>`,
};
