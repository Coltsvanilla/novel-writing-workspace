import { overview } from './overview.js';
import { prose } from './prose.js';
import { characters } from './characters.js';
import { relations } from './relations.js';
import { items } from './items.js';
import { reader } from './reader.js';
import { review } from './review.js';

const VIEWS = { overview, ideas: prose, outline: prose, plot: prose, characters, relations, items, draft: reader, manuscript: reader, review };

/** plot-3 / draft-3 のような章つきの id は種類で引く */
export const viewFor = (docId) => VIEWS[docId.replace(/-\d+$/, '')] ?? null;
