#!/usr/bin/env node
/**
 * Updates docs/vectoriadb/updates.mdx with a new Card component for a release.
 *
 * Usage:
 *   node scripts/update-docs-changelog.mjs --version "v2.0.3" --version-minor "2.0" --card-mdx-file "/tmp/card.mdx"
 *
 * The card-mdx-file should contain a single <Card>...</Card> component.
 */

import fs from 'fs';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    'version-minor': { type: 'string' },
    'card-mdx-file': { type: 'string' },
  },
});

if (!values.version || !values['version-minor'] || !values['card-mdx-file']) {
  console.error(
    'Usage: update-docs-changelog.mjs --version <version> --version-minor <minor> --card-mdx-file <file>'
  );
  process.exit(1);
}

// Read card MDX from file to avoid shell escaping issues
const cardMdx = fs.readFileSync(values['card-mdx-file'], 'utf8').trim();

if (!cardMdx.includes('<Card')) {
  console.error('Error: card-mdx-file must contain a <Card> component');
  process.exit(1);
}

const updatesPath = 'docs/vectoriadb/updates.mdx';
const content = fs.readFileSync(updatesPath, 'utf8');

// Find existing Update block for this minor version or create new one
const versionLabel = `v${values['version-minor']}.x`;
const updateBlockRegex = new RegExp(`<Update label="${versionLabel}"[^>]*>([\\s\\S]*?)</Update>`, 'm');

const match = content.match(updateBlockRegex);
let newContent;

if (match) {
  // Add new Card to existing Update block (insert after opening tag)
  const existingBlock = match[0];
  const openTagEnd = existingBlock.indexOf('>') + 1;
  const newBlock = existingBlock.slice(0, openTagEnd) + '\n  ' + cardMdx + '\n' + existingBlock.slice(openTagEnd);
  newContent = content.replace(existingBlock, newBlock);
} else {
  // Create new Update block after frontmatter
  const frontmatterEndMatch = content.match(/^---[\s\S]*?---/);
  if (!frontmatterEndMatch) {
    console.error('Could not find frontmatter in updates.mdx');
    process.exit(1);
  }

  const frontmatterEnd = frontmatterEndMatch.index + frontmatterEndMatch[0].length;
  const currentDate = new Date();
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const newUpdateBlock = `

<Update label="${versionLabel}" description="${monthYear}" tags={["Releases"]}>
  ${cardMdx}
</Update>
`;
  newContent = content.slice(0, frontmatterEnd) + newUpdateBlock + content.slice(frontmatterEnd);
}

fs.writeFileSync(updatesPath, newContent);
console.log(`Updated ${updatesPath} for ${values.version}`);
