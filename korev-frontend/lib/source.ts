import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { BookOpen, Boxes, Map, Rocket } from 'lucide-react';
import { createElement } from 'react';

const SECTION_ICONS = { BookOpen, Boxes, Map, Rocket };

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  icon(name) {
    if (name && name in SECTION_ICONS) {
      return createElement(SECTION_ICONS[name as keyof typeof SECTION_ICONS]);
    }
  },
});
